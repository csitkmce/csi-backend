import { Router } from "express";
import getHome from "../controllers/index.controllers.js";
import authRoutes from "./auth/auth.routes.js"

const router = Router();

router.get('/', getHome);
router.use('/auth', authRoutes);

export default router;