import { Router } from 'express';
import { sendOtp, verifyOtp, updateProfile, getProfile } from '../controllers/auth.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { 
  validateSendOtp, 
  validateVerifyOtp, 
  validateUpdateProfile 
} from '../middlewares/validation.middleware';

const router = Router();

router.post('/send-otp', validateSendOtp, sendOtp);
router.post('/verify-otp', validateVerifyOtp, verifyOtp);
router.put('/update-profile', authenticateJWT, validateUpdateProfile, updateProfile);
router.get('/profile/:email', authenticateJWT, getProfile);

export default router;
