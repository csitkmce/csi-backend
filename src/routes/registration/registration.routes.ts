// src/routes/registration/registration.routes.ts
import { Router } from "express";
import { 
  registerForEvent, 
  joinTeam, 
  getRegistrationStatus 
} from "../../controllers/registration/registration.controller.js";
import { authenticate } from "../../middleware/auth.middle.js";

const router = Router();

router.post('/', authenticate, registerForEvent);
router.post('/join-team', authenticate, joinTeam);
router.get('/status/:eventId', authenticate, getRegistrationStatus);

export default router;