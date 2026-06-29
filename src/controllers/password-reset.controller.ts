import { Request, Response } from 'express';
import { passwordResetService } from '../services/password-reset.service';
import { asyncHandler } from '../utils/async-handler';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };

  logger.debug({}, 'Forgot-password request received');

  const result = await passwordResetService.requestReset(email);

  // Always return the same HTTP 200 regardless of whether the email exists —
  // different responses would let an attacker enumerate registered accounts.
  // If sendResetEmail throws, asyncHandler forwards to the error middleware
  // which returns HTTP 500 — the success path below never executes in that case.
  res.status(200).json({
    success: true,
    data: {
      sent: true,
      // In non-production, include the Ethereal preview URL so the developer
      // can open the email directly from the browser without checking the
      // terminal. In production this field is never present (real SMTP doesn't
      // produce a preview URL and we never expose internal URLs to clients).
      ...(env.NODE_ENV !== 'production' && result.devPreviewUrl
        ? { devPreviewUrl: result.devPreviewUrl }
        : {}),
    },
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token: string; password: string };

  logger.info('Reset-password submission received');

  await passwordResetService.resetPassword(token, password);

  res.status(200).json({
    success: true,
    data: { success: true },
    message: 'Password updated successfully.',
  });
});
