import { Router } from 'express';
import {
  createBooking,
  getTenantBookings,
  getOwnerBookings,
  approveBooking,
  rejectBooking,
  cancelBooking,
  rescheduleBooking,
} from '../controllers/booking.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.post('/', createBooking);
router.get('/tenant', getTenantBookings);
router.get('/owner', getOwnerBookings);
router.patch('/:id/approve', approveBooking);
router.patch('/:id/reject', rejectBooking);
router.patch('/:id/cancel', cancelBooking);
router.patch('/:id/reschedule', rescheduleBooking);

export default router;
