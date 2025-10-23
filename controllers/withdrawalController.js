import { catchAsync } from '../middleware/errorHandler.js';
import WithdrawalService from '../services/withdrawalService.js';
import Order from '../models/Order.js';

// Check withdrawal eligibility for an order
export const checkWithdrawalEligibility = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    // Verify user owns the order
    const order = await Order.findOne({ _id: orderId, buyer: userId });
    if (!order) {
        return res.status(404).json({
            success: false,
            message: 'Order not found or access denied'
        });
    }

    const eligibility = await WithdrawalService.checkWithdrawalEligibility(orderId);
    
    res.json({
        success: true,
        data: eligibility
    });
});

// Request withdrawal for an order
export const requestWithdrawal = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    try {
        const result = await WithdrawalService.requestWithdrawal(orderId, userId);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Get user's withdrawal history
export const getWithdrawalHistory = catchAsync(async (req, res) => {
    const userId = req.user.id;
    
    const withdrawals = await Order.find({
        buyer: userId,
        withdrawalRequested: true
    }).sort({ withdrawalRequestedAt: -1 });

    res.json({
        success: true,
        count: withdrawals.length,
        data: withdrawals.map(w => ({
            orderId: w._id,
            amount: w.totalAmount * (w.commissionRate / 100),
            requestedAt: w.withdrawalRequestedAt,
            processed: w.withdrawalProcessed,
            processedAt: w.withdrawalProcessedAt,
            status: w.withdrawalProcessed ? 'completed' : 'pending'
        }))
    });
});

// Admin endpoint to process pending withdrawals
export const processWithdrawals = catchAsync(async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Not authorized'
        });
    }

    const result = await WithdrawalService.processPendingWithdrawals();
    
    res.json({
        success: true,
        data: result
    });
});
