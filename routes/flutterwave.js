import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
    initializeFlutterwavePayment,
    verifyFlutterwavePayment,
    flutterwaveWebhook,
    getFlutterwavePaymentStatus
} from '../controllers/flutterwaveController.js';

const router = express.Router();

// Protected routes (require authentication)
router.post('/initialize/:orderId', authenticate, initializeFlutterwavePayment);
router.get('/verify/:transactionId', authenticate, verifyFlutterwavePayment);
router.get('/status/:reference', authenticate, getFlutterwavePaymentStatus);

// Webhook (no auth required as it's called by Flutterwave)
router.post('/webhook', express.raw({ type: 'application/json' }), flutterwaveWebhook);

export default router;
