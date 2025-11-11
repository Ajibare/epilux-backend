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
 * @desc    Get marketer's assigned orders with pagination and filtering
 * @route   GET /api/marketer/orders
 * @access  Private/Marketer
 * @query   {string} [status] - Filter by order status
 * @query   {number} [page=1] - Page number for pagination
 * @query   {number} [limit=10] - Number of items per page
 */
export const getAssignedOrders = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        
        const query = { marketer: req.user.id };
        
        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        // Get orders with pagination
        const orders = await Order.find(query)
            .populate('userId', 'name email phone')
            .populate('items.productId', 'name price images')
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .lean();
            
        const total = await Order.countDocuments(query);
        
        // Format the response
        const formattedOrders = orders.map(order => ({
            _id: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            total: order.total,
            items: order.items.map(item => ({
                productId: item.productId?._id,
                name: item.name || item.productId?.name,
                quantity: item.quantity,
                price: item.price,
                image: item.productId?.images?.[0]?.url || null
            })),
            customer: {
                name: order.userId?.name,
                phone: order.userId?.phone,
                email: order.userId?.email
            },
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        }));

        res.status(200).json({
            success: true,
            data: formattedOrders,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get assigned orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching orders',
            error: error.message
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
            { $match: { marketer: new mongoose.Types.ObjectId(marketerId) } },
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
/**
 * @desc    Get all marketers and their assigned products
 * @route   GET /api/admin/marketers
 * @access  Private/Admin
 */
export const getAllMarketersWithProducts = async (req, res) => {
    try {
        // Get all users with role 'marketer'
        const marketers = await User.find({ role: 'marketer' })
            .select('name email phone status createdAt')
            .lean();

        // Get products assigned to each marketer
        const marketersWithProducts = await Promise.all(
            marketers.map(async (marketer) => {
                const products = await Product.find({ assignedMarketer: marketer._id })
                    .select('name price stock images status')
                    .lean();
                
                return {
                    ...marketer,
                    assignedProducts: products,
                    productCount: products.length
                };
            })
        );

        res.status(200).json({
            success: true,
            count: marketersWithProducts.length,
            data: marketersWithProducts
        });

    } catch (error) {
        console.error('Get all marketers error:', error);
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
