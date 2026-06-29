import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  stack?: string;
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Four cases are handled in order of specificity:
//   1. ZodError     → validation failure (422) with per-field breakdown
//   2. MulterError  → file upload failure (413 for oversized, 400 for others)
//   3. AppError     → known operational error, use its statusCode
//   4. Unknown      → programming bug (500); details hidden in production
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction, // 4-param signature required for Express to treat as error handler
): void => {
  logger.error(
    { err, method: req.method, url: req.url, requestId: req.headers['x-request-id'] },
    'Request error',
  );

  // 1. Zod validation errors
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    err.errors.forEach((issue) => {
      // path[0] is 'body'|'params'|'query' — strip it for cleaner client messages
      const field = issue.path.slice(1).join('.') || 'value';
      (fieldErrors[field] ??= []).push(issue.message);
    });

    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: fieldErrors,
    } satisfies ApiErrorResponse);
    return;
  }

  // 2. Multer errors (file size, unexpected field, etc.)
  if (err instanceof multer.MulterError) {
    const statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File too large. Maximum allowed size is ${env.MAX_FILE_SIZE_MB} MB.`
        : `File upload error: ${err.message}`;

    res.status(statusCode).json({ success: false, message } satisfies ApiErrorResponse);
    return;
  }

  // 3. Known operational errors (ValidationError, NotFoundError, etc.)
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
    } satisfies ApiErrorResponse);
    return;
  }

  // 4. Unexpected error — never leak internals in production
  res.status(500).json({
    success: false,
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  } satisfies ApiErrorResponse);
};

// ─── 404 Handler ─────────────────────────────────────────────────────────────
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Cannot ${req.method} ${req.url}`, 404));
};
