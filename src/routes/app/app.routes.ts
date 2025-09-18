import { Router } from 'express';
import { getAttendanceDetails, markAttendancePresent } from '../../controllers/app/app.controller.js';
const router = Router();

router.post('/attendance/scan', getAttendanceDetails);
router.post('/attendance/mark', markAttendancePresent);

export default router;