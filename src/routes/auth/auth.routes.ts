import { Router } from "express";
import { loginUser, registerUser,refreshToken,logoutUser } from "../../controllers/auth/auth.controller.js";

const router = Router();

router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/refresh', refreshToken);
router.post('/logout', logoutUser);
export default router;