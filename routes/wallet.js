import express from 'express';
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { 
    getWalletBalance, 
    getWalletTransactions, 
    requestWithdrawal,
    processWithdrawal
} from '../controllers/walletController.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(verifyToken);

// Get wallet balance
router.get('/balance', getWalletBalance);

// Get wallet transactions
router.get('/transactions', getWalletTransactions);

// Request withdrawal
router.post('/withdraw', requestWithdrawal);

// Admin routes
router.use(isAdmin);

// Process withdrawal (approve/reject)
router.post('/withdraw/:id/process', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await processWithdrawal(
            req.params.id, 
            status, 
            req.user.id
        );
        
        res.json({
            success: true,
            message: `Withdrawal ${status} successfully`,
            data: result
        });
    } catch (error) {
        console.error('Error processing withdrawal:', error);
        res.status(500).json({
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
        }).populate('userId', 'name email');

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
