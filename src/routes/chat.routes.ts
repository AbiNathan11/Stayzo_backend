import express from 'express';
import { findOrCreateThread, getThreadDetails } from '../controllers/chat.controller';

const router = express.Router();

router.post('/thread', findOrCreateThread);
router.get('/thread/:id', getThreadDetails);

export default router;
