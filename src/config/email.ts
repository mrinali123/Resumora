import nodemailer from 'nodemailer';
import { env } from './env';
import { logger } from '../utils/logger';

export type EmailMode = 'brevo' | 'smtp' | 'ethereal';

export function getEmailMode(): EmailMode {
  if (env.BREVO_API_KEY) return 'brevo';
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return 'smtp';
  return 'ethereal';
}

// ── Sender address ─────────────────────────────────────────────────────────────

export function getFromAddress(): string {
  const addr = env.SMTP_FROM ?? env.SMTP_USER ?? 'noreply@resumora.app';
  return `"Resumora" <${addr}>`;
}

export function getReplyToAddress(): string {
  return getFromAddress();
}

// ── SMTP singleton ─────────────────────────────────────────────────────────────

let _smtpTransporter: nodemailer.Transporter | null = null;

export function getSmtpTransporter(): nodemailer.Transporter {
  if (_smtpTransporter) return _smtpTransporter;
  _smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    tls: { rejectUnauthorized: env.NODE_ENV === 'production' },
  });
  return _smtpTransporter;
}

// ── Brevo HTTP API sender ──────────────────────────────────────────────────────
// Uses HTTPS (port 443) — works on all hosting tiers including Render free plan.

async function sendViaBrevo(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const senderEmail = env.SMTP_FROM ?? env.SMTP_USER ?? 'noreply@resumora.app';

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY!,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Resumora', email: senderEmail },
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
}

// ── Ethereal dev sender ────────────────────────────────────────────────────────

async function sendViaEthereal(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string | undefined> {
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email', port: 587, secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  const info = await transporter.sendMail({
    from: '"Resumora" <noreply@resumora.app>',
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
  logger.info({ to: opts.to, previewUrl }, '[DEV] Email captured in Ethereal sandbox');
  console.log(
    '\n' +
    '  ┌──────────────────────────────────────────────────────────────────────\n' +
    '  │  Resumora — Email (Ethereal Dev Preview)\n' +
    '  │\n' +
    `  │  To          : ${opts.to}\n` +
    `  │  Subject     : ${opts.subject}\n` +
    `  │  Preview URL : ${previewUrl ?? '(unavailable)'}\n` +
    '  │\n' +
    '  │  Open the Preview URL in your browser to see the styled email.\n' +
    '  │  To send real emails, set BREVO_API_KEY in your environment.\n' +
    '  └──────────────────────────────────────────────────────────────────────\n',
  );
  return previewUrl;
}

// ── Unified sendEmail ─────────────────────────────────────────────────────────
// Priority: Brevo HTTP API > SMTP > Ethereal (dev only)
// Returns Ethereal preview URL in dev mode; undefined when a real email is sent.

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string | undefined> {
  const mode = getEmailMode();

  if (mode === 'brevo') {
    logger.info({ to: opts.to }, 'Sending email via Brevo HTTP API');
    await sendViaBrevo(opts);
    logger.info({ to: opts.to }, 'Email delivered via Brevo');
    return undefined;
  }

  if (mode === 'smtp') {
    logger.info({ to: opts.to, host: env.SMTP_HOST }, 'Sending email via SMTP');
    await getSmtpTransporter().sendMail({
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    logger.info({ to: opts.to }, 'Email delivered via SMTP');
    return undefined;
  }

  // Ethereal — dev only
  logger.warn({ to: opts.to }, '[DEV] No email provider — routing to Ethereal sandbox');
  return sendViaEthereal(opts);
}

// ── Email template helpers ─────────────────────────────────────────────────────

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

export async function verifyEmailSetup(): Promise<boolean> {
  const mode = getEmailMode();

  if (mode === 'brevo') {
    logger.info('Email mode: Brevo HTTP API — emails will be delivered via api.brevo.com');
    return true;
  }

  if (mode === 'ethereal') {
    logger.warn(
      'Email mode: Ethereal sandbox (no email provider configured). ' +
      'Emails will NOT reach real inboxes. Set BREVO_API_KEY to enable real delivery.',
    );
    return false;
  }

  // SMTP mode
  logger.info(
    { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER },
    'Email mode: SMTP — verifying connection',
  );

  try {
    await getSmtpTransporter().verify();
    logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'SMTP connection verified — email delivery is ready');
    return true;
  } catch (err) {
    logger.error(
      { err, host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER },
      'SMTP connection verification failed — password reset emails will not be delivered.',
    );
    return false;
  }
}
