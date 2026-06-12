import { Router } from 'express';
import {
  createReview,
  getReviews,
  approveReview,
  flagReview,
  deleteReview
} from '../controllers/review.controller';

const router = Router();

router.post('/', createReview);
router.get('/', getReviews);
router.post('/:id/approve', approveReview);
router.post('/:id/flag', flagReview);
router.delete('/:id', deleteReview);

export default router;
