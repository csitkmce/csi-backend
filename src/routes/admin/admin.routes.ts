import { Router } from 'express';
import { getRegistrationDetails } from '../../controllers/admin/admin.controller.js';
const router = Router();

router.get('/registrations', getRegistrationDetails);

export default router;