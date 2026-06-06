import { Router } from 'express';
import { 
  createProperty, 
  getProperties, 
  getPropertyById, 
  getPropertiesByOwner, 
  searchProperties 
} from '../controllers/property.controller';
import { authenticateJWT, requireOwner } from '../middlewares/auth.middleware';
import { validateCreateProperty } from '../middlewares/validation.middleware';

const router = Router();

// Property endpoints
router.post('/', authenticateJWT, requireOwner, validateCreateProperty, createProperty);
router.get('/', getProperties);
router.get('/search', searchProperties);
router.get('/owner/:ownerId', authenticateJWT, getPropertiesByOwner);  // owner-specific listings
router.get('/:id', getPropertyById);

export default router;
