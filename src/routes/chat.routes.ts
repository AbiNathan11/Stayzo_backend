import express from 'express';
import { 
  findOrCreateThread, 
  getThreadDetails, 
  getUserThreads, 
  sendMessage, 
  translateMessage 
} from '../controllers/chat.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = express.Router();

router.use(authenticateJWT);

router.post('/thread', findOrCreateThread);
router.get('/thread/:id', getThreadDetails);
router.get('/threads/user/:userId', getUserThreads);
router.post('/thread/:id/message', sendMessage);
router.post('/message/:id/translate', translateMessage);

export default router;
