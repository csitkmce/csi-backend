import { Router } from "express";
import { getDepts } from "../../controllers/dept/dept.controller.js";

const router = Router();

router.get('/getdepts', getDepts);

export default router;