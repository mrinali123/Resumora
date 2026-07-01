import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { signToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import type { AuthResult } from './auth.service';

let _client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!_client) _client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return _client;
}

export async function googleSignIn(credential: string): Promise<AuthResult> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new ValidationError('Google sign-in is not configured on this server.');
  }

  // Verify the ID token issued by Google
  let payload: { sub: string; email: string; given_name?: string; family_name?: string; name?: string; email_verified?: boolean };
  try {
    const ticket = await getClient().verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p?.sub || !p?.email) throw new Error('Missing sub or email in token payload');
    payload = p as typeof payload;
  } catch (err) {
    logger.warn({ err }, 'Google ID token verification failed');
    throw new ValidationError('Invalid Google credential. Please try again.');
  }

  const { sub: googleId, email, given_name, family_name, name, email_verified } = payload;

  // Derive name components — fall back gracefully when not provided
  const firstName = given_name ?? name?.split(' ')[0] ?? 'User';
  const lastName  = family_name ?? name?.split(' ').slice(1).join(' ') ?? '';

  // ── Find or create user ────────────────────────────────────────────────────
  // Case 1: User already has this Google account linked
  let user = await prisma.user.findUnique({
    where: { googleId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  if (!user) {
    // Case 2: Email exists from password sign-up — link the Google account
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId,
          // Mark email verified if Google confirmed it
          ...(email_verified ? { emailVerified: true } : {}),
        },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      logger.info({ userId: user.id }, 'Google account linked to existing email/password user');
    } else {
      // Case 3: Brand new user — create account (no email verification needed)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await prisma.user.create({
        data: {
          email,
          password: randomPassword, // never used; can set via forgot-password
          firstName,
          lastName,
          googleId,
          emailVerified: email_verified ?? true,
        },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      logger.info({ userId: user.id }, 'New user created via Google OAuth');
    }
  }

  const token = signToken({ userId: user.id, email: user.email });
  return { user, token };
}
