import express from 'express';
import { 
    updateCommissionRate,
    getCommissionSettings,
    requestWithdrawal, 
    processWithdrawal, 
    getWithdrawalHistory 
} from '../controllers/commissionAdminController.js';
import { authenticate as protect, authorize, ROLES } from '../middleware/auth.js';
import Withdrawal from '../models/Withdrawal.js';
import User from '../models/User.js';
import { generateWithdrawalReceipt, getReceiptPath } from '../utils/receiptGenerator.js';
import fs from 'fs';

const router = express.Router();

// Commission settings routes
router.route('/settings')
    .get(protect, authorize(ROLES.ADMIN), (req, res) => getCommissionSettings(req, res))
    .put(protect, authorize(ROLES.ADMIN), (req, res) => updateCommissionRate(req, res));

// Withdrawal routes
router.route('/withdraw')
    .post(protect, (req, res) => requestWithdrawal(req, res));

router.route('/withdraw/process')
    .post(protect, authorize(ROLES.ADMIN), (req, res) => processWithdrawal(req, res));

router.route('/withdraw/history/:userId')
    .get(protect, (req, res) => getWithdrawalHistory(req, res));

// @desc    Get all withdrawal requests
// @route   GET /api/commission/admin/withdrawals
// @access  Private/Admin
router.get('/withdrawals', protect, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.query;
        const query = {};
        
        if (status) {
            query.status = status;
        }

        const withdrawals = await Withdrawal.find(query)
            .populate('user', 'name email')
            .sort('-requestedAt');

        res.status(200).json({
            success: true,
            count: withdrawals.length,
            data: withdrawals
        });
    } catch (error) {
        console.error('Get withdrawals error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @desc    Process withdrawal request
// @route   PUT /api/commission/admin/withdrawals/:id
// @access  Private/Admin
router.put('/withdrawals/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;
        const withdrawalId = req.params.id;

        const withdrawal = await Withdrawal.findById(withdrawalId).populate('user');
        
        if (!withdrawal) {
            return res.status(404).json({ success: false, message: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'pending') {
            return res.status(400).json({ 
                success: false, 
                message: 'Withdrawal has already been processed' 
            });
        }

        const user = await User.findById(withdrawal.user._id);

        if (status === 'approved') {
            // Deduct from pending and add to total withdrawn
            user.commissionBalance.pendingWithdrawal -= withdrawal.amount;
            user.commissionBalance.totalWithdrawn += withdrawal.amount;
            user.commissionBalance.lastWithdrawalDate = new Date();
            
            withdrawal.status = 'completed';
            withdrawal.processedAt = new Date();
            withdrawal.processedBy = req.user.id;
        } else if (status === 'rejected') {
            // Return the amount to available balance
            user.commissionBalance.available += withdrawal.amount;
            user.commissionBalance.pendingWithdrawal -= withdrawal.amount;
            
            withdrawal.status = 'rejected';
            withdrawal.rejectionReason = rejectionReason || 'Rejected by admin';
            withdrawal.processedAt = new Date();
            withdrawal.processedBy = req.user.id;
        } else {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Must be "approved" or "rejected"' 
            });
        }

        await user.save();
        await withdrawal.save();

        res.status(200).json({
            success: true,
            data: withdrawal,
            message: `Withdrawal ${status} successfully`
        });

    } catch (error) {
        console.error('Process withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add this new route to commissionAdmin.js
// @desc    Download withdrawal receipt
// @route   GET /api/commission/admin/withdrawals/:id/receipt
// @access  Private
router.get('/withdrawals/:id/receipt', protect, async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id).populate('user', 'name email');
        
        if (!withdrawal) {
            return res.status(404).json({ success: false, message: 'Withdrawal not found' });
        }

        // Only allow the user who made the withdrawal or admin to download the receipt
        if (withdrawal.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to access this receipt' 
            });
        }

        // Check if receipt already exists
        const receiptPath = getReceiptPath(withdrawal._id);
        
        if (!fs.existsSync(receiptPath)) {
            // Generate receipt if it doesn't exist
            await generateWithdrawalReceipt(withdrawal, withdrawal.user);
        }

        // Set headers for file download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Epilux_Withdrawal_${withdrawal._id}.pdf`);
        
        // Stream the file
        const fileStream = fs.createReadStream(receiptPath);
        fileStream.pipe(res);

        
    } 
    catch (error) {
        console.error('Download receipt error:', error);
        res.status(500).json({ success: false, message: 'Error generating receipt' });
    }
});


export default router;
