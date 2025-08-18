import { Router } from "express";
import getHome from "../controllers/index.controllers.js";

const router = Router();

router.get('/', getHome);

export default router;