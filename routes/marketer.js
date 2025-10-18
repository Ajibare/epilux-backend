import express from 'express';
import { checkWithdrawalWindow } from '../middleware/withdrawalWindow.js';
import { authenticate as protect, authorize, marketer } from '../middleware/auth.js';
import User from '../models/User.js';
import Withdrawal from '../models/Withdrawal.js';
import * as marketerController from '../controllers/marketerController.js';

const router = express.Router();

// @desc    Get marketer dashboard
// @route   GET /api/marketer/dashboard
// @access  Private/Marketer
router.get('/dashboard', protect, marketer, marketerController.getDashboard);

// @desc    Get marketer's referrals
// @route   GET /api/marketer/referrals
// @access  Private/Marketer
router.get('/referrals', protect, marketer, marketerController.getReferrals);

// @desc    Request withdrawal
// @route   POST /api/marketer/withdraw
// @access  Private/Marketer
router.post('/withdraw', protect, marketer, checkWithdrawalWindow, async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Please enter a valid amount' });
        }

        const user = await User.findById(userId);
        
        if (amount > user.commissionBalance.available) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient available balance for withdrawal' 
            });
        }

        // Deduct from available and add to pending
        user.commissionBalance.available -= amount;
        user.commissionBalance.pendingWithdrawal += amount;
        
        await user.save();

        // Create withdrawal request
        const withdrawal = new Withdrawal({
            user: userId,
            amount,
            status: 'pending',
            requestedAt: new Date()
        });

        await withdrawal.save();

        res.status(200).json({
            success: true,
            data: withdrawal,
            message: 'Withdrawal request submitted successfully'
        });

    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Get user's withdrawal history
// @route   GET /api/marketer/withdrawals
// @access  Private/Marketer
router.get('/withdrawals', protect, marketer, async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ user: req.user.id })
            .sort('-requestedAt')
            .select('-__v');

        res.status(200).json({
            success: true,
            count: withdrawals.length,
            data: withdrawals
        });
    } catch (error) {
        console.error('Get withdrawal history error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;