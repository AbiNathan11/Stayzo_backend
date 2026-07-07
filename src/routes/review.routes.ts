import { Router } from 'express';
import {
  createReview,
  getReviews,
  getReviewsByProperty,
  getReviewsByOwner,
  approveReview,
  flagReview,
  deleteReview
} from '../controllers/review.controller';
import { authenticateJWT, requireTenant } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticateJWT, requireTenant, createReview);
router.get('/', getReviews);
router.get('/property/:propertyId', getReviewsByProperty);
router.get('/owner/:ownerId', getReviewsByOwner);
router.post('/:id/approve', approveReview);
router.post('/:id/flag', flagReview);
router.delete('/:id', deleteReview);

export default router;

