import Order from '../models/Order.js';

class WithdrawalService {
    // Calculate withdrawal window for an order
    static calculateWithdrawalWindow(orderDate = new Date()) {
        const now = new Date(orderDate);
        
        // Get the last day of the current month
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        // Calculate the withdrawal start date (5 days before the end of the month)
        const withdrawalStart = new Date(lastDay);
        withdrawalStart.setDate(lastDay.getDate() - 4); // 5-day window (inclusive)
        
        // If today is before the withdrawal window, set for next month
        if (now < withdrawalStart) {
            withdrawalStart.setMonth(withdrawalStart.getMonth() - 1);
            lastDay.setMonth(lastDay.getMonth()); // Keep lastDay in current month
        }
        
        return {
            availableFrom: withdrawalStart,
            availableUntil: lastDay,
            isActive: now >= withdrawalStart && now <= lastDay
        };
    }

    // Check if an order is eligible for withdrawal
    static async checkWithdrawalEligibility(orderId) {
        const order = await Order.findById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        // If already processed, return current status
        if (order.withdrawalProcessed) {
            return {
                eligible: true,
                processed: true,
                available: false,
                message: 'Withdrawal already processed'
            };
        }

        // Check if order is eligible for withdrawal
        if (!order.commissionReleased) {
            return {
                eligible: false,
                processed: false,
                available: false,
                message: 'Commission not yet released'
            };
        }

        const window = this.calculateWithdrawalWindow(order.confirmedAt || new Date());
        const now = new Date();
        
        // Update order with current withdrawal window if needed
        if (!order.withdrawalAvailableFrom || 
            order.withdrawalAvailableFrom.getTime() !== window.availableFrom.getTime()) {
            
            order.withdrawalEligible = true;
            order.withdrawalAvailableFrom = window.availableFrom;
            order.withdrawalAvailableUntil = window.availableUntil;
            await order.save();
        }

        return {
            eligible: true,
            processed: false,
            available: window.isActive,
            availableFrom: window.availableFrom,
            availableUntil: window.availableUntil,
            currentDate: now,
            message: window.isActive 
                ? 'Withdrawal is currently available' 
                : `Next withdrawal window: ${window.availableFrom.toLocaleDateString()} to ${window.availableUntil.toLocaleDateString()}`
        };
    }

    // Request withdrawal for an order
    static async requestWithdrawal(orderId, userId) {
        const order = await Order.findOne({
            _id: orderId,
            buyer: userId,
            commissionReleased: true,
            withdrawalProcessed: false
        });

        if (!order) {
            throw new Error('Order not found or not eligible for withdrawal');
        }

        const eligibility = await this.checkWithdrawalEligibility(orderId);
        if (!eligibility.available) {
            throw new Error('Withdrawal is not currently available for this order');
        }

        order.withdrawalRequested = true;
        order.withdrawalRequestedAt = new Date();
        await order.save();

        // TODO: Trigger withdrawal processing (e.g., add to withdrawal queue)
        
        return {
            success: true,
            message: 'Withdrawal request submitted',
            orderId: order._id,
            amount: order.totalAmount * (order.commissionRate / 100)
        };
    }

    // Process pending withdrawals (to be called by a scheduled job)
    static async processPendingWithdrawals() {
        const now = new Date();
        const window = this.calculateWithdrawalWindow();
        
        if (!window.isActive) {
            return { processed: 0, message: 'Not in withdrawal window' };
        }

        // Find all eligible orders with requested withdrawals
        const orders = await Order.find({
            withdrawalEligible: true,
            withdrawalRequested: true,
            withdrawalProcessed: false,
            withdrawalAvailableFrom: { $lte: now },
            withdrawalAvailableUntil: { $gte: now }
        });

        let processedCount = 0;
        
        // Process each withdrawal
        for (const order of orders) {
            try {
                // TODO: Implement actual withdrawal processing (e.g., transfer to user's wallet)
                
                order.withdrawalProcessed = true;
                order.withdrawalProcessedAt = now;
                await order.save();
                
                // TODO: Send notification to user about successful withdrawal
                
                processedCount++;
            } catch (error) {
                console.error(`Error processing withdrawal for order ${order._id}:`, error);
                // TODO: Log error and maybe retry later
            }
        }

        return {
            processed: processedCount,
            total: orders.length,
            message: `Processed ${processedCount} withdrawal(s)`
        };
    }
}

export default WithdrawalService;
