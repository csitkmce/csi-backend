import { Router } from "express";
import { getLeaderboard, registerLeetcode } from "../../controllers/leaderboard/leaderboard.controller.js";
import { authenticate } from "../../middleware/auth.middle.js";

const router = Router();

router.get('/', getLeaderboard);
router.post('/register', authenticate,registerLeetcode);

export default router;