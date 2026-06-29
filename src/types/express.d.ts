import { JwtPayload } from '../utils/jwt';

// Augment Express's Request type so TypeScript knows about req.user
// after the auth middleware has verified the JWT.
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
