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
import { getBanks, resolveAccount } from '../services/bankService.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(authenticate);

// Get wallet balance
router.get('/balance', getWalletBalance);

// Get wallet transactions
router.get('/transactions', getWalletTransactions);

// When withdrawals are open (admin-configured monthly window)
router.get('/withdrawal-window', getWithdrawalWindow);

// Nigerian banks for the withdrawal form (Flutterwave list, cached)
router.get('/banks', async (req, res) => {
    const { banks, source } = await getBanks();
    res.set('Cache-Control', 'private, max-age=3600');
    res.json({ success: true, source, data: banks });
});

// Look up the name on an account. Advisory only: a failed lookup never blocks
// a withdrawal. Limited per user so the provider API can't be abused.
const lookups = new Map();
router.post('/resolve-account', async (req, res) => {
    const key = String(req.user.id);
    const now = Date.now();
    const recent = (lookups.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length >= 20) {
        return res.json({ success: true, data: { verified: false, reason: 'rate_limited' } });
    }
    recent.push(now);
    lookups.set(key, recent);
    const result = await resolveAccount(req.body?.accountNumber, req.body?.bankCode);
    res.json({ success: true, data: result });
});

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
