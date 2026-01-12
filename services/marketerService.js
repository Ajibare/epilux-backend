import Order from '../models/Order.js';
import User from '../models/User.js';
import CommissionService from './commissionService.js';
import Wallet from '../models/Wallet.js';

class MarketerService {
    // Assign order to a marketer
    static async assignOrder(orderId) {
        try {
            // Find available marketers (you can add more criteria like location, availability, etc.)
            const availableMarketers = await User.find({
                role: 'marketer',
                isActive: true
            }).sort({ assignedOrdersCount: 1 }); // Assign to marketer with least orders

            if (availableMarketers.length === 0) {
                throw new Error('No available marketers to assign');
            }

            // Get the least busy marketer
            const marketer = availableMarketers[0];
            const assignmentExpiresAt = new Date();
            assignmentExpiresAt.setDate(assignmentExpiresAt.getDate() + 7); // 7 days to deliver

            // Update order with marketer assignment
            const updatedOrder = await Order.findByIdAndUpdate(
                orderId,
                {
                    marketer: marketer._id,
                    assignedAt: new Date(),
                    assignmentExpiresAt,
                    status: 'assigned',
                    $push: {
                        previousMarketers: {
                            marketerId: marketer._id,
                            assignedAt: new Date(),
                            reason: 'Initial assignment'
                        }
                    }
                },
                { new: true }
            );

            // Increment marketer's assigned orders count
            await User.findByIdAndUpdate(marketer._id, {
                $inc: { assignedOrdersCount: 1 }
            });

            // TODO: Send notification to marketer about new assignment

            return updatedOrder;
        } catch (error) {
            console.error('Error assigning order to marketer:', error);
            throw error;
        }
    }

    // Reassign order to another marketer after expiration
    static async reassignExpiredOrders() {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Find orders assigned more than 7 days ago and not yet delivered
            const expiredOrders = await Order.find({
                status: 'assigned',
                assignmentExpiresAt: { $lte: new Date() },
                'deliveryProof': null
            }).populate('marketer', 'name email');

            for (const order of expiredOrders) {
                // Record the previous marketer assignment
                await Order.findByIdAndUpdate(order._id, {
                    $push: {
                        previousMarketers: {
                            marketerId: order.marketer._id,
                            assignedAt: order.assignedAt,
                            unassignedAt: new Date(),
                            reason: 'Assignment expired (7 days)'
                        }
                    },
                    $unset: { marketer: 1, assignedAt: 1, assignmentExpiresAt: 1 }
                });

                // Decrement previous marketer's assigned orders count
                await User.findByIdAndUpdate(order.marketer._id, {
                    $inc: { assignedOrdersCount: -1 }
                });

                // Reassign to a new marketer
                await this.assignOrder(order._id);
            }

            return { reassigned: expiredOrders.length };
        } catch (error) {
            console.error('Error reassigning expired orders:', error);
            throw error;
        }
    }

    // Mark order as delivered by marketer
    static async markAsDelivered(orderId, marketerId, deliveryProof) {
        try {
            const order = await Order.findById(orderId);
            
            if (!order) {
                throw new Error('Order not found');
            }

            if (order.marketer.toString() !== marketerId) {
                throw new Error('Not authorized to update this order');
            }

            order.deliveryProof = deliveryProof;
            order.markedDeliveredAt = new Date();
            order.status = 'delivered';
            await order.save();

            // TODO: Send notification to customer to confirm delivery

            return order;
        } catch (error) {
            console.error('Error marking order as delivered:', error);
            throw error;
        }
    }

    // Confirm order delivery by customer
    static async confirmDelivery(orderId, userId) {
        try {
            const order = await Order.findOne({
                _id: orderId,
                buyer: userId,
                status: 'delivered',
                customerConfirmed: false
            });

            if (!order) {
                throw new Error('Order not found or already confirmed');
            }

            order.customerConfirmed = true;
            order.confirmedAt = new Date();
            order.status = 'completed';
            
            // Process commission if not already processed
            if (!order.commissionReleased) {
                await CommissionService.processMarketerCommission({
                    orderId: order._id,
                    marketerId: order.marketer,
                    amount: order.totalAmount * (order.commissionRate / 100)
                });
                order.commissionReleased = true;
            }

            await order.save();

            // Decrement marketer's assigned orders count
            await User.findByIdAndUpdate(order.marketer, {
                $inc: { assignedOrdersCount: -1, completedOrdersCount: 1 }
            });

            return order;
        } catch (error) {
            console.error('Error confirming delivery:', error);
            throw error;
        }
    }

    

}

export default MarketerService;
