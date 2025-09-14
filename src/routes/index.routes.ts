import { Router } from "express";
import {getHome,getUser} from "../controllers/index.controllers.js";
import authRoutes from "./auth/auth.routes.js";
import deptRoutes from "./dept/dept.route.js";
import execomRoutes from './execom/execom.routes.js';
import eventRoutes from './event/event.routes.js';
import registrationRoutes from './registration/registration.routes.js';
import paymentRoutes from './payment/payment.routes.js';
import { authenticate } from "../middleware/auth.middle.js";
import leaderboardRoutes from "./leaderboard/leaderboard.routes.js";
import accommodationRoutes from "./accommodation/accommodation.routes.js";

const router = Router();

router.get('/', authenticate, getHome);
router.use('/auth', authRoutes);
router.use('/execom', execomRoutes);
router.use('/data', deptRoutes);
router.use('/events', eventRoutes);
router.use('/register', registrationRoutes);
router.use('/payments', paymentRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.get('/user',authenticate,getUser);
router.use('/accommodation', accommodationRoutes);

export default router;