import { Router } from "express";
import { 
  initiatePayment, 
  verifyPayment, 
  getPaymentStatus 
} from "../../controllers/payment/payment.controller.js";
import { authenticate } from "../../middleware/auth.middle.js";

const router = Router();

router.post('/initiate', authenticate, initiatePayment);
router.post('/verify', authenticate, verifyPayment);
router.get('/status/:registrationId', authenticate, getPaymentStatus);

export default router;