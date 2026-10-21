import express from 'express';
import { authenticate, admin } from '../middleware/auth.js';
import WalletTransaction from '../models/WalletTransaction.js';
import {
    getWalletBalance,
    getWalletTransactions,
    requestWithdrawal,
    processWithdrawal,
    getWithdrawalWindow
} from '../controllers/walletController.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(authenticate);

// Get wallet balance
router.get('/balance', getWalletBalance);

// Get wallet transactions
router.get('/transactions', getWalletTransactions);

// When withdrawals are open (admin-configured monthly window)
router.get('/withdrawal-window', getWithdrawalWindow);

// Request withdrawal
router.post('/withdraw', requestWithdrawal);

// Admin routes
router.use(admin);

// Process withdrawal (approve/reject)
router.post('/withdraw/:id/process', async (req, res) => {
    try {
        const decision = req.body?.status || req.body?.action;
        const result = await processWithdrawal(
            req.params.id,
            decision,
            req.user.id,
            req.body?.adminNote || req.body?.note
        );

        res.json({
            success: true,
            message: result.transaction.status === 'completed' ? 'Withdrawal marked as paid' : 'Withdrawal rejected and refunded to wallet',
            data: result
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) console.error('Error processing withdrawal:', error);
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error processing withdrawal'
        });
    }
});

// Get all pending withdrawals (admin)
router.get('/withdrawals/pending', async (req, res) => {
    try {
        const withdrawals = await WalletTransaction.find({
            type: 'withdrawal',
            status: 'pending'
        })
            .sort({ createdAt: 1 })
            .populate('userId', 'firstName lastName email profile.phone');

        res.json({
            success: true,
            data: withdrawals
        });
    } catch (error) {
        console.error('Error fetching pending withdrawals:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending withdrawals'
        });
    }
});

export default router;
