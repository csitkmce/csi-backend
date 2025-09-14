import { Router } from 'express';
import { getAccommodation } from '../../controllers/accommodation/accommodation.controller.js';
const router = Router();

router.get('/', getAccommodation);

export default router;