import { Router } from 'express';
import {
  createAgreement,
  getAgreements,
  getAgreementById,
  signAgreement,
  saveToWallet
} from '../controllers/agreement.controller';

const router = Router();

router.post('/', createAgreement);
router.get('/', getAgreements);
router.get('/:id', getAgreementById);
router.put('/:id/sign', signAgreement);
router.put('/:id/wallet', saveToWallet);

export default router;
