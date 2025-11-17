import CommissionRate from '../models/CommissionRate.js';
import User from '../models/User.js';
import CommissionTransaction from '../models/CommissionTransaction.js';
import Commission from '../models/Commission.js';
import AffiliateCommission from '../models/AffiliateCommission.js';
import { ROLES } from '../middleware/auth.js';

// Admin: Update global commission rate
export const updateCommissionRate = async (req, res) => {
    try {
        const { rate, excludedRoles } = req.body;
        
        // Validate rate
        if (rate === undefined || rate < 0 || rate > 100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid commission rate. Must be between 0 and 100.'
            });
        }

        // Validate excluded roles if provided
        if (excludedRoles && !Array.isArray(excludedRoles)) {
            return res.status(400).json({
                success: false,
                message: 'excludedRoles must be an array of role names.'
            });
        }

        // Find or create commission settings
        let settings = await CommissionRate.findOne();
        
        if (!settings) {
            settings = new CommissionRate({
                commissionRate: rate,
                excludedRoles: excludedRoles || ['admin', 'marketer']
            });
        } else {
            settings.commissionRate = rate;
            if (excludedRoles) {
                settings.excludedRoles = excludedRoles;
            }
        }
        
        await settings.save();
        
        res.json({
            success: true,
            message: 'Commission settings updated successfully',
            data: {
                commissionRate: settings.commissionRate,
                excludedRoles: settings.excludedRoles,
                updatedAt: settings.updatedAt
            }
        });
        
    } catch (error) {
        console.error('Update commission settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating commission settings',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get current commission settings
export const getCommissionSettings = async (req, res) => {
    try {
        console.log('=== GET COMMISSION SETTINGS REQUEST ===');
        console.log('User ID:', req.user?.id);
        console.log('User Role:', req.user?.role);

        let settings = await CommissionRate.findOne();
        
        console.log('Commission settings found:', !!settings);
        if (settings) {
            console.log('Current settings:', {
                commissionRate: settings.commissionRate,
                excludedRoles: settings.excludedRoles,
                withdrawalWindow: settings.withdrawalWindow,
                updatedAt: settings.updatedAt
            });
        }
        
        // If no settings exist, return defaults
        if (!settings) {
            console.log('No settings found, creating defaults');
            settings = new CommissionRate();
            await settings.save();
            console.log('Default settings created');
        }
        
        const response = {
            success: true,
            data: {
                commissionRate: settings.commissionRate,
                excludedRoles: settings.excludedRoles,
                withdrawalWindow: settings.withdrawalWindow,
                updatedAt: settings.updatedAt
            }
        };

        console.log('Response:', response);
        console.log('=== END GET COMMISSION SETTINGS ===');
        
        res.json(response);
        
    } catch (error) {
        console.error('Get commission settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving commission settings',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin: Get all commission records
export const getAllCommissions = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status, 
            type, 
            userId,
            startDate, 
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Log incoming request parameters
        console.log('=== GET ALL COMMISSIONS REQUEST ===');
        console.log('User ID:', req.user?.id);
        console.log('User Role:', req.user?.role);
        console.log('Query Parameters:', req.query);
        console.log('Filters:', { status, type, userId, startDate, endDate });
        console.log('Pagination:', { page, limit, sortBy, sortOrder });

        // Build query
        const query = {};
        
        if (status) {
            query.status = status;
        }
        
        if (type) {
            // For AffiliateCommission, type might not exist, so we'll skip or map it
            // query.type = type;
        }
        
        if (userId) {
            // For AffiliateCommission, userId could refer to affiliate or referredUser
            query.$or = [
                { affiliate: userId },
                { referredUser: userId }
            ];
        }
        
        // Date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        console.log('MongoDB Query:', JSON.stringify(query, null, 2));

        // Debug: Check if Commission model exists and has any data
        try {
            const allCommissions = await AffiliateCommission.find({});
            console.log('DEBUG: All affiliate commissions in database:', allCommissions.length);
            console.log('DEBUG: Sample commission structure:', allCommissions[0] || 'No commissions at all');
            
            // Check collections
            const collections = await AffiliateCommission.db.db.listCollections().toArray();
            console.log('DEBUG: Available collections:', collections.map(c => c.name));
            
        } catch (dbError) {
            console.error('DEBUG: Error checking database:', dbError);
        }

        // Sort options
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query with pagination
        const [commissions, total] = await Promise.all([
            AffiliateCommission.find(query)
                .populate('affiliate', 'name email')
                .populate('referredUser', 'name email')
                .populate('order', 'orderNumber totalAmount status')
                .sort(sort)
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
            AffiliateCommission.countDocuments(query)
        ]);

        console.log('Query Results:');
        console.log('- Total commissions found:', total);
        console.log('- Commissions returned:', commissions.length);
        console.log('- Sample commission data:', commissions[0] || 'No commissions found');

        // Calculate summary statistics
        const stats = await AffiliateCommission.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    pendingAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
                    },
                    approvedAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] }
                    },
                    paidAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] }
                    },
                    cancelledAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, '$amount', 0] }
                    },
                    totalCount: { $sum: 1 },
                    pendingCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    approvedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                    },
                    paidCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                    }
                }
            }
        ]);

        const summary = stats[0] || {
            totalAmount: 0,
            pendingAmount: 0,
            approvedAmount: 0,
            paidAmount: 0,
            cancelledAmount: 0,
            totalCount: 0,
            pendingCount: 0,
            approvedCount: 0,
            paidCount: 0
        };

        console.log('Summary Statistics:', summary);

        const response = {
            success: true,
            data: commissions,
            summary,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                limit: parseInt(limit)
            }
        };

        console.log('Response Data Size:', JSON.stringify(response).length, 'characters');
        console.log('=== END GET ALL COMMISSIONS ===');

        res.json(response);

    } catch (error) {
        console.error('Get all commissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving commission records',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin: Update commission status
export const updateCommissionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejectionReason } = req.body;

        console.log('=== UPDATE COMMISSION STATUS REQUEST ===');
        console.log('User ID:', req.user?.id);
        console.log('User Role:', req.user?.role);
        console.log('Commission ID:', id);
        console.log('Request Body:', req.body);
        console.log('New Status:', status);
        console.log('Rejection Reason:', rejectionReason);

        if (!['pending', 'approved', 'paid', 'cancelled'].includes(status)) {
            console.log('Invalid status provided:', status);
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be one of: pending, approved, paid, cancelled'
            });
        }

        const commission = await AffiliateCommission.findById(id).populate('affiliate').populate('referredUser').populate('order');
        
        console.log('Commission found:', !!commission);
        if (commission) {
            console.log('Current commission data:', {
                id: commission._id,
                affiliate: commission.affiliate?.name || commission.affiliate,
                referredUser: commission.referredUser?.name || commission.referredUser,
                amount: commission.amount,
                currentStatus: commission.status,
                commissionRate: commission.commissionRate,
                order: commission.order?.orderNumber || commission.order
            });
        }
        
        if (!commission) {
            console.log('Commission not found with ID:', id);
            return res.status(404).json({
                success: false,
                message: 'Commission record not found'
            });
        }

        // Update commission
        const oldStatus = commission.status;
        commission.status = status;
        
        // Set paid date if status is being changed to paid
        if (status === 'paid') {
            commission.paidAt = new Date();
            if (req.body.paymentMethod) {
                commission.paymentMethod = req.body.paymentMethod;
            }
        }
        
        if (status === 'cancelled' && rejectionReason) {
            commission.notes = rejectionReason;
        }

        await commission.save();

        console.log('Commission updated successfully:');
        console.log('- Old Status:', oldStatus);
        console.log('- New Status:', status);
        console.log('- Paid At:', commission.paidAt);
        console.log('- Payment Method:', commission.paymentMethod);

        const response = {
            success: true,
            message: `Commission ${status} successfully`,
            data: commission
        };

        console.log('Response:', response);
        console.log('=== END UPDATE COMMISSION STATUS ===');

        res.json(response);

    } catch (error) {
        console.error('Update commission status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating commission status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin: Set commission rate for a specific user
export const setUserRate = async (req, res) => {
    try {
        const { userId } = req.params;
        const { rate } = req.body;
        
        if (rate === undefined || rate < 0 || rate > 100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid commission rate. Must be between 0 and 100.'
            });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        let rateDoc = await CommissionRate.findOne();
        if (!rateDoc) {
            rateDoc = new CommissionRate({
                defaultRate: 10, // Default fallback
                updatedBy: req.user.id
            });
        }
        
        // Update or add user rate
        const userRateIndex = rateDoc.userRates.findIndex(ur => 
            ur.user.toString() === userId
        );
        
        if (userRateIndex >= 0) {
            rateDoc.userRates[userRateIndex].rate = rate;
            rateDoc.userRates[userRateIndex].updatedBy = req.user.id;
            rateDoc.userRates[userRateIndex].updatedAt = new Date();
        } else {
            rateDoc.userRates.push({
                user: userId,
                rate,
                updatedBy: req.user.id
            });
        }
        
        rateDoc.updatedBy = req.user.id;
        await rateDoc.save();
        
        res.json({
            success: true,
            message: 'User commission rate updated successfully',
            data: {
                userId,
                rate,
                updatedAt: new Date()
            }
        });
        
    } catch (error) {
        console.error('Set user rate error:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting user commission rate',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// User: Request commission withdrawal
export const requestWithdrawal = async (req, res) => {
    const session = await CommissionTransaction.startSession();
    session.startTransaction();
    
    try {
        const userId = req.user.id;
        const { amount } = req.body;
        
        // Check if withdrawal window is open
        const rateDoc = await CommissionRate.findOne();
        if (!rateDoc) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Commission rates not configured. Please contact support.'
            });
        }
        
        const currentDay = new Date().getDate();
        const isWindowOpen = currentDay >= rateDoc.withdrawalWindow.startDay && 
                           currentDay <= rateDoc.withdrawalWindow.endDay;
        
        if (!isWindowOpen) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: `Withdrawals are only allowed between the ${rateDoc.withdrawalWindow.startDay}th and ${rateDoc.withdrawalWindow.endDay}th of each month.`
            });
        }
        
        // Get user's available balance
        const user = await User.findById(userId).session(session);
        if (user.commissionBalance.available < amount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Insufficient available balance for withdrawal'
            });
        }
        
        // Create withdrawal record
        const withdrawal = new CommissionTransaction({
            user: userId,
            amount: -amount, // Negative amount for withdrawal
            type: 'withdrawal',
            status: 'pending',
            description: 'Withdrawal request'
        });
        
        await withdrawal.save({ session });
        
        // Update user's balance (move from available to pending withdrawal)
        user.commissionBalance.available -= amount;
        user.commissionBalance.pendingWithdrawal = (user.commissionBalance.pendingWithdrawal || 0) + amount;
        await user.save({ session });
        
        await session.commitTransaction();
        session.endSession();
        
        // TODO: Send notification to admin for approval
        
        res.json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data: {
                withdrawalId: withdrawal._id,
                amount,
                availableBalance: user.commissionBalance.available,
                pendingWithdrawal: user.commissionBalance.pendingWithdrawal
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Withdrawal request error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing withdrawal request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin: Process withdrawal
export const processWithdrawal = async (req, res) => {
    const session = await CommissionTransaction.startSession();
    session.startTransaction();
    
    try {
        const { withdrawalId, status } = req.body; // status: 'completed' or 'rejected'
        
        const withdrawal = await CommissionTransaction.findById(withdrawalId)
            .session(session);
            
        if (!withdrawal || withdrawal.type !== 'withdrawal') {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Withdrawal request not found'
            });
        }
        
        if (withdrawal.status !== 'pending') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Withdrawal request has already been processed'
            });
        }
        
        const user = await User.findById(withdrawal.user).session(session);
        
        if (status === 'completed') {
            // Mark withdrawal as completed
            withdrawal.status = 'completed';
            withdrawal.processedBy = req.user.id;
            withdrawal.processedAt = new Date();
            
            // Update user's pending withdrawal balance
            user.commissionBalance.totalWithdrawn = 
                (user.commissionBalance.totalWithdrawn || 0) + Math.abs(withdrawal.amount);
        } else {
            // Reject withdrawal - return funds to available balance
            withdrawal.status = 'rejected';
            withdrawal.rejectionReason = req.body.rejectionReason || 'Withdrawal rejected';
            
            // Move funds back to available balance
            user.commissionBalance.available += Math.abs(withdrawal.amount);
        }
        
        // Update pending withdrawal amount
        user.commissionBalance.pendingWithdrawal = 
            Math.max(0, (user.commissionBalance.pendingWithdrawal || 0) - Math.abs(withdrawal.amount));
        
        await Promise.all([
            withdrawal.save({ session }),
            user.save({ session })
        ]);
        
        await session.commitTransaction();
        session.endSession();
        
        // TODO: Send notification to user about withdrawal status
        
        res.json({
            success: true,
            message: `Withdrawal ${status} successfully`,
            data: withdrawal
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Process withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing withdrawal',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get withdrawal history
export const getWithdrawalHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, startDate, endDate, page = 1, limit = 10 } = req.query;
        
        const query = { user: userId, type: 'withdrawal' };
        
        if (status) {
            query.status = status;
        }
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        
        const withdrawals = await CommissionTransaction.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('processedBy', 'firstName lastName')
            .lean();
            
        const count = await CommissionTransaction.countDocuments(query);
        
        res.json({
            success: true,
            data: withdrawals,
            pagination: {
                total: count,
                pages: Math.ceil(count / limit),
                currentPage: page
            }
        });
        
    } catch (error) {
        console.error('Get withdrawal history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving withdrawal history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export default {
    updateCommissionRate,
    getCommissionSettings,
    getAllCommissions,
    updateCommissionStatus,
    setUserRate,
    requestWithdrawal,
    processWithdrawal,
    getWithdrawalHistory
};
