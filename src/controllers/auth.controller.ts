import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { asyncHandler } from '../utils/async-handler';
import { RegisterInput, LoginInput, DeleteAccountInput } from '../validators/auth.validator';
import { env } from '../config/env';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json({
    success: true,
    data: {
      requiresVerification: true,
      ...(env.NODE_ENV !== 'production' && result.devPreviewUrl
        ? { devPreviewUrl: result.devPreviewUrl }
        : {}),
    },
    message: 'Account created. Please check your email and click the verification link to activate your account.',
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json({
    success: true,
    data: result,
    message: 'Login successful.',
  });
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as DeleteAccountInput;
  const userId = req.user!.userId;
  await authService.deleteAccount(userId, password);
  res.status(200).json({
    success: true,
    data: { deleted: true },
    message: 'Your account and all associated data have been permanently deleted.',
  });
});
