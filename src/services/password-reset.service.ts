import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/errors';
import { sendEmail, buildEmailHtml, buildEmailText } from '../config/email';
import bcrypt from 'bcryptjs';

// ── Email templates ─────────────────────────────────────────────────────────────

function buildPasswordResetEmailText(resetUrl: string): string {
  return buildEmailText(
    `We received a request to reset the password for your Resumora account.\n\n` +
    `Reset your password:\n${resetUrl}\n\n` +
    `This link expires in 1 hour.\n\n` +
    `If you didn't request a password reset, you can safely ignore this email — ` +
    `your password will not be changed.`,
  );
}

function buildPasswordResetEmailHtml(resetUrl: string): string {
  return buildEmailHtml(`
    <h1 style="margin:0 0 12px;color:#f0f0f0;font-size:22px;font-weight:700;letter-spacing:-0.03em;line-height:1.2;">
      Reset your password
    </h1>
    <p style="margin:0 0 28px;color:#8a8a8a;font-size:14px;line-height:1.6;">
      We received a request to reset the password for your Resumora account.
      Click the button below to choose a new password.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <a href="${resetUrl}"
             style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;letter-spacing:-0.01em;">
            Reset password
          </a>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr><td style="border-top:1px solid #2a2a2a;"></td></tr>
    </table>

    <p style="margin:0 0 8px;color:#8a8a8a;font-size:12px;">
      If the button above doesn&rsquo;t work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;word-break:break-all;">
      <a href="${resetUrl}" style="color:#3b82f6;font-size:12px;text-decoration:none;">${resetUrl}</a>
    </p>

    <p style="margin:0;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:6px;padding:12px 14px;color:#8a8a8a;font-size:12px;line-height:1.5;">
      &#9203;&nbsp; This link expires in <strong style="color:#f0f0f0;">1 hour</strong>.
      If you didn&rsquo;t request a password reset, you can safely ignore this email &mdash;
      your password will not be changed.
    </p>
  `);
}

// ── Email sender ───────────────────────────────────────────────────────────────
// Returns the Ethereal preview URL when in dev mode (no SMTP configured),
// or undefined when a real SMTP provider delivers the email.
// Throws on any delivery failure — callers must NOT swallow this.

async function sendResetEmail(to: string, resetUrl: string): Promise<string | undefined> {
  const devPreviewUrl = await sendEmail({
    to,
    subject: 'Reset your Resumora password',
    html: buildPasswordResetEmailHtml(resetUrl),
    text: buildPasswordResetEmailText(resetUrl),
  });
  return devPreviewUrl;
}

// ── Token helpers ──────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface ResetRequestResult {
  // Present in non-production when Ethereal is used (no SMTP configured).
  // Never present in production — real SMTP has no preview URL.
  devPreviewUrl?: string;
}

export class PasswordResetService {

  async requestReset(email: string): Promise<ResetRequestResult> {
    logger.debug({}, 'Password reset request received');

    const user = await prisma.user.findUnique({ where: { email } });

    // Return the same shape whether or not the email exists.
    // Diverging responses would let an attacker enumerate registered accounts.
    if (!user) {
      logger.debug({}, 'Password reset: no account found — responding silently');
      return {};
    }

    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    logger.info({ userId: user.id }, 'Password reset token generated');

    // Replace any existing token — prior reset links are invalidated immediately.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: expiry,
      },
    });

    logger.info({ userId: user.id }, 'Password reset token stored in database');

    const appUrl = env.APP_URL ?? 'http://localhost:3001';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    // If delivery fails completely, sendResetEmail throws and propagates through
    // asyncHandler → global error handler → HTTP 500. The caller must not catch
    // and swallow this error.
    const devPreviewUrl = await sendResetEmail(email, resetUrl);

    logger.info({ userId: user.id }, 'Password reset email dispatched');

    return { devPreviewUrl };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    logger.info('Password reset submission received');

    const hashedToken = hashToken(rawToken);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      logger.warn('Password reset failed: token invalid or expired');
      throw new BadRequestError('Password reset token is invalid or has expired.');
    }

    logger.info({ userId: user.id }, 'Password reset token validated');

    const hashedPassword = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        // One-time use: clear the token immediately so the link cannot be reused.
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    logger.info({ userId: user.id }, 'Password reset completed — token invalidated');
  }
}

export const passwordResetService = new PasswordResetService();
