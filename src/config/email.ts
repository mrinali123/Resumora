// ─── Email Transporter ─────────────────────────────────────────────────────────
//
// Two modes, selected automatically based on environment variables:
//
//   smtp     — SMTP_HOST + SMTP_USER + SMTP_PASS are all set.
//               A real transporter is created once and reused.
//               verifyEmailSetup() calls transporter.verify() at startup to
//               catch misconfigurations before any user request is processed.
//
//   ethereal — Development fallback when SMTP is not configured.
//               A fresh Ethereal test account is created per email.
//               Emails are NOT delivered to real inboxes; a browser preview
//               URL is returned instead so developers can inspect the email.
//
// Only one path runs per process lifetime.
// If SMTP is configured but verification fails, the server logs an error and
// continues — the failure may be transient (network blip at startup) while
// credential errors are caught earlier by the production guard in env.ts.

import nodemailer from 'nodemailer';
import { env } from './env';
import { logger } from '../utils/logger';

// ── Mode ───────────────────────────────────────────────────────────────────────

export type EmailMode = 'smtp' | 'ethereal';

export function getEmailMode(): EmailMode {
  return env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS ? 'smtp' : 'ethereal';
}

// ── Singleton SMTP transporter ─────────────────────────────────────────────────
//
// Created lazily on first use; reused for every subsequent sendMail call.
// Creating a transporter is cheap, but reusing it avoids re-parsing config.

let _smtpTransporter: nodemailer.Transporter | null = null;

export function getSmtpTransporter(): nodemailer.Transporter {
  if (_smtpTransporter) return _smtpTransporter;

  // Gmail uses port 587 with STARTTLS (secure: false means STARTTLS upgrade).
  // Port 465 is the older SSL-wrapped variant — less common in modern Gmail.
  // For other providers (Mailgun, SendGrid, Resend) the same settings work
  // as long as SMTP_HOST and SMTP_PORT are set correctly.
  _smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true = SSL on 465; false = STARTTLS on 587
    auth: {
      user: env.SMTP_USER!,
      pass: env.SMTP_PASS!, // Gmail: use an App Password, not the account password
    },
    tls: {
      // Reject self-signed or invalid certificates in production.
      // Set to false only if using a local SMTP server in development.
      rejectUnauthorized: env.NODE_ENV === 'production',
    },
  });

  return _smtpTransporter;
}

// ── Default sender address ─────────────────────────────────────────────────────
//
// SMTP_FROM must be a plain email address (e.g. you@gmail.com).
// This function always wraps it in RFC 5322 display-name format:
//   "Resumora" <you@gmail.com>
//
// For Gmail, the address must match the authenticated SMTP_USER account
// (or a configured Gmail Send-As alias). Using an unrelated domain
// like noreply@resumora.app causes Gmail to reject the message.

export function getFromAddress(): string {
  const addr = env.SMTP_FROM ?? env.SMTP_USER ?? 'noreply@resumora.app';
  return `"Resumora" <${addr}>`;
}

// ── Reply-To address ──────────────────────────────────────────────────────────
//
// Replies from users should land in the support/admin inbox, not in the
// transactional sender (which often is a no-reply alias that nobody monitors).
// Using the same address as SMTP_FROM is safe — it just means replies come
// back to the sender's inbox, which is fine for a small app.

export function getReplyToAddress(): string {
  return getFromAddress();
}

// ── Plain-text email wrapper ───────────────────────────────────────────────────
//
// Every email must include a plain-text alternative (RFC 2822, anti-spam).
// Wrap the message body lines with a standard Resumora header/footer.

export function buildEmailText(body: string): string {
  return (
    'Resumora\n' +
    '═'.repeat(50) + '\n\n' +
    body.trim() +
    '\n\n' +
    '─'.repeat(50) + '\n' +
    '© 2026 Resumora\n' +
    'You\'re receiving this because an action was taken on your account.\n'
  );
}

// ── Shared email layout ────────────────────────────────────────────────────────
//
// Produces a full HTML email with the Resumora logo header and branded footer.
// Pass the inner card content (everything that goes inside the dark card).

export function buildEmailHtml(cardContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:24px;height:24px;background:#3b82f6;border-radius:6px;text-align:center;vertical-align:middle;">
                    <span style="color:#fff;font-size:13px;font-weight:700;line-height:24px;">R</span>
                  </td>
                  <td style="padding-left:8px;">
                    <span style="color:#f0f0f0;font-size:14px;font-weight:600;letter-spacing:-0.01em;">Resumora</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:40px;">
              ${cardContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;color:#4a4a4a;font-size:11px;line-height:1.5;">
                &copy; 2026 Resumora &bull; You&rsquo;re receiving this because an action was taken on your account.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Startup verification ───────────────────────────────────────────────────────
//
// Called once from server.ts before the HTTP server begins accepting requests.
// Logs which email mode is active and — when SMTP is configured — verifies that
// the transporter can actually reach the SMTP server and authenticate.
//
// Return value:
//   true  — SMTP connected and authenticated (emails will be delivered)
//   false — Ethereal mode, or SMTP verification failed (check logs)

export async function verifyEmailSetup(): Promise<boolean> {
  const mode = getEmailMode();

  if (mode === 'ethereal') {
    logger.warn(
      'Email mode: Ethereal sandbox (no SMTP configured). ' +
      'Password reset emails will NOT reach real inboxes. ' +
      'Add SMTP_HOST + SMTP_USER + SMTP_PASS to .env to enable real email delivery.',
    );
    return false;
  }

  logger.info(
    { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER },
    'Email mode: SMTP — verifying connection',
  );

  try {
    // transporter.verify() opens an SMTP connection, negotiates TLS, and
    // authenticates. It throws if anything in that sequence fails.
    await getSmtpTransporter().verify();
    logger.info(
      { host: env.SMTP_HOST, port: env.SMTP_PORT },
      'SMTP connection verified — email delivery is ready',
    );
    return true;
  } catch (err) {
    // Log the full error so the operator can diagnose the issue.
    // Common causes:
    //   - Wrong SMTP_PASS (App Password not generated or copied incorrectly)
    //   - 2-Step Verification not enabled on the Google account
    //   - "Less secure app access" required (only for non-App-Password setups)
    //   - SMTP_HOST typo (e.g. "smpt.gmail.com" instead of "smtp.gmail.com")
    //   - Network firewall blocking outbound port 587
    logger.error(
      { err, host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER },
      'SMTP connection verification failed — password reset emails will not be delivered. ' +
      'For Gmail: ensure 2-Step Verification is ON and SMTP_PASS is a 16-character App Password.',
    );
    return false;
  }
}
