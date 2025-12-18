import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
    initializePayment,
    verifyPayment,
    webhookHandler,
    checkPaymentStatus
} from '../controllers/paymentController.js';

const router = express.Router();

// Protected routes (require authentication)
router.post('/initialize/:orderId', authenticate, initializePayment);
router.get('/verify/:reference', authenticate, verifyPayment);
router.get('/status/:reference', authenticate, checkPaymentStatus);

// Webhook (no auth required as it's called by Wema)
router.post('/webhook/wema', webhookHandler);

export default router;
