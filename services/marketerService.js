import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import { releaseOrderEarnings } from './earningsService.js';

// Days a marketer has to complete a delivery before it is reassigned
const ASSIGNMENT_DAYS = 7;

class MarketerService {
    /**
     * Assign a paid, unassigned order to the active marketer with the fewest
     * open orders. Returns the updated order, or null if it wasn't assignable.
     */
    static async assignOrder(orderId, { excludeMarketerIds = [] } = {}) {
        const marketer = await User.findOne({
            role: 'marketer',
            isActive: { $ne: false },
            suspended: { $ne: true },
            _id: { $nin: excludeMarketerIds }
        })
            .sort({ assignedOrdersCount: 1, createdAt: 1 })
            .select('_id');

        if (!marketer) {
            throw new Error('No available marketers to assign');
        }

        return this.assignOrderTo(orderId, marketer._id, 'Automatic assignment');
    }

    /** Assign (or reassign) a paid order to a specific marketer. */
    static async assignOrderTo(orderId, marketerId, reason = 'Assigned by admin') {
        const assignmentExpiresAt = new Date();
        assignmentExpiresAt.setDate(assignmentExpiresAt.getDate() + ASSIGNMENT_DAYS);
        const now = new Date();

        // Only paid orders that are still unassigned. 'assigned' is included
        // for reassignment, which unsets the marketer first.
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: orderId, marketer: null, isPaid: true, status: { $in: ['pending', 'processing', 'assigned'] } },
            {
                marketer: marketerId,
                assignedAt: now,
                assignmentExpiresAt,
                status: 'assigned',
                $push: {
                    previousMarketers: { marketerId, assignedAt: now, reason },
                    statusHistory: { status: 'assigned', changedAt: now, note: reason }
                }
            },
            { new: true }
        );

        if (!updatedOrder) {
            // Not paid, already assigned, or finished; leave the marketer's count alone
            return null;
        }

        await User.updateOne({ _id: marketerId }, { $inc: { assignedOrdersCount: 1 } });

        // TODO: Send notification to marketer about new assignment
        return updatedOrder;
    }

    /** Remove the current marketer from an order that hasn't been delivered yet. */
    static async unassignOrder(order, reason) {
        if (!order.marketer) return order;
        const updated = await Order.findOneAndUpdate(
            { _id: order._id, marketer: order.marketer, status: { $in: ['assigned', 'in_transit'] } },
            {
                $push: {
                    previousMarketers: {
                        marketerId: order.marketer,
                        assignedAt: order.assignedAt,
                        unassignedAt: new Date(),
                        reason
                    }
                },
                $unset: { marketer: 1, assignedAt: 1, assignmentExpiresAt: 1 },
                // Back to the paid-and-waiting state until someone takes it
                $set: { status: 'processing' }
            },
            { new: true }
        );
        if (updated) {
            await User.updateOne(
                { _id: order.marketer, assignedOrdersCount: { $gt: 0 } },
                { $inc: { assignedOrdersCount: -1 } }
            );
        }
        return updated;
    }

    /** Reassign orders whose marketer didn't deliver within the deadline. */
    static async reassignExpiredOrders() {
        const expiredOrders = await Order.find({
            status: 'assigned',
            marketer: { $ne: null },
            assignmentExpiresAt: { $lte: new Date() }
        });

        let reassigned = 0;
        for (const order of expiredOrders) {
            const previousMarketer = order.marketer;
            const released = await this.unassignOrder(order, `Assignment expired (${ASSIGNMENT_DAYS} days)`);
            if (!released) continue;
            try {
                // Prefer someone else; fall back to anyone available
                const result = await this.assignOrder(order._id, { excludeMarketerIds: [previousMarketer] })
                    .catch(() => this.assignOrder(order._id));
                if (result) reassigned++;
            } catch (error) {
                console.error(`Could not reassign order ${order.orderNumber}:`, error.message);
            }
        }

        return { reassigned, expired: expiredOrders.length };
    }

    /** Paid orders that never got a marketer (e.g. none were available). */
    static async assignUnassignedPaidOrders() {
        const orders = await Order.find({ isPaid: true, marketer: null, status: { $in: ['pending', 'processing', 'assigned'] } }).select('_id orderNumber');
        let assigned = 0;
        for (const order of orders) {
            try {
                if (await this.assignOrder(order._id)) assigned++;
            } catch (error) {
                console.error(`Could not assign order ${order.orderNumber}:`, error.message);
                break; // no marketers available; try again next run
            }
        }
        return { assigned, pending: orders.length };
    }

    /** Marketer marks an order as delivered. */
    static async markAsDelivered(orderId, marketerId, deliveryProof) {
        const order = await Order.findById(orderId);

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        if (String(order.marketer) !== String(marketerId)) {
            throw new AppError('Not authorized to update this order', 403);
        }

        if (!['assigned', 'in_transit'].includes(order.status)) {
            throw new AppError(`An order that is ${order.status.replace('_', ' ')} cannot be marked as delivered`, 400);
        }

        const now = new Date();
        order.deliveryProof = deliveryProof;
        order.markedDeliveredAt = now;
        order.deliveredAt = now;
        order.status = 'delivered';
        order.$locals.skipStatusHistory = true;
        order.statusHistory.push({ status: 'delivered', changedBy: marketerId, note: 'Marked as delivered by marketer' });
        await order.save();

        // TODO: Send notification to customer to confirm delivery
        return order;
    }

    /**
     * Customer confirms they received the order. Completes the order and pays
     * the buyer's (and referrer's) reward into their wallets, exactly once.
     */
    static async confirmDelivery(orderId, userId) {
        if (!mongoose.Types.ObjectId.isValid(String(orderId))) {
            throw new AppError('Invalid order ID', 400);
        }

        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                const order = await Order.findOne({
                    _id: orderId,
                    $or: [{ buyer: userId }, { userId }]
                }).session(session);

                if (!order) {
                    throw new AppError('Order not found', 404);
                }
                if (order.customerConfirmed || order.status === 'completed') {
                    throw new AppError('You have already confirmed this order', 400);
                }
                if (order.status !== 'delivered') {
                    throw new AppError('You can confirm this order once the marketer has marked it as delivered', 400);
                }

                result = await this.completeOrder(order, userId, 'Delivery confirmed by customer', session);
            });
            return result;
        } finally {
            await session.endSession();
        }
    }

    /**
     * Admin completes a delivered order on the customer's behalf (e.g. the
     * customer confirmed by phone). Pays the reward exactly like a customer
     * confirmation does.
     */
    static async completeByAdmin(orderId, adminId, note = '') {
        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                const order = await Order.findById(orderId).session(session);
                if (!order) {
                    throw new AppError('Order not found', 404);
                }
                if (order.status === 'completed') {
                    throw new AppError('This order is already completed', 400);
                }
                if (!order.isPaid || order.status !== 'delivered') {
                    throw new AppError('Only paid orders that the marketer has marked as delivered can be completed', 400);
                }
                result = await this.completeOrder(order, adminId, note || 'Completed by admin on behalf of the customer', session);
            });
            return result;
        } finally {
            await session.endSession();
        }
    }

    // Marks a delivered order completed, pays the reward and frees the marketer.
    // Must run inside the caller's transaction.
    static async completeOrder(order, actorId, note, session) {
        const buyer = await User.findById(order.userId || order.buyer).session(session);
        if (!buyer) {
            throw new AppError('Customer account not found', 404);
        }

        const now = new Date();
        order.customerConfirmed = true;
        order.confirmedAt = now;
        order.completedAt = now;
        order.status = 'completed';
        order.$locals.skipStatusHistory = true;
        order.statusHistory.push({ status: 'completed', changedBy: actorId, note });

        const earnings = await releaseOrderEarnings(order, buyer, session);
        await order.save({ session });

        if (order.marketer) {
            await User.updateOne(
                { _id: order.marketer },
                { $inc: { assignedOrdersCount: -1, completedOrdersCount: 1 } },
                { session }
            );
            // Keep the counter from going negative on old data
            await User.updateOne(
                { _id: order.marketer, assignedOrdersCount: { $lt: 0 } },
                { $set: { assignedOrdersCount: 0 } },
                { session }
            );
        }

        return {
            order,
            earnings: {
                total: earnings.total || 0,
                yourShare: earnings.buyerShare || 0,
                referrerShare: earnings.referrerShare || 0,
                rate: earnings.rate || 0
            }
        };
    }
}

export default MarketerService;
