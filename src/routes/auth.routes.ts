import { Router } from 'express';
import { register, login, deleteAccount } from '../controllers/auth.controller';
import { forgotPassword, resetPassword } from '../controllers/password-reset.controller';
import { verifyEmail, resendVerification } from '../controllers/email-verification.controller';
import { googleAuth } from '../controllers/google-auth.controller';
import { validate } from '../middleware/validate.middleware';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  deleteAccountSchema,
  googleAuthSchema,
} from '../validators/auth.validator';
import { authRateLimit } from '../middleware/rate-limit.middleware';
import { protect } from '../middleware/auth.middleware';

const router = Router();

router.post('/register',             authRateLimit, validate(registerSchema),             register);
router.post('/login',                authRateLimit, validate(loginSchema),                login);
router.post('/forgot-password',      authRateLimit, validate(forgotPasswordSchema),       forgotPassword);
router.post('/reset-password',       authRateLimit, validate(resetPasswordSchema),        resetPassword);
router.post('/verify-email',         authRateLimit, validate(verifyEmailSchema),          verifyEmail);
router.post('/resend-verification',  authRateLimit, validate(resendVerificationSchema),   resendVerification);
router.delete('/account',            protect,       validate(deleteAccountSchema),        deleteAccount);
router.post('/google',               authRateLimit, validate(googleAuthSchema),            googleAuth);

export default router;
