import User from '../models/User.js';
import AffiliateCommission from '../models/AffiliateCommission.js';
import Order from '../models/Order.js';

/**
 * Generate a unique referral code for a user
 * @returns {string} A unique referral code
 */
const generateReferralCode = () => {
    const length = 8;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
};

/**
 * Process an order and create affiliate commissions if applicable
 * @param {Object} order - The order object
 * @returns {Promise<void>}
 */
const processOrderForAffiliates = async (order) => {
    try {
        // Find the user who made the order
        const user = await User.findById(order.user);
        if (!user || !user.referredBy) return;

        // Find the affiliate who referred this user
        const affiliate = await User.findById(user.referredBy);
        if (!affiliate || !affiliate.isAffiliate) return;

        // Calculate commission (10% of order total by default)
        const commissionRate = 0.1; // 10% commission rate
        const commissionAmount = order.totalAmount * commissionRate;

        // Create commission record
        const commission = new AffiliateCommission({
            affiliate: affiliate._id,
            referredUser: user._id,
            order: order._id,
            amount: commissionAmount,
            commissionRate,
            status: 'pending'
        });

        await commission.save();

        // Update affiliate's available balance
        affiliate.availableBalance = (affiliate.availableBalance || 0) + commissionAmount;
        await affiliate.save();

        // TODO: Send notification to affiliate about new commission

    } catch (error) {
        console.error('Error processing affiliate commission:', error);
        // Don't throw error to prevent order creation from failing
    }
};

/**
 * Get affiliate dashboard statistics
 * @param {string} affiliateId - The affiliate's user ID
 * @returns {Promise<Object>} Dashboard statistics
 */
const getAffiliateDashboardStats = async (affiliateId) => {
    try {
        const [
            totalReferrals,
            activeReferrals,
            pendingCommissions,
            totalEarned,
            recentCommissions,
            recentReferrals
        ] = await Promise.all([
            // Total referrals count
            User.countDocuments({ referredBy: affiliateId }),
            
            // Active referrals count (users who have made at least one purchase)
            Order.distinct('user', { 
                user: { $in: await User.find({ referredBy: affiliateId }).distinct('_id') } 
            }).countDocuments(),
            
            // Pending commissions
            AffiliateCommission.aggregate([
                { 
                    $match: { 
                        affiliate: mongoose.Types.ObjectId(affiliateId),
                        status: 'pending'
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        total: { $sum: '$amount' },
                        count: { $sum: 1 }
                    } 
                }
            ]),
            
            // Total earned (approved commissions)
            AffiliateCommission.aggregate([
                { 
                    $match: { 
                        affiliate: mongoose.Types.ObjectId(affiliateId),
                        status: { $in: ['approved', 'paid'] }
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        total: { $sum: '$amount' }
                    } 
                }
            ]),
            
            // Recent commissions
            AffiliateCommission.find({ affiliate: affiliateId })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('order', 'orderNumber totalAmount')
                .populate('referredUser', 'firstName lastName email'),
                
            // Recent referrals
            User.find({ referredBy: affiliateId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('firstName lastName email createdAt')
        ]);

        // Process aggregation results
        const pendingCommissionsData = pendingCommissions[0] || { total: 0, count: 0 };
        const totalEarnedData = totalEarned[0]?.total || 0;

        return {
            totalReferrals,
            activeReferrals,
            pendingCommissions: pendingCommissionsData.total,
            pendingCommissionsCount: pendingCommissionsData.count,
            totalEarned: totalEarnedData,
            recentCommissions,
            recentReferrals
        };

    } catch (error) {
        console.error('Error getting affiliate dashboard stats:', error);
        throw error;
    }
};

export {
    generateReferralCode,
    processOrderForAffiliates,
    getAffiliateDashboardStats
};
