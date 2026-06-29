import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';
import { asyncHandler } from '../utils/async-handler';

// Generic Zod validation middleware factory.
// Parses body, params, and query through the provided schema, replaces the
// request fields with coerced/transformed values (e.g. trimmed strings,
// lowercased emails), and forwards ZodErrors to the global error handler.
export const validate = (schema: AnyZodObject) =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const result = await schema.parseAsync({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    // Replace raw values with coerced/transformed ones from Zod
    if (result.body !== undefined) req.body = result.body;
    if (result.params !== undefined) req.params = result.params;
    if (result.query !== undefined) req.query = result.query;

    next();
  });
