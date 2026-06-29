import { Request, Response } from 'express';
import { emailVerificationService } from '../services/email-verification.service';
import { asyncHandler } from '../utils/async-handler';
import { VerifyEmailInput, ResendVerificationInput } from '../validators/auth.validator';
import { env } from '../config/env';

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as VerifyEmailInput;
  await emailVerificationService.verifyEmail(token);
  res.status(200).json({
    success: true,
    data: { verified: true },
    message: 'Email verified successfully. You can now sign in.',
  });
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as ResendVerificationInput;
  const result = await emailVerificationService.resendVerification(email);
  res.status(200).json({
    success: true,
    data: {
      sent: true,
      ...(env.NODE_ENV !== 'production' && result.devPreviewUrl
        ? { devPreviewUrl: result.devPreviewUrl }
        : {}),
    },
    message: 'If your account exists and is not yet verified, a new verification email has been sent.',
  });
});
