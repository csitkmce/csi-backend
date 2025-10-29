import { Router } from "express";
import { 
  loginUser, 
  registerUser, 
  refreshToken, 
  logoutUser 
} from "../../controllers/auth/auth.controller.js";
import {
  requestPasswordReset,
  verifyResetToken,
  resetPassword
} from "../../controllers/auth/password-reset.controller.js";

const router = Router();

router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/refresh', refreshToken);
router.post('/logout', logoutUser);

router.post('/forgot-password', requestPasswordReset);
router.post('/verify-reset-token', verifyResetToken);
router.post('/reset-password', resetPassword);

export default router;