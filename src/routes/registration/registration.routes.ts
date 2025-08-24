import { Router } from "express";
import { registerForEvent ,joinTeam} from "../../controllers/registration/registration.controller.js";
import { authenticate} from "../../middleware/auth.middle.js";

const router = Router();

router.post('/', authenticate, registerForEvent);
router.post('/joinTeam', authenticate, joinTeam);
export default router;