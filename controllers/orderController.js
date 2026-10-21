import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Wallet from '../models/Wallet.js';
import User from '../models/User.js';
import CommissionService from '../services/commissionService.js';
import MarketerService from '../services/marketerService.js';
import SeasonalPromoService from '../services/seasonalPromoService.js';
import OrderService from '../services/orderService.js';
import RatingService from '../services/ratingService.js';
import ProductRating from '../models/ProductRating.js';
import { AppError } from '../middleware/errorHandler.js';
import { calculateDeliveryFee } from '../utils/orderPricing.js';
import { getBuyerCommissionRate, postWalletTransaction } from '../services/earningsService.js';

const ALLOWED_PAYMENT_METHODS = ['card', 'bank_transfer', 'cash_on_delivery', 'wallet', 'flutterwave'];

// Create new order
// Prices and totals are always computed from the database. Client-supplied
// prices/totals are ignored so they can never be used to underpay.
const createOrder = async (req, res) => {
    const { items, shippingAddress, paymentMethod } = req.body || {};

    // Validate request body structure before opening a transaction
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items array is required and cannot be empty' });
    }

    if (!shippingAddress || typeof shippingAddress !== 'object') {
        return res.status(400).json({ success: false, message: 'Shipping address is required and must be an object' });
    }

    const missingFields = ['address', 'city', 'state']
        .filter((field) => typeof shippingAddress[field] !== 'string' || !shippingAddress[field].trim())
        .map((field) => `shippingAddress.${field}`);
    if (missingFields.length > 0) {
        return res.status(400).json({ success: false, message: `Missing required fields: ${missingFields.join(', ')}` });
    }

    if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ success: false, message: 'A valid payment method is required' });
    }

    // Merge duplicate lines for the same product and validate quantities
    const quantities = new Map();
    for (const item of items) {
        const productId = item?.product?._id || item?.product || item?.productId;
        const quantity = Number(item?.quantity);
        if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
            return res.status(400).json({ success: false, message: 'Each item must reference a valid product' });
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ success: false, message: 'Each item quantity must be a whole number of at least 1' });
        }
        const key = String(productId);
        quantities.set(key, (quantities.get(key) || 0) + quantity);
    }

    const session = await mongoose.startSession();
    let order;

    try {
        session.startTransaction();

        // Price items from the database and reserve stock atomically
        const orderItems = [];
        for (const [productId, quantity] of quantities) {
            const product = await Product.findOneAndUpdate(
                { _id: productId, isActive: { $ne: false }, stock: { $gte: quantity } },
                { $inc: { stock: -quantity } },
                { new: true, session }
            );

            if (!product) {
                const existing = await Product.findById(productId).session(session);
                if (!existing || existing.isActive === false) {
                    throw new AppError('One of the products in your cart is no longer available', 400);
                }
                throw new AppError(`Insufficient stock for ${existing.name}. Only ${existing.stock} left.`, 400);
            }

            if (product.isInStock !== product.stock > 0) {
                product.isInStock = product.stock > 0;
                await product.save({ session });
            }

            orderItems.push({ product: product._id, quantity, price: product.price });
        }

        const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        if (subtotal <= 0) {
            throw new AppError('Order total must be greater than zero', 400);
        }
        const deliveryFee = calculateDeliveryFee(subtotal);
        const totalAmount = subtotal + deliveryFee;

        // The buyer's reward rate is fixed when the order is placed, so later
        // changes to the admin setting don't alter orders already in progress
        const commissionRate = await getBuyerCommissionRate(req.user, session);

        // Extract referredBy correctly - handle all possible formats
        let referredBy = null;
        try {
            if (req.user.referredBy) {
                // If it's a string ObjectId
                if (typeof req.user.referredBy === 'string') {
                    referredBy = req.user.referredBy;
                }
                // If it's an object with user property
                else if (typeof req.user.referredBy === 'object' && req.user.referredBy.user) {
                    referredBy = req.user.referredBy.user;
                }
                // If it's an object with _id property
                else if (typeof req.user.referredBy === 'object' && req.user.referredBy._id) {
                    referredBy = req.user.referredBy._id;
                }
                // If it's already a valid ObjectId
                else if (req.user.referredBy.toString && req.user.referredBy.toString().length === 24) {
                    referredBy = req.user.referredBy.toString();
                }
            }
        } catch (error) {
            console.error('Error processing referredBy:', error.message);
            referredBy = null;
        }

        // Generate a collision-resistant order number
        const orderNumber = `ORD-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

        order = new Order({
            orderNumber,
            userId: req.user.id,
            buyer: req.user.id,
            items: orderItems,
            shippingAddress: {
                address: shippingAddress.address.trim(),
                city: shippingAddress.city.trim(),
                state: shippingAddress.state.trim(),
                country: shippingAddress.country || 'Nigeria',
                zipCode: shippingAddress.zipCode,
                landmark: shippingAddress.landmark,
                deliveryInstructions: shippingAddress.deliveryInstructions
            },
            paymentMethod,
            subtotal,
            deliveryFee,
            totalAmount,
            commissionRate,
            notes: typeof req.body.notes === 'string' ? req.body.notes.slice(0, 500) : undefined,
            status: 'pending',
            referralInfo: {
                referredBy: referredBy,
                referralCommissionRate: referredBy ? commissionRate : 0
            },
            statusHistory: [{
                status: 'pending',
                changedBy: req.user.id,
                note: 'Order created'
            }]
        });

        if (paymentMethod === 'wallet') {
            // Paying from wallet earnings settles the order immediately
            await postWalletTransaction({
                userId: req.user.id,
                amount: -totalAmount,
                type: 'debit',
                reference: `PAY-${order._id}`,
                description: `Payment for order ${orderNumber}`,
                metadata: { orderId: order._id, orderNumber },
                session
            });
            order.isPaid = true;
            order.paidAt = new Date();
            order.paymentStatus = 'completed';
            order.payment = {
                status: 'success',
                method: 'wallet',
                reference: `PAY-${order._id}`,
                amount: totalAmount,
                amountPaid: totalAmount,
                currency: 'NGN',
                initiatedAt: new Date(),
                verifiedAt: new Date()
            };
            order.status = 'processing';
            order.statusHistory.push({ status: 'processing', changedBy: req.user.id, note: 'Paid from wallet' });
        }

        await order.save({ session });
        await session.commitTransaction();
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction().catch(() => {});
        }
        await session.endSession();

        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) {
            console.error('Error creating order:', error);
        }
        return res.status(statusCode).json({
            success: false,
            message: statusCode >= 500 ? 'Error creating order. Please try again.' : error.message,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    await session.endSession();

    // These steps read the committed order, so they must run after commit.
    // Failures here never fail the order.
    try {
        await SeasonalPromoService.applySeasonalPromo(order._id);
    } catch (error) {
        console.error('Error applying seasonal promotion:', error.message);
    }

    try {
        await SeasonalPromoService.updateReferralCommission(order._id, order.referralInfo?.referredBy);
    } catch (error) {
        console.error('Error processing referral commission:', error.message);
    }

    // A marketer is assigned once the order is paid. Online payments are
    // assigned when the payment is verified; wallet payments are paid now.
    if (order.isPaid) {
        try {
            await MarketerService.assignOrder(order._id);
        } catch (error) {
            console.error('Error assigning order to marketer:', error.message);
        }
    }

    const savedOrder = await Order.findById(order._id).lean();

    return res.status(201).json({
        success: true,
        data: {
            orderId: order._id,
            _id: order._id,
            orderNumber: order.orderNumber,
            status: savedOrder?.status || order.status,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            totalAmount: order.totalAmount,
            shippingAddress: order.shippingAddress,
            items: order.items,
            createdAt: order.createdAt
        }
    });
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
        // Mounted as /:id/cancel
        const orderId = req.params.id || req.params.orderId;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }
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
        const orderId = req.params.id || req.params.orderId;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }
        const order = await OrderService.getOrderDetails(orderId, req.user.id, req.user.role);

        // `order` is kept for clients written against the previous response shape
        res.json({
            success: true,
            data: formatOrderResponse(order),
            order
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
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        isPaid: order.isPaid,
        paidAt: order.paidAt,
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
            .populate('userId', 'firstName lastName email')
            .populate('buyer', 'firstName lastName email')
            .populate('items.product', 'name price')
            .sort({ createdAt: -1 });
        
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
            .populate('userId', 'firstName lastName email')
            .populate('buyer', 'firstName lastName email')
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
// Admins may move an order to any status (corrections included), but stock and
// marketer slots are released exactly once when it becomes cancelled/rejected.
const updateOrderStatus = async (req, res) => {
    try {
        const { status, note } = req.body;
        const allowedStatuses = Order.schema.path('status').enumValues;

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`
            });
        }

        const existing = await Order.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const isTerminal = (s) => s === 'cancelled' || s === 'rejected';
        if (isTerminal(existing.status) && !isTerminal(status)) {
            return res.status(400).json({
                success: false,
                message: `A ${existing.status} order cannot be reopened. Ask the customer to place a new order.`
            });
        }

        if (existing.status === status) {
            return res.json({ success: true, order: existing });
        }

        const timestampField = {
            in_transit: 'inTransitAt',
            delivered: 'deliveredAt',
            completed: 'completedAt',
            cancelled: 'cancelledAt',
            rejected: 'rejectedAt'
        }[status];

        if (isTerminal(status)) {
            // Delegates to the service so stock and marketer counts are released once
            const order = await OrderService.updateOrderStatusAsAdmin(existing, status, req.user.id, note);
            return res.json({ success: true, order });
        }

        const order = await Order.findOneAndUpdate(
            { _id: existing._id, status: existing.status },
            {
                status,
                ...(timestampField && { [timestampField]: new Date() }),
                $push: { statusHistory: { status, changedBy: req.user.id, note: note || 'Updated by admin' } }
            },
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(409).json({ success: false, message: 'Order was updated by someone else. Please refresh and try again.' });
        }

        res.json({
            success: true,
            order
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) console.error('Error updating order status:', error);
        res.status(statusCode).json({
            success: false,
            message: statusCode >= 500 ? 'Error updating order status' : error.message
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
