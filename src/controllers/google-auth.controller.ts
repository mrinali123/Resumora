import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { googleSignIn } from '../services/google-auth.service';

export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
  const { credential } = req.body as { credential: string };
  const result = await googleSignIn(credential);
  res.status(200).json({ success: true, data: result, message: 'Signed in with Google.' });
});
