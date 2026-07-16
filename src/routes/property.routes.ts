import { Router } from 'express';
import { 
  createProperty, 
  getProperties, 
  getPropertyById, 
  getPropertiesByOwner, 
  searchProperties,
  updateProperty,
  getNearbyAmenities,
  togglePropertyStatus,
  markPropertyAsBoosted,
  verifyBill,
  requestBooking,
  cancelBookingRequest,
  checkBookingStatus,
  acceptBookingRequest,
  acceptBrokerAgreement,
  verifyNicImages
} from '../controllers/property.controller';
import { authenticateJWT, requireOwner } from '../middlewares/auth.middleware';
import { validateCreateProperty } from '../middlewares/validation.middleware';

const router = Router();

// Property endpoints
router.post('/verify-bill', verifyBill); // Put this above /:id to avoid collision
router.post('/', authenticateJWT, requireOwner, validateCreateProperty, createProperty);
router.get('/', getProperties);
router.get('/search', searchProperties);
router.get('/amenities', getNearbyAmenities); // Place before /:id to avoid collision
router.get('/owner/:ownerId', authenticateJWT, getPropertiesByOwner);  // owner-specific listings
router.get('/:id', getPropertyById);
router.put('/:id', authenticateJWT, requireOwner, updateProperty);
router.post('/:id/toggle-status', togglePropertyStatus);
router.post('/:id/mark-boosted', markPropertyAsBoosted);

// Booking request endpoints
router.post('/:id/book', authenticateJWT, requestBooking);
router.delete('/:id/book', authenticateJWT, cancelBookingRequest);
router.get('/:id/booking-status', authenticateJWT, checkBookingStatus);
router.post('/:id/accept-booking', authenticateJWT, requireOwner, acceptBookingRequest);
router.post('/:id/verify-nic', verifyNicImages);
router.post('/:id/broker-agreement', acceptBrokerAgreement);

export default router;
