import { Router } from 'express';
import {
  createTransaction,
  getTransactions,
  deleteTransaction
} from '../controllers/transaction.controller';

const router = Router();

router.post('/', createTransaction);
router.get('/', getTransactions);
router.delete('/:id', deleteTransaction);

export default router;
