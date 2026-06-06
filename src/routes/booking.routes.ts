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
import { authenticateJWT, requireOwner, requireTenant } from '../middlewares/auth.middleware';
import { validateCreateBooking } from '../middlewares/validation.middleware';

const router = Router();

router.use(authenticateJWT);

router.post('/', requireTenant, validateCreateBooking, createBooking);
router.get('/tenant', requireTenant, getTenantBookings);
router.get('/owner', requireOwner, getOwnerBookings);
router.patch('/:id/approve', requireOwner, approveBooking);
router.patch('/:id/reject', requireOwner, rejectBooking);
router.patch('/:id/cancel', cancelBooking);
router.patch('/:id/reschedule', rescheduleBooking);

export default router;
