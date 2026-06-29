import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticationError } from './errors';

export interface JwtPayload {
  userId: string;
  email: string;
}

export const signToken = (payload: JwtPayload): string => {
  // Cast to `any` to bridge the gap between Zod's `string` type and
  // jsonwebtoken's internal `StringValue` branded type for expiresIn.
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    // Collapse TokenExpiredError / JsonWebTokenError / NotBeforeError
    // into a single 401 so callers don't need to handle jwt internals.
    throw new AuthenticationError('Invalid or expired token');
  }
};
