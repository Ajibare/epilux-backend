import CommissionService from '../services/commissionService.js';
import { validationResult } from 'express-validator';
import CommissionTransaction from '../models/CommissionTransaction.js';
import { NotFoundError } from '../middleware/errorHandler.js';

const commissionController = {
  /**
   * Get user's commission history
   */
  getCommissionHistory: async (req, res) => {
    try {
      const { page = 1, limit = 10, type, status } = req.query;
      const userId = req.user._id;

      const transactions = await CommissionService.getCommissionHistory(userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        type,
        status
      });

      const summary = await CommissionTransaction.getUserCommissionsSummary(userId);

      res.json({
        success: true,
        data: {
          transactions,
          summary,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: summary.total.count
          }
        }
      });
    } catch (error) {
      console.error('Error getting commission history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get commission history',
        error: error.message
      });
    }
  },

  /**
   * Get commission summary for dashboard
   */
  getCommissionSummary: async (req, res) => {
    try {
      const userId = req.user._id;
      
      // Get summary of all commissions
      const summary = await CommissionTransaction.getUserCommissionsSummary(userId);
      
      // Get recent transactions
      const recentTransactions = await CommissionTransaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('fromUser', 'name email')
        .populate('productId', 'name');

      res.json({
        success: true,
        data: {
          summary,
          recentTransactions,
          currentRate: await CommissionService.getCurrentRate(userId)
        }
      });
    } catch (error) {
      console.error('Error getting commission summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get commission summary',
        error: error.message
      });
    }
  },

  /**
   * Process commission for a sale (admin only)
   */
  processSaleCommission: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { buyerId, amount, productId, orderId } = req.body;
      
      const result = await CommissionService.processSaleCommission({
        buyerId,
        amount,
        productId,
        orderId
      });

      res.json({
        success: true,
        message: 'Commission processed successfully',
        data: result
      });
    } catch (error) {
      console.error('Error processing commission:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process commission',
        error: error.message
      });
    }
  },

  /**
   * Update commission status (admin only)
   */
  updateCommissionStatus: async (req, res) => {
    try {
      const { commissionId } = req.params;
      const { status } = req.body;

      if (!['pending', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: pending, completed, cancelled'
        });
      }

      const commission = await CommissionTransaction.findById(commissionId);
      if (!commission) {
        return res.status(404).json({
          success: false,
          message: 'Commission not found'
        });
      }

      // If marking as completed, update user's balance
      if (status === 'completed' && commission.status !== 'completed') {
        const user = await User.findById(commission.userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }

        // Move from pending to available balance
        await User.findByIdAndUpdate(commission.userId, {
          $inc: {
            'commissionBalance.pending': -commission.amount,
            'commissionBalance.available': commission.amount
          }
        });
      }

      // Update commission status
      commission.status = status;
      await commission.save();

      res.json({
        success: true,
        message: 'Commission status updated successfully',
        data: commission
      });
    } catch (error) {
      console.error('Error updating commission status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update commission status',
        error: error.message
      });
    }
  },

  // controllers/commissionController.js
// import User from '../models/User.js';
// import Commission from '../models/Commission.js'; // You'll need to create this model
// import { NotFoundError } from '../middleware/errorHandler.js';

/**
 * @desc    Add commission to a user
 * @route   POST /api/commission
 * @access  Private/Admin
 * @body    {string} userId - ID of the user to add commission to
 * @body    {number} amount - Commission amount
 * @body    {string} [description] - Description of the commission
 * @body    {string} [reference] - Reference ID for the commission
 * @body    {string} [type=referral] - Type of commission (referral, sale, bonus, etc.)
 */
  addCommission: async (req, res) => {
    try {
        const { userId, amount, description = '', reference = '', type = 'referral' } = req.body;

        // Validate input
        if (!userId || amount === undefined || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid userId and positive amount are required'
            });
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        // Create commission record
        const commission = new Commission({
            user: userId,
            amount: parseFloat(amount),
            type,
            description,
            reference,
            status: 'pending', // or 'approved' based on your business logic
            approvedBy: req.user.id
        });

        await commission.save();

        // Update user's commission balance
        user.commissionBalance.available = (user.commissionBalance.available || 0) + parseFloat(amount);
        user.commissionBalance.lifetime = (user.commissionBalance.lifetime || 0) + parseFloat(amount);
        
        // Update stats if needed
        if (type === 'referral') {
            user.stats.totalCommissionEarned = (user.stats.totalCommissionEarned || 0) + parseFloat(amount);
        }

        await user.save();

        res.status(201).json({
            success: true,
            message: 'Commission added successfully',
            data: commission
        });

    } catch (error) {
        console.error('Add commission error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error adding commission'
        });
    }
 }
};






export default commissionController;
