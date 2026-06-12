import { Router } from 'express';
import { 
  createProperty, 
  getProperties, 
  getPropertyById, 
  getPropertiesByOwner, 
  searchProperties,
  updateProperty,
  getNearbyAmenities,
  togglePropertyStatus
} from '../controllers/property.controller';
import { authenticateJWT, requireOwner } from '../middlewares/auth.middleware';
import { validateCreateProperty } from '../middlewares/validation.middleware';

const router = Router();

// Property endpoints
router.post('/', authenticateJWT, requireOwner, validateCreateProperty, createProperty);
router.get('/', getProperties);
router.get('/search', searchProperties);
router.get('/amenities', getNearbyAmenities); // Place before /:id to avoid collision
router.get('/owner/:ownerId', authenticateJWT, getPropertiesByOwner);  // owner-specific listings
router.get('/:id', getPropertyById);
router.put('/:id', authenticateJWT, requireOwner, updateProperty);
router.post('/:id/toggle-status', togglePropertyStatus);

export default router;
