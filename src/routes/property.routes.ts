import { Router } from 'express';
import { createProperty, getProperties, getPropertyById, getPropertiesByOwner, searchProperties } from '../controllers/property.controller';

const router = Router();

// Property endpoints
router.post('/', createProperty);
router.get('/', getProperties);
router.get('/search', searchProperties);
router.get('/owner/:ownerId', getPropertiesByOwner);  // owner-specific listings
router.get('/:id', getPropertyById);

export default router;
