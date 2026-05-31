import { Router } from 'express';
import { sendOtp, verifyOtp, updateProfile, getProfile } from '../controllers/auth.controller';

const router = Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.put('/update-profile', updateProfile);
router.get('/profile/:email', getProfile);

export default router;
