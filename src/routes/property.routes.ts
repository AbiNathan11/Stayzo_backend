import { Router } from 'express';
import { createProperty, getProperties, getPropertyById } from '../controllers/property.controller';

const router = Router();

// Property endpoints
router.post('/', createProperty);
router.get('/', getProperties);
router.get('/:id', getPropertyById);

export default router;
