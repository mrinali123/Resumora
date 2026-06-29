import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/errors';
import {
  getEmailMode,
  getSmtpTransporter,
  getFromAddress,
  getReplyToAddress,
  buildEmailHtml,
  buildEmailText,
} from '../config/email';

// ── Constants ──────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESEND_COOLDOWN_MS = 60 * 60 * 1000;   // 1 hour minimum between resends

// ── Email templates ─────────────────────────────────────────────────────────────

function buildVerificationEmailText(verifyUrl: string, firstName: string): string {
  return buildEmailText(
    `Hi ${firstName},\n\n` +
    `Please verify your email address to activate your Resumora account.\n\n` +
    `Verify your email:\n${verifyUrl}\n\n` +
    `This link expires in 24 hours.\n\n` +
    `If you didn't create a Resumora account, you can safely ignore this email.`,
  );
}

function buildVerificationEmailHtml(verifyUrl: string, firstName: string): string {
  return buildEmailHtml(`
    <h1 style="margin:0 0 12px;color:#f0f0f0;font-size:22px;font-weight:700;letter-spacing:-0.03em;line-height:1.2;">
      Verify your email address
    </h1>
    <p style="margin:0 0 28px;color:#8a8a8a;font-size:14px;line-height:1.6;">
      Hi ${firstName}, thanks for creating a Resumora account. Please verify your email
      address by clicking the button below to activate your account.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <a href="${verifyUrl}"
             style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;letter-spacing:-0.01em;">
            Verify email address
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
      <a href="${verifyUrl}" style="color:#3b82f6;font-size:12px;text-decoration:none;">${verifyUrl}</a>
    </p>

    <p style="margin:0;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:6px;padding:12px 14px;color:#8a8a8a;font-size:12px;line-height:1.5;">
      &#9203;&nbsp; This link expires in <strong style="color:#f0f0f0;">24 hours</strong>.
      If you didn&rsquo;t create a Resumora account, you can safely ignore this email.
    </p>
  `);
}

// ── Email sender ───────────────────────────────────────────────────────────────

async function sendVerificationEmail(
  to: string,
  firstName: string,
  verifyUrl: string,
): Promise<string | undefined> {
  const subject = 'Verify your Resumora email address';
  const html = buildVerificationEmailHtml(verifyUrl, firstName);
  const text = buildVerificationEmailText(verifyUrl, firstName);
  const mode = getEmailMode();

  if (mode === 'smtp') {
    logger.info({ to }, 'Sending verification email via SMTP');
    try {
      await getSmtpTransporter().sendMail({
        from: getFromAddress(),
        replyTo: getReplyToAddress(),
        to,
        subject,
        text,
        html,
      });
      logger.info({ to }, 'Verification email delivered');
      return undefined;
    } catch (smtpErr) {
      logger.error({ err: smtpErr, to }, 'SMTP verification email delivery failed');
      throw new Error(
        'Failed to send verification email via SMTP. ' +
        'Verify SMTP credentials in your environment.',
      );
    }
  }

  logger.warn({ to }, '[DEV] No SMTP — sending verification email to Ethereal sandbox');

  let etherealErr: unknown;
  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    const info = await transporter.sendMail({
      from: '"Resumora" <noreply@resumora.app>',
      to,
      subject,
      text,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    logger.info({ to, previewUrl }, '[DEV] Verification email sent to Ethereal sandbox');
    console.log(
      '\n' +
      '  ┌──────────────────────────────────────────────────────────────────────\n' +
      '  │  Resumora — Email Verification (Ethereal Dev Preview)\n' +
      '  │\n' +
      `  │  To          : ${to}\n` +
      `  │  Preview URL : ${previewUrl ?? '(unavailable)'}\n` +
      `  │  Verify URL  : ${verifyUrl}\n` +
      '  │\n' +
      '  │  Open the Preview URL or click the Verify URL directly to verify.\n' +
      '  │  devPreviewUrl is also returned in the API response.\n' +
      '  └──────────────────────────────────────────────────────────────────────\n',
    );
    return previewUrl;
  } catch (err) {
    etherealErr = err;
    logger.error({ err, to }, '[DEV] Ethereal verification email delivery failed');
  }

  logger.error({ to, verifyUrl }, 'All verification email delivery methods failed');
  console.error(`\n  ✗ Verification email failed. Verify URL for ${to}: ${verifyUrl}\n`);
  throw new Error(
    'Unable to send verification email. Configure SMTP or restore internet access. ' +
    `Cause: ${(etherealErr as Error)?.message ?? 'unknown'}`,
  );
}

// ── Token helpers ──────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface VerificationEmailResult {
  devPreviewUrl?: string;
}

export class EmailVerificationService {

  // Called immediately after user registration.
  async sendInitialVerification(
    userId: string,
    email: string,
    firstName: string,
  ): Promise<VerificationEmailResult> {
    const rawToken = generateToken();
    const hashedToken = hashToken(rawToken);
    const expiry = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: expiry,
      },
    });

    logger.info({ userId }, 'Email verification token generated and stored');

    const appUrl = env.APP_URL ?? 'http://localhost:3001';
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;

    const devPreviewUrl = await sendVerificationEmail(email, firstName, verifyUrl);

    logger.info({ userId }, 'Verification email dispatched');
    return { devPreviewUrl };
  }

  // Called when user clicks the verification link.
  async verifyEmail(rawToken: string): Promise<void> {
    const hashedToken = hashToken(rawToken);

    // Look up by token only — no expiry filter here so we can distinguish
    // "invalid token" from "expired token" and handle already-verified idempotently.
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: hashedToken },
    });

    if (!user) {
      logger.warn('Email verification failed: token not found');
      throw new BadRequestError(
        'This verification link is invalid or has expired. Please request a new one.',
      );
    }

    // Idempotent: if already verified (e.g. user clicked the link twice, or React 18
    // Strict Mode fired the useEffect a second time), return success without error.
    if (user.emailVerified) {
      logger.info({ userId: user.id }, 'Email already verified — returning success (idempotent)');
      return;
    }

    // Token exists but check if it has expired before we allow verification.
    if (!user.emailVerificationExpiry || user.emailVerificationExpiry <= new Date()) {
      logger.warn({ userId: user.id }, 'Email verification failed: token expired');
      throw new BadRequestError(
        'This verification link has expired. Please request a new one.',
      );
    }

    // Mark as verified. Keep the token hash in DB so a second call with the same
    // token (double-click, Strict Mode re-run) finds the user and hits the
    // `emailVerified` early-return above. The expiry is cleared to signal "consumed"
    // and stop the cooldown clock. The token hash itself is inert once emailVerified=true.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationExpiry: null,
      },
    });

    logger.info({ userId: user.id }, 'Email verified successfully');
  }

  // Called from the "Resend verification email" button on the login page.
  // Always returns the same shape to prevent email enumeration.
  async resendVerification(email: string): Promise<VerificationEmailResult> {
    const user = await prisma.user.findUnique({ where: { email } });

    // No account or already verified — respond silently.
    if (!user || user.emailVerified) {
      logger.info({ email }, 'Resend verification: user not found or already verified — silent');
      return {};
    }

    // Rate-limit: if the current token was issued less than RESEND_COOLDOWN_MS ago, skip.
    // Token was issued at: (expiry - TOKEN_EXPIRY_MS). Time since issue = now - issued.
    if (user.emailVerificationExpiry) {
      const issuedAt = user.emailVerificationExpiry.getTime() - TOKEN_EXPIRY_MS;
      const timeSinceIssue = Date.now() - issuedAt;
      if (timeSinceIssue < RESEND_COOLDOWN_MS) {
        logger.info(
          { email, timeSinceIssueMs: timeSinceIssue },
          'Resend verification: within cooldown — skipping resend',
        );
        return {}; // Silently skip; tell user "check your email" regardless
      }
    }

    return this.sendInitialVerification(user.id, email, user.firstName);
  }
}

export const emailVerificationService = new EmailVerificationService();
