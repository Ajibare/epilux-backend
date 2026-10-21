import mongoose from 'mongoose';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import OrderService from '../services/orderService.js';
import MarketerService from '../services/marketerService.js';

/**
 * @desc    Get marketer's assigned products
 * @route   GET /api/marketer/products
 * @access  Private/Marketer
 */
export const getAssignedProducts = async (req, res) => {
    try {
        const marketerId = req.user.id;
        
        // Get products assigned to this marketer
        const products = await Product.find({ assignedMarketer: marketerId })
            .select('name price stock images category description isActive')
            .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
        
    } catch (error) {
        console.error('Get assigned products error:', error);
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
            .populate('items.product', 'name price images')
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
            total: order.totalAmount,
            items: order.items.map(item => ({
                productId: item.product?._id,
                name: item.name || item.product?.name,
                quantity: item.quantity,
                price: item.price,
                image: item.product?.images?.[0]?.url || null
            })),
            customer: {
                name: order.userId?.name || `${order.userId?.firstName || ''} ${order.userId?.lastName || ''}`.trim(),
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

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const order = await Order.findOne({
            _id: id,
            marketer: req.user.id
        });

        if (!order) {
            throw new NotFoundError('Order not found or not assigned to you');
        }

        // 'completed' is set by the customer's delivery confirmation (which
        // also pays their reward), never by the marketer. A marketer who can't
        // deliver declines the order and it is passed to another marketer;
        // marketers can't cancel orders customers have paid for.
        const validTransitions = {
            'assigned': ['in_transit', 'delivered', 'declined'],
            'in_transit': ['delivered', 'declined']
        };
        const requested = status === 'cancelled' || status === 'rejected' ? 'declined' : status;

        if (!validTransitions[order.status] || !validTransitions[order.status].includes(requested)) {
            return res.status(400).json({
                success: false,
                message: `An order that is ${order.status.replace('_', ' ')} can't be changed to ${String(status).replace('_', ' ')}`
            });
        }

        if (requested === 'delivered') {
            const delivered = await MarketerService.markAsDelivered(order._id, req.user.id, note || req.body.deliveryProof || 'Delivered');
            return res.status(200).json({
                success: true,
                message: 'Order marked as delivered. The customer will be asked to confirm.',
                data: delivered
            });
        }

        if (requested === 'declined') {
            await MarketerService.unassignOrder(order, note ? `Declined by marketer: ${note}` : 'Declined by marketer');
            let reassigned = null;
            try {
                reassigned = await MarketerService.assignOrder(order._id, { excludeMarketerIds: [req.user._id] });
            } catch {
                // No other marketer free right now; admin or the scheduler will assign it
            }
            return res.status(200).json({
                success: true,
                message: reassigned
                    ? 'Order declined and passed to another marketer'
                    : 'Order declined. It will be assigned to another marketer.',
                data: { orderId: order._id }
            });
        }

        // in_transit
        order.status = status;
        order.inTransitAt = new Date();
        order.$locals.skipStatusHistory = true;
        order.statusHistory.push({
            status,
            changedBy: req.user.id,
            note: note || 'Out for delivery'
        });

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

        // aggregate() does not cast types, so match on an ObjectId explicitly
        const orderStats = await Order.aggregate([
            { $match: { marketer: new mongoose.Types.ObjectId(String(marketerId)) } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Get recent orders
        const recentOrders = await Order.find({ marketer: marketerId })
            .sort('-createdAt')
            .limit(5)
            .populate('userId', 'firstName lastName email')
            .populate('buyer', 'firstName lastName email')
            .select('orderNumber status totalAmount createdAt userId buyer');

        // Format recent orders for response
        const formattedRecentOrders = recentOrders.map(order => ({
            orderNumber: order.orderNumber,
            status: order.status,
            totalAmount: order.totalAmount,
            customer: order.userId || order.buyer,
            createdAt: order.createdAt
        }));


        // Calculate statistics
        const stats = {
            totalOrders: 0,
            pending: 0,
            inTransit: 0,
            delivered: 0,
            completed: 0,
            cancelled: 0,
            recentOrders: formattedRecentOrders
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
            .select('firstName lastName email profile.phone isActive suspended assignedOrdersCount completedOrdersCount rating createdAt')
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

// In marketerController.js
export const assignProductToMarketer = async (req, res) => {
    try {
        const { productId, marketerId } = req.body;

        // Verify marketer exists and is a marketer
        const marketer = await User.findOne({ 
            _id: marketerId, 
            role: 'marketer' 
        });

        if (!marketer) {
            return res.status(404).json({
                success: false,
                message: 'Marketer not found'
            });
        }

        // Assign product to marketer
        const product = await Product.findByIdAndUpdate(
            productId,
            { assignedMarketer: marketerId },
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Product assigned to marketer successfully',
            data: product
        });

    } catch (error) {
        console.error('Assign product error:', error);
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
    getAssignedProducts,
    updateOrderStatus
};
