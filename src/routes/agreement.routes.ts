import { Router } from 'express';
import {
  createAgreement,
  getAgreements,
  getAgreementById,
  signAgreement
} from '../controllers/agreement.controller';

const router = Router();

router.post('/', createAgreement);
router.get('/', getAgreements);
router.get('/:id', getAgreementById);
router.put('/:id/sign', signAgreement);

export default router;
