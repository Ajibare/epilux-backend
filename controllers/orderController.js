import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Wallet from '../models/Wallet.js';
import CommissionService from '../services/commissionService.js';
import MarketerService from '../services/marketerService.js';
import SeasonalPromoService from '../services/seasonalPromoService.js';
import OrderService from '../services/orderService.js';
import RatingService from '../services/ratingService.js';
import ProductRating from '../models/ProductRating.js';
import { AppError } from '../middleware/errorHandler.js';

// Create new order
const createOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { items, shippingAddress, paymentMethod, totalAmount, customerInfo } = req.body;
        
        // Debug logging
        console.log('=== ORDER CREATION DEBUG ===');
        console.log('Request body:', {
            items: items ? `${items.length} items` : 'MISSING',
            shippingAddress: shippingAddress ? 'PRESENT' : 'MISSING',
            paymentMethod: paymentMethod || 'MISSING',
            totalAmount: totalAmount || 'MISSING',
            customerInfo: customerInfo ? 'PRESENT' : 'MISSING'
        });
        
        if (customerInfo) {
            console.log('CustomerInfo fields:', {
                phone: customerInfo.phone || 'MISSING',
                name: customerInfo.name || 'MISSING',
                email: customerInfo.email || 'MISSING'
            });
        }
        
        if (shippingAddress) {
            console.log('ShippingAddress fields:', {
                address: shippingAddress.address || 'MISSING',
                city: shippingAddress.city || 'MISSING',
                state: shippingAddress.state || 'MISSING',
                country: shippingAddress.country || 'MISSING'
            });
        }
        
        // Validate request body structure
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new AppError('Items array is required and cannot be empty', 400);
        }
        
        if (!shippingAddress || typeof shippingAddress !== 'object') {
            throw new AppError('Shipping address is required and must be an object', 400);
        }
        
        if (!customerInfo || typeof customerInfo !== 'object') {
            throw new AppError('Customer information is required and must be an object', 400);
        }
        
        if (!paymentMethod || typeof paymentMethod !== 'string') {
            throw new AppError('Payment method is required', 400);
        }
        
        if (!totalAmount || typeof totalAmount !== 'number' || totalAmount <= 0) {
            throw new AppError('Total amount must be a positive number', 400);
        }

        if (paymentMethod === 'wallet') {
            const wallet = await Wallet.findOne({ userId: req.user.id }).session(session);
            if (!wallet || wallet.availableBalance < totalAmount) {
                throw new AppError('Insufficient wallet balance', 400);
            }

            // Lock funds during order processing
            wallet.availableBalance -= totalAmount;
            wallet.lockedAmount += totalAmount;
            await wallet.save({ session });
        }
        
        // Validate required fields
        const missingFields = [];
        
        if (!customerInfo?.phone) missingFields.push('customerInfo.phone');
        if (!shippingAddress?.address) missingFields.push('shippingAddress.address');
        if (!shippingAddress?.city) missingFields.push('shippingAddress.city');
        if (!shippingAddress?.state) missingFields.push('shippingAddress.state');
        
        if (missingFields.length > 0) {
            throw new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400);
        }
        
        // Validate items and update stock
        for (const item of items) {
            const product = await Product.findById(item.product).session(session);
            if (!product) {
                throw new AppError(`Product not found: ${item.product}`, 400);
            }
            
            if (product.stock < item.quantity) {
                throw new AppError(`Insufficient stock for product: ${product.name}`, 400);
            }
            
            // Update product stock
            product.stock -= item.quantity;
            await product.save({ session });
        }

        // Create order in transaction
        try {

            // Generate order number
            const orderNumber = 'ORD-' + Date.now().toString().slice(-8);
            
            // Create order
            const order = new Order({
                orderNumber,
                user: req.user.id,
                items: items.map(item => ({
                    product: item.product,
                    quantity: item.quantity,
                    price: item.price
                })),
                customerInfo: {
                    name: customerInfo.name || req.user.name,
                    phone: customerInfo.phone,
                    email: customerInfo.email || req.user.email
                },
                shippingAddress: {
                    address: shippingAddress.address,
                    city: shippingAddress.city,
                    state: shippingAddress.state,
                    landmark: shippingAddress.landmark,
                    deliveryInstructions: shippingAddress.deliveryInstructions
                },
                paymentMethod,
                totalAmount,
                status: 'pending',
                createdBy: req.user.id,
                commissionRate: 10, // Default commission rate
                referralInfo: {
                    referredBy: req.user.referredBy || null
                },
                statusHistory: [{
                    status: 'pending',
                    changedBy: req.user.id,
                    note: 'Order created'
                }]
            });

            await order.save({ session });
            
            // Apply seasonal promotions if any
            try {
                await SeasonalPromoService.applySeasonalPromo(order._id);
            } catch (error) {
                console.error('Error applying seasonal promotion:', error);
                // Continue with order even if seasonal promo fails
            }

            // Process referral commission
            try {
                await SeasonalPromoService.updateReferralCommission(
                    order._id, 
                    req.user.referredBy
                );
            } catch (error) {
                console.error('Error processing referral commission:', error);
                // Continue with order even if referral processing fails
            }
            
            // Assign order to a marketer
            try {
                await MarketerService.assignOrder(order._id);
            } catch (error) {
                console.error('Error assigning order to marketer:', error);
                // Don't fail the order if marketer assignment fails
                // The system will retry marketer assignment later
            }
            
            await session.commitTransaction();
            session.endSession();

            // TODO: Send order confirmation email/SMS with order number
            // TODO: Send notification to admin about new order

            res.status(201).json({
                success: true,
                data: {
                    orderId: order._id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    totalAmount: order.totalAmount,
                    customerInfo: order.customerInfo,
                    shippingAddress: order.shippingAddress,
                    items: order.items,
                    createdAt: order.createdAt
                }
            });
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            
            console.error('Error creating order:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Error creating order',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } catch (error) {
        console.error('Error in order creation:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing order',
            error: error.message
        });
    }
};

// Mark order as delivered by marketer
const markAsDelivered = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { deliveryProof } = req.body;
        
        if (!deliveryProof) {
            return res.status(400).json({
                success: false,
                message: 'Delivery proof is required'
            });
        }

        const order = await MarketerService.markAsDelivered(
            orderId,
            req.user.id,
            deliveryProof
        );

        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Error marking order as delivered:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking order as delivered',
            error: error.message
        });
    }
};

// Confirm order delivery by customer
const confirmDelivery = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const order = await MarketerService.confirmDelivery(
            orderId,
            req.user.id
        );

        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Error confirming delivery:', error);
        res.status(500).json({
            success: false,
            message: 'Error confirming delivery',
            error: error.message
        });
    }
};

// Cancel order (user)
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        
        const order = await OrderService.cancelOrder(orderId, req.user.id, reason);
        
        res.json({
            success: true,
            data: {
                orderId: order._id,
                status: order.status,
                cancelledAt: order.cancelledAt
            }
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error cancelling order'
        });
    }
};

// Reject order (admin/marketer)
const rejectOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        
        const order = await OrderService.rejectOrder(orderId, req.user.id, reason);
        
        res.json({
            success: true,
            data: {
                orderId: order._id,
                status: order.status,
                rejectedAt: order.rejectedAt,
                rejectionReason: order.rejectionReason
            }
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error rejecting order'
        });
    }
};

// Get order details
const getOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await OrderService.getOrderDetails(orderId, req.user.id, req.user.role);
        
        res.json({
            success: true,
            data: formatOrderResponse(order)
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error fetching order details'
        });
    }
};

// Get user's orders
const getUserOrders = async (req, res) => {
    try {
        const { status } = req.query;
        const orders = await OrderService.getUserOrders(req.user.id, status);
        
        res.json({
            success: true,
            count: orders.length,
            data: orders.map(order => formatOrderResponse(order))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching orders',
            error: error.message
        });
    }
};

// Format order response
const formatOrderResponse = (order) => {
    return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        statusHistory: order.statusHistory,
        customerInfo: order.customerInfo,
        shippingAddress: order.shippingAddress,
        items: order.items,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        marketer: order.marketer,
        assignedAt: order.assignedAt,
        inTransitAt: order.inTransitAt,
        deliveredAt: order.deliveredAt,
        completedAt: order.completedAt,
        cancelledAt: order.cancelledAt,
        rejectedAt: order.rejectedAt,
        cancellationReason: order.cancellationReason,
        rejectionReason: order.rejectionReason,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
    };
};

// Get all orders (admin only)
const getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('user', 'name email')
            .populate('items.product', 'name price');
        
        res.json({
            success: true,
            count: orders.length,
            orders
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching orders'
        });
    }
};

// Get single order
const getOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.product', 'name price');
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching order'
        });
    }
};

// Update order status
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }
        
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        );
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating order status'
        });
    }
};

// Delete order
const deleteOrder = async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Order deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting order'
        });
    }
};

// Get orders by user
// const getUserOrders = async (req, res) => {
//     try {
//         const orders = await Order.find({ user: req.user.id })
//             .populate('items.product', 'name price')
//             .sort('-createdAt');
        
//         res.json({
//             success: true,
//             count: orders.length,
//             orders
//         });
//     } catch (error) {
//         console.error('Error fetching user orders:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching user orders'
//         });
//     }
// };

// Get order statistics
const getOrderStats = async (req, res) => {
    try {
        const [
            totalOrders,
            pendingOrders,
            processingOrders,
            shippedOrders,
            deliveredOrders,
            cancelledOrders,
            totalRevenue,
            monthlyData
        ] = await Promise.all([
            Order.countDocuments(),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'processing' }),
            Order.countDocuments({ status: 'shipped' }),
            Order.countDocuments({ status: 'delivered' }),
            Order.countDocuments({ status: 'cancelled' }),
            Order.aggregate([
                { $match: { status: 'delivered' } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) }
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                        totalSales: { $sum: 1 },
                        totalRevenue: { $sum: '$totalAmount' }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        res.json({
            success: true,
            stats: {
                totalOrders,
                pendingOrders,
                processingOrders,
                shippedOrders,
                deliveredOrders,
                cancelledOrders,
                totalRevenue: totalRevenue[0]?.total || 0,
                monthlyData
            }
        });
    } catch (error) {
        console.error('Error fetching order statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching order statistics'
        });
    }
};

// Run marketer reassignment check (to be called by a scheduled job)
const checkAndReassignMarketers = async () => {
    try {
        const result = await MarketerService.reassignExpiredOrders();
        console.log(`Reassigned ${result.reassigned} expired orders`);
        return result;
    } catch (error) {
        console.error('Error in marketer reassignment check:', error);
        throw error;
    }
};

// Rate a product from an order
const rateProduct = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { rating, review, images } = req.body;
        const userId = req.user.id;

        const productRating = await RatingService.rateProduct(
            userId,
            orderId,
            productId,
            rating,
            review,
            images
        );

        res.status(201).json({
            success: true,
            data: productRating
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Error rating product'
        });
    }
};

// Get product ratings
const getProductRatings = async (req, res) => {
    try {
        const { productId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const result = await RatingService.getProductRatings(productId, page, limit);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching product ratings',
            error: error.message
        });
    }
};

// Get user's ratings
const getUserRatings = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const result = await RatingService.getUserRatings(userId, page, limit);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching user ratings',
            error: error.message
        });
    }
};

// Get product rating summary
const getProductRatingSummary = async (req, res) => {
    try {
        const { productId } = req.params;
        const summary = await RatingService.getProductAverageRating(productId);
        
        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching rating summary',
            error: error.message
        });
    }
};

// Get orders assigned to current marketer
const getMarketerOrders = async (req, res) => {
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
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'name email phone')
            .populate('items.productId', 'name price images')
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
                name: item.name,
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
        
        res.json({
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
        console.error('Error fetching marketer orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching orders',
            error: error.message
        });
    }
};

export {
    createOrder,
    cancelOrder,
    rejectOrder,
    getOrderDetails,
    getOrders,
    getOrder,
    updateOrderStatus,
    deleteOrder,
    getUserOrders,
    getOrderStats,
    markAsDelivered,
    confirmDelivery,
    checkAndReassignMarketers,
    formatOrderResponse,
    rateProduct,
    getProductRatings,
    getUserRatings,
    getProductRatingSummary,
    getMarketerOrders
};
