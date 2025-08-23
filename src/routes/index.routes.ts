import { Router } from "express";
import getHome from "../controllers/index.controllers.js";
import authRoutes from "./auth/auth.routes.js";
import deptRoutes from "./dept/dept.route.js";
import execomRoutes from './execom/execom.routes.js';
import eventRoutes from './event/event.routes.js';
import { authenticate } from "../middleware/auth.middle.js";
import leaderboardRoutes from "./leaderboard/leaderboard.routes.js";


const router = Router();

router.get('/',authenticate, getHome);
router.use('/auth', authRoutes);
router.use('/execom', execomRoutes);
router.use('/data', deptRoutes);
router.use('/events',eventRoutes);
router.use('/leaderboard', leaderboardRoutes);


export default router;