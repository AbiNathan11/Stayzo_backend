import { Router } from 'express';
import {
  createSlot,
  createRecurringSlots,
  blockDates,
  getSlotsByProperty,
  getOwnerSlots,
  updateSlot,
  deleteSlot,
  updateOwnerSettings,
  getOwnerSettings,
} from '../controllers/availability.controller';
import { authenticateJWT, requireOwner } from '../middlewares/auth.middleware';

const router = Router();

// Public
router.get('/property/:propertyId', getSlotsByProperty);

// Owner-protected
router.use(authenticateJWT);
router.use(requireOwner);

router.get('/owner', getOwnerSlots);
router.get('/settings', getOwnerSettings);
router.post('/', createSlot);
router.post('/recurring', createRecurringSlots);
router.post('/block', blockDates);
router.patch('/settings', updateOwnerSettings);
router.patch('/:id', updateSlot);
router.delete('/:id', deleteSlot);

export default router;
