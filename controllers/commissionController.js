import CommissionService from '../services/commissionService.js';
import { validationResult } from 'express-validator';
import CommissionTransaction from '../models/CommissionTransaction.js';

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
  }
};

export default commissionController;
