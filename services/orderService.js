import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';

class OrderService {
    // Update order status with validation and history tracking
    static async updateOrderStatus(orderId, newStatus, userId, note = '') {
        const validStatuses = ['pending', 'processing', 'assigned', 'in_transit', 'delivered', 'completed', 'cancelled', 'rejected'];
        
        if (!validStatuses.includes(newStatus)) {
            throw new AppError('Invalid order status', 400);
        }

        const order = await Order.findById(orderId);
        if (!order) {
            throw new AppError('Order not found', 404);
        }

        // Validate status transition
        this.validateStatusTransition(order.status, newStatus);

        // Update order status and history
        const statusUpdate = {
            status: newStatus,
            $push: {
                statusHistory: {
                    status: newStatus,
                    changedBy: userId,
                    note
                }
            }
        };

        // Set timestamps for specific statuses
        if (newStatus === 'assigned') {
            statusUpdate.assignedAt = new Date();
            // Set expiration for delivery (7 days from assignment)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            statusUpdate.assignmentExpiresAt = expiresAt;
        } else if (newStatus === 'in_transit') {
            statusUpdate.inTransitAt = new Date();
        } else if (newStatus === 'delivered') {
            statusUpdate.deliveredAt = new Date();
        } else if (newStatus === 'completed') {
            statusUpdate.completedAt = new Date();
        } else if (newStatus === 'cancelled' || newStatus === 'rejected') {
            statusUpdate[`${newStatus}At`] = new Date();
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            statusUpdate,
            { new: true }
        );

        // TODO: Send notifications based on status change
        
        return updatedOrder;
    }

    // Validate status transition
    static validateStatusTransition(currentStatus, newStatus) {
        const validTransitions = {
            pending: ['processing', 'cancelled', 'rejected'],
            processing: ['assigned', 'cancelled', 'rejected'],
            assigned: ['in_transit', 'cancelled', 'rejected'],
            in_transit: ['delivered', 'cancelled', 'rejected'],
            delivered: ['completed'],
            completed: [],
            cancelled: [],
            rejected: []
        };

        if (!validTransitions[currentStatus]?.includes(newStatus)) {
            throw new AppError(`Invalid status transition from ${currentStatus} to ${newStatus}`, 400);
        }
    }

    // Cancel order with reason
    static async cancelOrder(orderId, userId, reason = '') {
        const order = await Order.findOne({
            _id: orderId,
            user: userId,
            status: { $in: ['pending', 'processing', 'assigned'] }
        });

        if (!order) {
            throw new AppError('Order cannot be cancelled', 400);
        }

        return this.updateOrderStatus(
            orderId, 
            'cancelled', 
            userId, 
            `Order cancelled by user. ${reason}`.trim()
        );
    }

    // Reject order (admin/marketer only)
    static async rejectOrder(orderId, userId, reason = '') {
        const order = await Order.findOne({
            _id: orderId,
            status: { $in: ['pending', 'processing', 'assigned', 'in_transit'] }
        });

        if (!order) {
            throw new AppError('Order cannot be rejected', 400);
        }

        return this.updateOrderStatus(
            orderId, 
            'rejected', 
            userId, 
            `Order rejected. ${reason}`.trim()
        );
    }

    // Get order details with proper authorization
    static async getOrderDetails(orderId, userId, userRole) {
        const query = { _id: orderId };
        
        // Non-admin users can only see their own orders
        if (userRole !== 'admin' && userRole !== 'marketer') {
            query.user = userId;
        }
        
        // Marketers can only see their assigned orders
        if (userRole === 'marketer') {
            query.$or = [
                { marketer: userId },
                { user: userId }
            ];
        }

        const order = await Order.findOne(query)
            .populate('user', 'name email phone')
            .populate('marketer', 'name phone')
            .populate('items.product', 'name price');

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        return order;
    }

    // Get orders for a specific user
    static async getUserOrders(userId, status) {
        const query = { user: userId };
        if (status) {
            query.status = status;
        }

        return Order.find(query)
            .sort({ createdAt: -1 })
            .populate('items.product', 'name price image')
            .select('-statusHistory -__v');
    }
}

export default OrderService;
