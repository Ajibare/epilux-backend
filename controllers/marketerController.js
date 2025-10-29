import mongoose from 'mongoose';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { NotFoundError } from '../middleware/errorHandler.js';

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

/**
 * @desc    Get marketer's assigned orders
 * @route   GET /api/marketer/orders
 * @access  Private/Marketer
 */
export const getAssignedOrders = async (req, res) => {
    try {
        const { status } = req.query;
        const query = { marketer: req.user.id };
        
        if (status) {
            query.status = status;
        }

        const orders = await Order.find(query)
            .populate('userId', 'name email phone')
            .populate('items.productId', 'name price')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        console.error('Get assigned orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Update order status
 * @route   PUT /api/marketer/orders/:id/status
 * @access  Private/Marketer
 */
export const updateOrderStatus = async (req, res) => {
    try {
        const { status, note } = req.body;
        const { id } = req.params;
        
        const order = await Order.findOne({ 
            _id: id, 
            marketer: req.user.id 
        });

        if (!order) {
            throw new NotFoundError('Order not found or not assigned to you');
        }

        // Validate status transition
        const validTransitions = {
            'assigned': ['in_transit'],
            'in_transit': ['delivered', 'cancelled'],
            'delivered': ['completed']
        };

        if (!validTransitions[order.status] || !validTransitions[order.status].includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status transition from ${order.status} to ${status}`
            });
        }

        // Update order status
        order.status = status;
        order.statusHistory.push({
            status,
            changedBy: req.user.id,
            note: note || `Status changed to ${status}`
        });

        // If order is delivered, set deliveredAt
        if (status === 'delivered') {
            order.deliveredAt = new Date();
        }

        // If order is completed, mark as completed
        if (status === 'completed') {
            order.completedAt = new Date();
        }

        await order.save();

        // TODO: Send notification to customer about status update

        res.status(200).json({
            success: true,
            message: `Order status updated to ${status}`,
            data: order
        });

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
};

/**
 * @desc    Get marketer's dashboard with order statistics
 * @route   GET /api/marketer/dashboard
 * @access  Private/Marketer
 */
export const getDashboard = async (req, res) => {
    try {
        const marketerId = req.user.id;
        
        // Get order counts by status
        const orderStats = await Order.aggregate([
            { $match: { marketer: mongoose.Types.ObjectId(marketerId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Get recent orders
        const recentOrders = await Order.find({ marketer: marketerId })
            .sort('-createdAt')
            .limit(5)
            .populate('userId', 'name email')
            .select('orderNumber status totalAmount createdAt');

        // Calculate statistics
        const stats = {
            totalOrders: 0,
            pending: 0,
            inTransit: 0,
            delivered: 0,
            completed: 0,
            cancelled: 0,
            recentOrders
        };

        // Process order statistics
        orderStats.forEach(stat => {
            stats.totalOrders += stat.count;
            if (['pending', 'processing', 'assigned'].includes(stat._id)) {
                stats.pending += stat.count;
            } else if (stat._id === 'in_transit') {
                stats.inTransit += stat.count;
            } else if (stat._id === 'delivered') {
                stats.delivered += stat.count;
            } else if (stat._id === 'completed') {
                stats.completed += stat.count;
            } else if (stat._id === 'cancelled') {
                stats.cancelled += stat.count;
            }
        });

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

export default {
    getDashboard,
    getReferrals,
    getAssignedOrders,
    updateOrderStatus
};
