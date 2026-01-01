import { Router } from "express";
import { getEvents, getEventDetails, getProgramEvents } from "../../controllers/event/events.controller.js";
import { optionalAuthenticate } from "../../middleware/auth.middle.js";

const router = Router();

// IMPORTANT: Order matters! More specific routes must come before generic ones

// 1. Get all events (exact match)
router.get('/', getEvents);

// 2. Get events by program name (specific path segment)
router.get('/program/:programName', getProgramEvents);

// 3. Get event details by ID (must be last as it's a catch-all)
router.get('/:eventId', optionalAuthenticate, getEventDetails);

export default router;