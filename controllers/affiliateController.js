import User from '../models/User.js';
import AffiliateCommission from '../models/AffiliateCommission.js';
import AffiliateWithdrawal from '../models/AffiliateWithdrawal.js';
import { generateReferralCode } from '../utils/affiliateHelpers.js';

// Controller methods
export const getAffiliateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('firstName lastName email role affiliateCode referralCode totalEarnings availableBalance isAffiliate')
            .populate('referrals', 'firstName lastName email createdAt');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate referral link if not exists
        if (!user.referralCode) {
            user.referralCode = generateReferralCode();
            await user.save();
        }

        // Get total referrals count
        const totalReferrals = await User.countDocuments({ referredBy: user._id });
        const activeReferrals = await User.countDocuments({ 
            referredBy: user._id,
            isActive: true 
        });

        // Get commission summary
        const [commissions, withdrawals] = await Promise.all([
            AffiliateCommission.aggregate([
                { $match: { affiliate: user._id } },
                { 
                    $group: {
                        _id: null,
                        totalEarned: { $sum: '$amount' },
                        pendingAmount: { 
                            $sum: { 
                                $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] 
                            } 
                        },
                        paidAmount: { 
                            $sum: { 
                                $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] 
                            } 
                        }
                    }
                }
            ]),
            AffiliateWithdrawal.aggregate([
                { $match: { user: user._id } },
                { 
                    $group: {
                        _id: null,
                        totalWithdrawn: { $sum: '$amount' },
                        pendingWithdrawals: { 
                            $sum: { 
                                $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] 
                            } 
                        },
                        completedWithdrawals: { 
                            $sum: { 
                                $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] 
                            } 
                        }
                    }
                }
            ])
        ]);

        const commissionData = commissions[0] || {
            totalEarned: 0,
            pendingAmount: 0,
            paidAmount: 0
        };


        const withdrawalData = withdrawals[0] || {
            totalWithdrawn: 0,
            pendingWithdrawals: 0,
            completedWithdrawals: 0
        };


        res.json({
            success: true,
            profile: {
                ...user.toObject(),
                totalReferrals,
                activeReferrals,
                totalEarned: commissionData.totalEarned,
                pendingAmount: commissionData.pendingAmount,
                availableBalance: user.availableBalance || 0,
                totalWithdrawn: withdrawalData.completedWithdrawals,
                pendingWithdrawals: withdrawalData.pendingWithdrawals,
                referralLink: `${process.env.FRONTEND_URL}/register?ref=${user.referralCode}`
            }
        });
    } catch (error) {
        console.error('Error fetching affiliate profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching affiliate profile'
        });
    }
};


// Get affiliate dashboard data
export const getAffiliateDashboard = async (req, res) => {
    try {
        const [recentCommissions, recentReferrals, stats] = await Promise.all([
            AffiliateCommission.find({ affiliate: req.user.id })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('order', 'orderNumber totalAmount')
                .populate('referredUser', 'firstName lastName email'),
                
            User.find({ referredBy: req.user.id })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('firstName lastName email createdAt'),
                
            AffiliateCommission.aggregate([
                { $match: { affiliate: req.user._id } },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m', date: '$createdAt' }
                        },
                        totalCommissions: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 6 }
            ])
        ]);

        res.json({
            success: true,
            dashboard: {
                recentCommissions,
                recentReferrals,
                monthlyEarnings: stats
            }
        });
    } catch (error) {
        console.error('Error fetching affiliate dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching affiliate dashboard'
        });
    }
};


// Get affiliate commissions
export const getAffiliateCommissions = async (req, res) => {
    try {
        const { page = 1, limit = 10, status = '' } = req.query;
        const query = { affiliate: req.user.id };

        
        if (status) {
            query.status = status;
        }

        const [commissions, total] = await Promise.all([
            AffiliateCommission.find(query)
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .populate('order', 'orderNumber totalAmount')
                .populate('referredUser', 'firstName lastName email'),
                
            AffiliateCommission.countDocuments(query)
        ]);

        res.json({
            success: true,
            commissions,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            totalCommissions: total
        });
    } catch (error) {
        console.error('Error fetching affiliate commissions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching affiliate commissions'
        });
    }
};


// Request withdrawal
export const requestWithdrawal = async (req, res) => {
    try {
        const { amount, paymentMethod, accountDetails } = req.body;
        const userId = req.user.id;

        // Validate available balance
        const user = await User.findById(userId);
        if (user.availableBalance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance for withdrawal'
            });
        }

        // Create withdrawal request
        const withdrawal = new AffiliateWithdrawal({
            user: userId,
            amount,
            paymentMethod,
            accountDetails,
            status: 'pending',
            requestedAt: new Date()
        });

        await withdrawal.save();

        // Update user's available balance
        user.availableBalance -= amount;
        await user.save();

        // TODO: Notify admin about the withdrawal request

        res.status(201).json({
            success: true,
            withdrawal,
            message: 'Withdrawal request submitted successfully'
        });
    } catch (error) {
        console.error('Error processing withdrawal request:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing withdrawal request',
            error: error.message
        });
    }
};


// Get withdrawal history
export const getWithdrawals = async (req, res) => {
    try {
        const { page = 1, limit = 10, status = '' } = req.query;
        const query = { user: req.user.id };

        
        if (status) {
            query.status = status;
        }

        const [withdrawals, total] = await Promise.all([
            AffiliateWithdrawal.find(query)
                .sort({ requestedAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit),
                
            AffiliateWithdrawal.countDocuments(query)
        ]);

        res.json({
            success: true,
            withdrawals,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            totalWithdrawals: total
        });
    } catch (error) {
        console.error('Error fetching withdrawal history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching withdrawal history'
        });
    }
};


// Get referral network
export const getReferralNetwork = async (req, res) => {
    try {
        const { page = 1, limit = 10, status = '' } = req.query;
        const query = { referredBy: req.user.id };

        
        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'inactive') {
            query.isActive = false;
        }

        const [referrals, total] = await Promise.all([
            User.find(query)
                .select('firstName lastName email avatar isActive createdAt lastLogin')
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
                
            User.countDocuments(query)
        ]);

        // Get commission stats for each referral
        const referralsWithStats = await Promise.all(referrals.map(async (referral) => {
            const [commissionStats] = await AffiliateCommission.aggregate([
                { 
                    $match: { 
                        affiliate: req.user.id,
                        referredUser: referral._id
                    } 
                },
                {
                    $group: {
                        _id: null,
                        totalCommissions: { $sum: '$amount' },
                        totalOrders: { $sum: 1 }
                    }
                }
            ]);

            return {
                ...referral,
                totalCommissions: commissionStats?.totalCommissions || 0,
                totalOrders: commissionStats?.totalOrders || 0
            };

        }));

        res.json({
            success: true,
            referrals: referralsWithStats,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            totalReferrals: total
        });
    } catch (error) {
        console.error('Error fetching referral network:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching referral network'
        });
    }
};

