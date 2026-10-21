import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as messageController from '../controllers/messageController.js';

const router = express.Router();

// Admin inbox (declared before '/:messageId' routes)
router.get('/admin/inbox', authenticate, authorize('admin'), messageController.getAdminInbox);
router.put('/admin/:messageId/read', authenticate, authorize('admin'), messageController.setAdminRead);

// User routes
router.post('/', authenticate, messageController.sendMessage);
router.get('/', authenticate, messageController.getUserMessages);
router.get('/unread', authenticate, messageController.getUnreadCount);
router.put('/:messageId/read', authenticate, messageController.markAsRead);

// Admin routes
router.post('/:messageId/reply', 
  authenticate, 
  authorize('admin'), 
  messageController.replyToMessage
);

export default router;
