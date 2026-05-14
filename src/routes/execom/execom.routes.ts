import { Router } from 'express';
import { getExecom, getYears, getExecomByYear } from '../../controllers/execom/execom.controller.js';
import { submitExecomApplication, getExecomApplication } from '../../controllers/execom/execomApplication.controller.js';
import { authenticate } from '../../middleware/auth.middle.js';

const router = Router();

router.get('/', getExecom);
router.get('/years', getYears);

// Execom position application routes (authenticated)
router.post('/application', authenticate, submitExecomApplication);
router.get('/application', authenticate, getExecomApplication);

router.get('/:year', getExecomByYear);

export default router;
