import { Router } from "express";
import { getEvents ,getEventDetails} from "../../controllers/event/events.controller.js";
import { authenticate, optionalAuthenticate } from "../../middleware/auth.middle.js";

const router = Router();

router.get('/', getEvents);
router.get('/:eventId',optionalAuthenticate, getEventDetails);
export default router;