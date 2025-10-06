import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import Affiliate from '../models/Affiliate.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

// Get affiliate profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const affiliate = await Affiliate.findOne({ userId: req.user.id });

        if (!affiliate) {
            return res.status(404).json({
                success: false,
                message: 'Affiliate profile not found'
            });
        }

        res.json({
            success: true,
            data: affiliate
        });
    } catch (error) {
        console.error('Error fetching affiliate profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching affiliate profile'
        });
    }
});

// Create or update affiliate profile
router.post('/profile', verifyToken, async (req, res) => {
    try {
        const { name, email } = req.body;

        let affiliate = await Affiliate.findOne({ userId: req.user.id });

        if (affiliate) {
            // Update existing affiliate
            affiliate.name = name || affiliate.name;
            affiliate.email = email || affiliate.email;
            await affiliate.save();
        } else {
            // Create new affiliate
            affiliate = new Affiliate({
                userId: req.user.id,
                name,
                email
            });
            await affiliate.save();
        }

        res.json({
            success: true,
            data: affiliate
        });
    } catch (error) {
        console.error('Error creating/updating affiliate profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating/updating affiliate profile'
        });
    }
});

// Get affiliate sales data
router.get('/sales', verifyToken, async (req, res) => {
    try {
        const affiliate = await Affiliate.findOne({ userId: req.user.id });

        if (!affiliate) {
            return res.status(404).json({
                success: false,
                message: 'Affiliate profile not found'
            });
        }

        const transactions = await Transaction.find({ 
            affiliateId: affiliate._id,
            status: 'completed'
        }).sort({ timestamp: -1 });

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        console.error('Error fetching affiliate sales:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching affiliate sales'
        });
    }
});

// Get affiliate referrals
router.get('/referrals', verifyToken, async (req, res) => {
    try {
        const affiliate = await Affiliate.findOne({ userId: req.user.id });

        if (!affiliate) {
            return res.status(404).json({
                success: false,
                message: 'Affiliate profile not found'
            });
        }

        const referredAffiliates = await Affiliate.find({ 
            referredBy: affiliate.referralCode 
        }).populate('userId', 'firstName lastName email');

        const referrals = referredAffiliates.map(ref => ({
            id: ref._id,
            name: ref.name,
            email: ref.email,
            joinDate: ref.registrationDate,
            sales: ref.totalSales,
            commission: ref.currentCommission
        }));

        res.json({
            success: true,
            data: referrals
        });
    } catch (error) {
        console.error('Error fetching affiliate referrals:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching affiliate referrals'
        });
    }
});

// Get affiliate dashboard summary
router.get('/dashboard', verifyToken, async (req, res) => {
    try {
        const affiliate = await Affiliate.findOne({ userId: req.user.id });

        if (!affiliate) {
            return res.status(404).json({
                success: false,
                message: 'Affiliate profile not found'
            });
        }

        const transactions = await Transaction.find({ 
            affiliateId: affiliate._id,
            status: 'completed'
        });

        const totalSales = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
        const totalCommission = transactions.reduce((sum, transaction) => sum + transaction.commissionEarned, 0);

        const monthlySales = {};
        const monthlyCommission = {};

        transactions.forEach(transaction => {
            const month = new Date(transaction.timestamp).toISOString().substring(0, 7);
            monthlySales[month] = (monthlySales[month] || 0) + transaction.amount;
            monthlyCommission[month] = (monthlyCommission[month] || 0) + transaction.commissionEarned;
        });

        const salesData = Object.keys(monthlySales).map(month => ({
            month,
            sales: monthlySales[month],
            commission: monthlyCommission[month]
        }));

        res.json({
            success: true,
            data: {
                profile: affiliate,
                summary: {
                    totalSales,
                    totalCommission,
                    totalTransactions: transactions.length,
                    totalReferrals: affiliate.totalReferrals
                },
                salesData
            }
        });
    } catch (error) {
        console.error('Error fetching affiliate dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching affiliate dashboard'
        });
    }
});

// Record a new sale/commission
router.post('/record-sale', verifyToken, async (req, res) => {
    try {
        const { amount, bagsSold, description, referralCode } = req.body;

        let affiliate = null;
        if (referralCode) {
            affiliate = await Affiliate.findOne({ referralCode });
        }

        const transaction = new Transaction({
            userId: req.user.id,
            referrerId: affiliate ? affiliate.userId : null,
            affiliateId: affiliate ? affiliate._id : null,
            amount,
            bagsSold,
            description: description || `Sale of ${bagsSold} bags`,
            type: affiliate ? 'referral' : 'sales'
        });

        await transaction.save();

        // Update affiliate stats if this is a referral sale
        if (affiliate) {
            affiliate.totalSales += amount;
            affiliate.currentCommission += transaction.commissionEarned;
            affiliate.totalCommissionEarned += transaction.commissionEarned;
            affiliate.totalReferrals += 1;
            await affiliate.save();
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        console.error('Error recording sale:', error);
        res.status(500).json({
            success: false,
            message: 'Error recording sale'
        });
    }
});

export default router;