import { Router } from 'express';
import {
  createReview,
  getReviews,
  getReviewsByProperty,
  getReviewsByOwner,
  approveReview,
  flagReview,
  deleteReview,
  toggleTestimonialReview,
  getTestimonials
} from '../controllers/review.controller';
import { authenticateJWT, requireTenant } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticateJWT, requireTenant, createReview);
router.get('/', getReviews);
router.get('/testimonials', getTestimonials);
router.get('/property/:propertyId', getReviewsByProperty);
router.get('/owner/:ownerId', getReviewsByOwner);
router.post('/:id/approve', approveReview);
router.post('/:id/flag', flagReview);
router.patch('/:id/testimonial', toggleTestimonialReview);
router.post('/:id/testimonial', toggleTestimonialReview);
router.delete('/:id', deleteReview);

export default router;

