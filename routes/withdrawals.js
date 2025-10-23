import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as withdrawalController from '../controllers/withdrawalController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Check withdrawal eligibility for an order
router.get('/check-eligibility/:orderId', withdrawalController.checkWithdrawalEligibility);

// Request withdrawal for an order
router.post('/request/:orderId', withdrawalController.requestWithdrawal);

// Get user's withdrawal history
router.get('/history', withdrawalController.getWithdrawalHistory);

// Admin endpoint to process pending withdrawals
router.post('/process', withdrawalController.processWithdrawals);

export default router;
