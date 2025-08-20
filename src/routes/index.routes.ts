import { Router } from "express";
import getHome from "../controllers/index.controllers.js";
import authRoutes from "./auth/auth.routes.js";
import deptRoutes from "./dept/dept.route.js";

const router = Router();

router.get('/', getHome);
router.use('/auth', authRoutes);
router.use('/data', deptRoutes);

export default router;