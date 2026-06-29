import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { signToken } from '../utils/jwt';
import { ConflictError, AuthenticationError, ForbiddenError, NotFoundError } from '../utils/errors';
import { RegisterInput, LoginInput } from '../validators/auth.validator';
import { emailVerificationService, VerificationEmailResult } from './email-verification.service';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
}

export interface RegisterResult {
  requiresVerification: true;
  devPreviewUrl?: string;
}

export class AuthService {

  async register(input: RegisterInput): Promise<RegisterResult> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictError(
        'An account with this email already exists. Please sign in or use Forgot Password.',
      );
    }

    const hashedPassword = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        firstName: input.firstName,
        lastName: input.lastName,
        // emailVerified defaults to false — user must click the link
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    logger.info({ userId: user.id }, 'User registered — sending verification email');

    // Send verification email. If delivery fails completely, this throws and
    // the registration request returns HTTP 500. The user account is already
    // created at this point — they can request a resend from the login page.
    let verificationResult: VerificationEmailResult;
    try {
      verificationResult = await emailVerificationService.sendInitialVerification(
        user.id,
        user.email,
        user.firstName,
      );
    } catch (emailErr) {
      logger.error({ err: emailErr, userId: user.id }, 'Verification email failed after registration');
      // Account was created — return partial success so the user knows to resend.
      return { requiresVerification: true };
    }

    return {
      requiresVerification: true,
      devPreviewUrl: verificationResult.devPreviewUrl,
    };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    // Always run bcrypt compare even when the user doesn't exist to prevent
    // timing-based user enumeration. A fake hash produces a constant-time rejection.
    const DUMMY_HASH = '$2a$12$invalidhashfortimingprotectiononly.......';
    const passwordMatch = await bcrypt.compare(
      input.password,
      user?.password ?? DUMMY_HASH,
    );

    if (!user || !passwordMatch) {
      throw new AuthenticationError('Invalid email or password. Please try again.');
    }

    // Check email verification AFTER a successful password match.
    // This intentionally reveals that the account exists when credentials are
    // correct — acceptable trade-off for showing the "resend" option to the user.
    if (!user.emailVerified) {
      logger.info({ userId: user.id }, 'Login blocked: email not verified');
      throw new ForbiddenError('Please verify your email before signing in.');
    }

    logger.info({ userId: user.id }, 'User logged in');

    const token = signToken({ userId: user.id, email: user.email });
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      token,
    };
  }

  async deleteAccount(userId: string, currentPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      throw new AuthenticationError('Current password is incorrect.');
    }

    // Collect file paths before DB delete (records are gone after delete)
    const resumes = await prisma.resume.findMany({
      where: { userId },
      select: { storagePath: true },
    });

    // Single DELETE; all child rows cascade via onDelete: Cascade on every FK.
    await prisma.user.delete({ where: { id: userId } });
    logger.info({ userId }, 'User account and all associated data deleted');

    // Clean up uploaded files from disk (best effort — orphaned files are harmless)
    for (const resume of resumes) {
      try {
        await fs.unlink(resume.storagePath);
      } catch {
        // File already gone or never existed — not an error
      }
    }
  }
}

export const authService = new AuthService();
