import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AuthenticationError } from '../utils/errors';

// JWT bearer token guard. Attach this to any route or router that requires
// an authenticated user. After this middleware runs, req.user is guaranteed
// to be set for the rest of the request lifecycle.
export const protect = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError('No bearer token provided'));
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
};
