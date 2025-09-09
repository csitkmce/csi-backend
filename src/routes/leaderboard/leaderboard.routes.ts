import { Router } from "express";
import { getLeaderboard, registerLeetcode } from "../../controllers/leaderboard/leaderboard.controller.js";
import { authenticate, optionalAuthenticate } from "../../middleware/auth.middle.js";

const router = Router();

router.get('/', optionalAuthenticate,getLeaderboard);
router.post('/register', authenticate,registerLeetcode);

export default router;