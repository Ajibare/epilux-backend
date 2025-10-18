import User from '../models/User.js';
import Withdrawal from '../models/Withdrawal.js';

/**
 * @desc    Get marketer dashboard
 * @route   GET /api/marketer/dashboard
 * @access  Private/Marketer
 */
export const getDashboard = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const user = await User.findById(userId).select('commissionBalance');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get recent withdrawals
        const recentWithdrawals = await Withdrawal.find({ user: userId })
            .sort('-requestedAt')
            .limit(5);

        // Calculate stats
        const stats = {
            availableBalance: user.commissionBalance.available,
            pendingWithdrawal: user.commissionBalance.pendingWithdrawal,
            totalEarned: user.commissionBalance.totalEarned,
            totalWithdrawn: user.commissionBalance.totalWithdrawn,
            recentWithdrawals,
            withdrawalCount: await Withdrawal.countDocuments({ user: userId })
        };

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Get marketer's referrals
 * @route   GET /api/marketer/referrals
 * @access  Private/Marketer
 */
export const getReferrals = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const referrals = await User.find({ referredBy: userId })
            .select('name email role createdAt')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: referrals.length,
            data: referrals
        });

    } catch (error) {
        console.error('Get referrals error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

export default {
    getDashboard,
    getReferrals
};
