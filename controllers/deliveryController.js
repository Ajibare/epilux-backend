import Delivery from '../models/Delivery.js';
import Order from '../models/Order.js';
import CommissionService from '../services/commissionService.js';
import User from '../models/User.js';
import Rating from '../models/Rating.js';
import { sendDeliveryNotification } from '../services/emailService.js';

/**
 * @desc    Assign delivery to marketer
 * @route   POST /api/deliveries/assign
 * @access  Private/Admin
 */
export const assignDelivery = async (req, res) => {
    const session = await Delivery.startSession();
    session.startTransaction();

    try {
        const { orderId, marketerId } = req.body;
        
        // Check if order exists and is paid
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'paid') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'Order is not paid and cannot be assigned for delivery' 
            });
        }

        // Check if delivery already exists for this order
        const existingDelivery = await Delivery.findOne({ order: orderId }).session(session);
        if (existingDelivery) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'This order is already assigned for delivery' 
            });
        }

        // Create delivery assignment
        const delivery = new Delivery({
            order: orderId,
            marketer: marketerId,
            customer: order.user,
            status: 'pending'
        });

        await delivery.save({ session });
        
        // Update order status
        order.status = 'processing';
        order.assignedTo = marketerId;
        await order.save({ session });

        await session.commitTransaction();
        session.endSession();

        // TODO: Send notification to marketer

        res.status(201).json({
            success: true,
            data: delivery
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Delivery assignment error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error assigning delivery',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Mark order as delivered (by marketer)
 * @route   PUT /api/deliveries/:id/deliver
 * @access  Private/Marketer
 */
export const markAsDelivered = async (req, res) => {
    try {
        const { id } = req.params;
        const { deliveryProof, notes } = req.body;
        
        const delivery = await Delivery.findById(id);
        
        if (!delivery) {
            return res.status(404).json({ success: false, message: 'Delivery not found' });
        }
        
        // Check if the request is from the assigned marketer
        if (delivery.marketer.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to update this delivery' 
            });
        }
        
        // Update delivery status
        delivery.status = 'delivered';
        delivery.deliveryProof = deliveryProof;
        delivery.notes = notes;
        delivery.deliveryDate = new Date();
        
        await delivery.save();
        
        // TODO: Send notification to customer to confirm delivery
        
        res.json({
            success: true,
            data: delivery
        });
        
    } catch (error) {
        console.error('Mark as delivered error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating delivery status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Confirm delivery (by customer)
 * @route   PUT /api/deliveries/:id/confirm
 * @access  Private/Customer
 */
export const confirmDelivery = async (req, res) => {
    const session = await Delivery.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        
        const delivery = await Delivery.findById(id).populate('order').session(session);
        
        if (!delivery) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Delivery not found' });
        }
        
        // Check if the request is from the customer
        if (delivery.customer.toString() !== req.user.id) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to confirm this delivery' 
            });
        }
        
        // Check if delivery is in delivered status
        if (delivery.status !== 'delivered') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: 'Delivery is not marked as delivered yet' 
            });
        }
        
        // Update delivery status
        delivery.status = 'confirmed';
        delivery.confirmationDate = new Date();
        delivery.commissionStatus = 'active';
        
        await delivery.save({ session });
        
        // Update order status
        await Order.findByIdAndUpdate(
            delivery.order._id,
            { status: 'completed' },
            { session }
        );
        
        // Process commission
        if (delivery.commissionStatus === 'active') {
            await CommissionService.processSaleCommission({
                buyerId: delivery.customer,
                amount: delivery.order.totalAmount,
                productId: delivery.order.items[0]?.product, // Assuming first item for commission
                orderId: delivery.order._id
            });
        }
        
        await session.commitTransaction();
        session.endSession();
        
        // TODO: Send notification to marketer about confirmation
        
        res.json({
            success: true,
            data: delivery,
            message: 'Delivery confirmed successfully. Commission has been processed.'
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Confirm delivery error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error confirming delivery',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Get deliveries for marketer
 * @route   GET /api/deliveries/marketer
 * @access  Private/Marketer
 */
export const getMarketerDeliveries = async (req, res) => {
    try {
        const { status } = req.query;
        const query = { marketer: req.user.id };
        
        if (status) {
            query.status = status;
        }
        
        const deliveries = await Delivery.find(query)
            .populate('order', 'orderNumber totalAmount status')
            .populate('customer', 'firstName lastName phone')
            .sort({ createdAt: -1 });
            
        res.json({
            success: true,
            count: deliveries.length,
            data: deliveries
        });
        
    } catch (error) {
        console.error('Get marketer deliveries error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching deliveries',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Get delivery by ID
 * @route   GET /api/deliveries/:id
 * @access  Private
 */
export const getDelivery = async (req, res) => {
    try {
        const delivery = await Delivery.findById(req.params.id)
            .populate('order')
            .populate('marketer', 'firstName lastName phone')
            .populate('customer', 'firstName lastName phone');
            
        if (!delivery) {
            return res.status(404).json({ 
                success: false, 
                message: 'Delivery not found' 
            });
        }
        
        // Check authorization
        if (delivery.marketer._id.toString() !== req.user.id && 
            delivery.customer._id.toString() !== req.user.id &&
            req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to view this delivery' 
            });
        }
        
        res.json({
            success: true,
            data: delivery
        });
        
    } catch (error) {
        console.error('Get delivery error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching delivery',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// @desc    Create a dispute
// @route   POST /api/delivery/orders/:id/disputes
// @access  Private
export const createDispute = async (req, res) => {
    try {
        const { reason, evidence } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.buyer.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to create a dispute for this order' 
            });
        }

        const dispute = new Dispute({
            order: order._id,
            raisedBy: req.user.id,
            reason,
            evidence,
            status: 'open'
        });

        await dispute.save();

        // Notify admin about the dispute
        // You'll need to implement getAdminEmails() based on your user model
        const adminEmails = await getAdminEmails();
        await Promise.all(adminEmails.map(email => 
            sendDeliveryNotification(
                email,
                order._id,
                'New Dispute Raised',
                `A new dispute has been raised for order ${order._id}. Reason: ${reason}`
            )
        ));

        res.status(201).json({
            success: true,
            data: dispute,
            message: 'Dispute raised successfully'
        });

    } catch (error) {
        console.error('Create dispute error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Rate an order
// @route   POST /api/delivery/orders/:id/rate
// @access  Private
export const rateOrder = async (req, res) => {
    try {
        const { rating, comment, aspects } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.buyer.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to rate this order' 
            });
        }

        if (order.status !== 'completed') {
            return res.status(400).json({ 
                success: false, 
                message: 'Can only rate completed orders' 
            });
        }

        const existingRating = await Rating.findOne({ order: order._id, ratedBy: req.user.id });
        if (existingRating) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already rated this order' 
            });
        }

        const newRating = new Rating({
            order: order._id,
            ratedBy: req.user.id,
            rating,
            comment,
            aspects
        });

        await newRating.save();

        // Update marketer's average rating
        await updateMarketerRating(order.marketer);

        res.status(201).json({
            success: true,
            data: newRating,
            message: 'Thank you for your rating!'
        });

    } catch (error) {
        console.error('Rate order error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper function to update marketer's average rating
const updateMarketerRating = async (marketerId) => {
    const result = await Rating.aggregate([
        { $match: { 'order.marketer': marketerId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);

    if (result.length > 0) {
        await User.findByIdAndUpdate(marketerId, {
            rating: result[0].avgRating
        });
    }
};

// @desc    Update delivery location
// @route   PUT /api/delivery/orders/:id/location
// @access  Private/Marketer
export const updateDeliveryLocation = async (req, res) => {
    try {
        const { coordinates, address } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.marketer.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to update this order' 
            });
        }

        order.tracking.statusUpdates.push({
            status: 'in_transit',
            location: address,
            notes: 'Location updated',
            coordinates
        });

        order.tracking.currentLocation = {
            type: 'Point',
            coordinates: [coordinates.lng, coordinates.lat],
            address,
            lastUpdated: new Date()
        };

        await order.save();

        // Notify buyer about location update
        await sendDeliveryNotification(
            order.buyer.email,
            order._id,
            'Delivery Update',
            `Your order is on the way. Current location: ${address}`
        );

        res.status(200).json({
            success: true,
            data: order.tracking,
            message: 'Location updated successfully'
        });

    } catch (error) {
        console.error('Update location error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
