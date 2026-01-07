import { Router } from "express";
import { getEvents, getEventDetails, getProgramEvents } from "../../controllers/event/events.controller.js";
import { optionalAuthenticate } from "../../middleware/auth.middle.js";

const router = Router();


router.get('/', getEvents);

router.get('/program/:programName', getProgramEvents);

router.get('/:eventId', optionalAuthenticate, getEventDetails);

export default router;