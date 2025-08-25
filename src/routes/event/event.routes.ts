import { Router } from "express";
import { getEvents ,getEventDetails} from "../../controllers/event/events.controller.js";
import { authenticate } from "../../middleware/auth.middle.js";

const router = Router();

router.get('/', getEvents);
router.get('/:eventId',authenticate, getEventDetails);
export default router;