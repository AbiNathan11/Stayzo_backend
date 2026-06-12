import { Router } from 'express';
import { 
  createContactMessage, 
  getContactMessages, 
  updateMessageStatus, 
  deleteContactMessage,
  replyToContactMessage
} from '../controllers/contact.controller';

const router = Router();

router.post('/', createContactMessage);
router.get('/', getContactMessages);
router.put('/:id/status', updateMessageStatus);
router.delete('/:id', deleteContactMessage);
router.post('/:id/reply', replyToContactMessage);

export default router;
