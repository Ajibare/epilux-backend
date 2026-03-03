import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { catchAsync, AppError, NotFoundError } from '../middleware/errorHandler.js';
import {
    validateOrderCreation,
    validateOrderStatusUpdate,
    validateMongoId,
    validatePagination,
    handleValidationErrors
} from '../middleware/validation.js';
import { 
    createOrder, 
    getOrders, 
    getOrder, 
    updateOrderStatus, 
    deleteOrder, 
    getUserOrders, 
    getOrderStats,
    markAsDelivered,
    confirmDelivery
} from '../controllers/orderController.js';

const router = express.Router();



// Apply authentication middleware to all routes
router.use(authenticate);

// Create a new order
router.post('/', catchAsync(createOrder));

// Mark order as delivered (for marketers)
router.post(
    '/:orderId/deliver', 
    authorize('marketer'), 
    catchAsync(markAsDelivered)
);

// Confirm order delivery (for customers)
router.post(
    '/:orderId/confirm', 
    authorize('user'), 
    catchAsync(confirmDelivery)
);

// Get all orders (admin only)
router.get('/', authorize('admin'), catchAsync(getOrders));

// Get order statistics (admin only)
router.get('/stats', authorize('admin'), catchAsync(getOrderStats));

// Get orders for current user
router.get('/my-orders', catchAsync(getUserOrders));

// Get single order
router.get('/:id', catchAsync(getOrder));

// Update order status (admin only)
router.patch(
    '/:id/status', 
    authorize('admin'), 
    catchAsync(updateOrderStatus)
);

// Delete order (admin only)
router.delete('/:id', authorize('admin'), catchAsync(deleteOrder));

// Get single order by ID
router.get('/:id', validateMongoId, authenticate, catchAsync(async (req, res, next) => {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
        return next(new NotFoundError('Order not found'));
    }
    
    // Check if user owns the order or is admin
    if (order.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return next(new AppError('Access denied', 403));
    }
    
    res.json({
        success: true,
        order
    });
}));

// Update order status (admin only)
router.put('/:id/status', validateMongoId, validateOrderStatusUpdate, handleValidationErrors, authenticate, authorize('admin'), catchAsync(async (req, res, next) => {
    const { status } = req.body;
    
    const order = await Order.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
    );
    
    if (!order) {
        return next(new NotFoundError('Order not found'));
    }
    
    res.json({
        success: true,
        message: 'Order status updated successfully',
        order
    });
}));

// Update payment status (admin only)
router.put('/:id/payment-status', validateMongoId, authenticate, authorize('admin'), catchAsync(async (req, res, next) => {
    const { paymentStatus } = req.body;
    
    const order = await Order.findByIdAndUpdate(
        req.params.id,
        { paymentStatus },
        { new: true }
    );
    
    if (!order) {
        return next(new NotFoundError('Order not found'));
    }
    
    res.json({
        success: true,
        message: 'Payment status updated successfully',
        order
    });
}));

// Get all orders (admin only)
router.get('/', validatePagination, handleValidationErrors, authenticate, authorize('admin'), catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = {};
    
    // Status filter
    if (req.query.status) {
        filter.status = req.query.status;
    }
    
    // Payment status filter
    if (req.query.paymentStatus) {
        filter.paymentStatus = req.query.paymentStatus;
    }
    
    // Date range filter
    if (req.query.startDate || req.query.endDate) {
        filter.createdAt = {};
        if (req.query.startDate) {
            filter.createdAt.$gte = new Date(req.query.startDate);
        }
        if (req.query.endDate) {
            filter.createdAt.$lte = new Date(req.query.endDate);
        }
    }
    
    const orders = await Order.find(filter)
        .populate('userId', 'firstName lastName email')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
    
    const total = await Order.countDocuments(filter);
    
    res.json({
        success: true,
        orders,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

// Get order statistics (admin only)
router.get('/stats/summary', authenticate, authorize('admin'), catchAsync(async (req, res) => {
    const stats = await Order.aggregate([
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$total' },
                averageOrderValue: { $avg: '$total' },
                pendingOrders: {
                    $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                },
                shippedOrders: {
                    $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
                },
                deliveredOrders: {
                    $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                }
            }
        }
    ]);
    
    const monthlyStats = await Order.aggregate([
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                orders: { $sum: 1 },
                revenue: { $sum: '$total' }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
    ]);
    
    res.json({
        success: true,
        stats: stats[0] || {},
        monthlyStats
    });
}));

export default router;
