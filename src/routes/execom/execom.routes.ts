// src/routes/execom/execom.routes.ts
import { Router } from 'express';
import { getExecom, getYears, getExecomByYear } from '../../controllers/execom/execom.controller.js';
const router = Router();

router.get('/', getExecom);
router.get('/years', getYears);
router.get('/:year', getExecomByYear);

export default router;
