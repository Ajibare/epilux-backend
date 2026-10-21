import mongoose from 'mongoose';
import Order from '../models/Order.js';
import { REFERRAL_SPLIT } from '../config/commissionConfig.js';

class SeasonalPromoService {
    // Define seasonal promotions with date ranges
    static seasonalPromotions = [
        {
            name: 'Christmas Sale',
            startDate: new Date('2023-12-01'),
            endDate: new Date('2023-12-31'),
            commissionRate: 15, // 15% commission during Christmas
            isActive: false
        },
        {
            name: 'Black Friday',
            startDate: new Date('2023-11-20'),
            endDate: new Date('2023-11-27'),
            commissionRate: 20, // 20% commission during Black Friday
            isActive: false
        },
        // Add more seasonal promotions as needed
    ];

    // Check for active seasonal promotions
    static getCurrentPromo() {
        const now = new Date();
        return this.seasonalPromotions.find(promo => 
            now >= promo.startDate && now <= promo.endDate
        ) || null;
    }

    // Apply seasonal promotion to an order
    static async applySeasonalPromo(orderId) {
        const currentPromo = this.getCurrentPromo();
        if (!currentPromo) return null;

        const order = await Order.findById(orderId);
        if (!order) return null;

        order.isSeasonalPromo = true;
        order.seasonalPromoRate = currentPromo.commissionRate;
        
        // Update commission rate if seasonal rate is higher
        if (order.commissionRate < currentPromo.commissionRate) {
            order.commissionRate = currentPromo.commissionRate;
        }

        await order.save();
        return order;
    }

    // Update referral commission split (50/50 by default)
    static async updateReferralCommission(orderId, referrerId) {
        const order = await Order.findById(orderId);
        if (!order) return null;

        // Commission is earned on goods only (older orders have no subtotal)
        const commissionBase = order.subtotal || order.totalAmount;

        // If no referrer, use default commission
        if (!referrerId) {
            order.referralInfo = {
                referredBy: null,
                referralCommissionRate: order.commissionRate,
                referrerShare: 0,
                userShare: commissionBase * (order.commissionRate / 100)
            };
        } else {
            // Referred buyer keeps 60%, referrer gets 40% (projected; paid on delivery confirmation)
            const totalCommission = commissionBase * (order.commissionRate / 100);
            const referrerShare = Math.round(totalCommission * REFERRAL_SPLIT.REFERRER * 100) / 100;

            order.referralInfo = {
                referredBy: referrerId,
                referralCommissionRate: order.commissionRate,
                referrerShare,
                userShare: Math.round((totalCommission - referrerShare) * 100) / 100
            };
        }

        await order.save();
        return order;
    }
}

export default SeasonalPromoService;
