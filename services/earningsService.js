import mongoose from 'mongoose';
import CommissionRate from '../models/CommissionRate.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import AffiliateCommission from '../models/AffiliateCommission.js';
import User from '../models/User.js';
import { REFERRAL_SPLIT } from '../config/commissionConfig.js';
import { AppError } from '../middleware/errorHandler.js';

// All money is rounded to kobo
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const DEFAULT_SETTINGS = {
    commissionRate: 10,
    excludedRoles: ['admin', 'marketer'],
    withdrawalWindow: { startDay: 26, endDay: 30 }
};

/** Global commission settings managed by the admin */
export const getCommissionSettings = async (session = null) => {
    const query = CommissionRate.findOne();
    if (session) query.session(session);
    const settings = await query.lean();
    return {
        commissionRate: settings?.commissionRate ?? DEFAULT_SETTINGS.commissionRate,
        excludedRoles: settings?.excludedRoles ?? DEFAULT_SETTINGS.excludedRoles,
        withdrawalWindow: {
            startDay: settings?.withdrawalWindow?.startDay ?? DEFAULT_SETTINGS.withdrawalWindow.startDay,
            endDay: settings?.withdrawalWindow?.endDay ?? DEFAULT_SETTINGS.withdrawalWindow.endDay
        }
    };
};

/** The commission rate (percent) a buyer earns on new orders */
export const getBuyerCommissionRate = async (buyer, session = null) => {
    const settings = await getCommissionSettings(session);
    if (!buyer || settings.excludedRoles.includes(buyer.role)) return 0;
    return Math.max(0, Math.min(100, Number(settings.commissionRate) || 0));
};

/**
 * Whether today falls inside the monthly withdrawal window. The end day is
 * capped at the month's last day so e.g. 26–30 still works in February.
 */
export const getWithdrawalWindowStatus = async (now = new Date()) => {
    const { withdrawalWindow } = await getCommissionSettings();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const startDay = Math.min(withdrawalWindow.startDay, lastDayOfMonth);
    const endDay = Math.min(withdrawalWindow.endDay, lastDayOfMonth);
    const today = now.getDate();
    const isOpen = today >= startDay && today <= endDay;

    // Next opening: this month if still ahead, otherwise next month
    let next = new Date(now.getFullYear(), now.getMonth(), startDay);
    if (today > endDay) {
        const nextMonthLast = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
        next = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(withdrawalWindow.startDay, nextMonthLast));
    }
    const closes = new Date(now.getFullYear(), now.getMonth(), endDay, 23, 59, 59);

    return { isOpen, startDay: withdrawalWindow.startDay, endDay: withdrawalWindow.endDay, nextOpensAt: isOpen ? null : next, closesAt: isOpen ? closes : null };
};

/**
 * Credit or debit a wallet and record it in the ledger, exactly once per
 * reference. Calling again with the same reference is a no-op that returns the
 * original transaction, so retries can never pay twice.
 */
export const postWalletTransaction = async ({ userId, amount, type, reference, description, metadata = {}, session }) => {
    const existing = await WalletTransaction.findOne({ reference }).session(session || null);
    if (existing) return { transaction: existing, duplicate: true };

    const value = roundMoney(amount);
    const isCredit = value > 0;

    const update = {
        $inc: {
            availableBalance: value,
            ...(isCredit && type === 'commission' ? { totalEarned: value } : {})
        },
        $set: { lastUpdated: new Date() },
        $setOnInsert: { currency: 'NGN' }
    };

    // Debits must never take the balance below zero
    const filter = { userId };
    if (!isCredit) filter.availableBalance = { $gte: Math.abs(value) };

    const wallet = await Wallet.findOneAndUpdate(filter, update, {
        new: true,
        upsert: isCredit,
        session,
        setDefaultsOnInsert: true
    });

    if (!wallet) {
        throw new AppError('Insufficient wallet balance', 400);
    }

    const [transaction] = await WalletTransaction.create([{
        walletId: wallet._id,
        userId,
        amount: value,
        type,
        status: 'completed',
        reference,
        description,
        metadata,
        availableBalance: wallet.availableBalance,
        lockedAmount: wallet.lockedAmount
    }], { session });

    return { transaction, wallet, duplicate: false };
};

/** Who referred this buyer (if anyone still active) */
const findReferrer = async (buyer, session) => {
    const referrerId = buyer?.referredBy?.user;
    if (!referrerId || String(referrerId) === String(buyer._id)) return null;
    const referrer = await User.findById(referrerId).session(session).select('_id role suspended firstName lastName');
    return referrer && referrer.suspended !== true ? referrer : null;
};

/**
 * Work out how an order's commission is split.
 * Commission = goods subtotal × the rate captured on the order when it was placed.
 */
export const calculateOrderEarnings = async (order, buyer, session = null) => {
    // Orders placed before pricing was snapshotted have subtotal 0 and a
    // default commissionRate of 0 that nobody chose: price them from their
    // items and the current rate instead of paying nothing.
    const isLegacy = !(Number(order.subtotal) > 0);
    const itemsTotal = (order.items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
    const base = isLegacy
        ? roundMoney(itemsTotal || Math.max(0, order.totalAmount - (order.deliveryFee || 0)))
        : order.subtotal;
    let rate = Number(order.commissionRate) || 0;
    if (isLegacy && rate === 0) rate = await getBuyerCommissionRate(buyer, session);
    const total = roundMoney((base * rate) / 100);
    const referrer = total > 0 ? await findReferrer(buyer, session) : null;

    const referrerShare = referrer ? roundMoney(total * REFERRAL_SPLIT.REFERRER) : 0;
    const buyerShare = roundMoney(total - referrerShare);

    return { base, rate, total, buyerShare, referrerShare, referrer };
};

/**
 * Pay out an order's commission to the buyer (and their referrer) after the
 * customer confirms delivery. Must run inside the caller's transaction.
 */
export const releaseOrderEarnings = async (order, buyer, session) => {
    if (order.commissionReleased) {
        return { alreadyReleased: true };
    }

    const earnings = await calculateOrderEarnings(order, buyer, session);

    if (earnings.buyerShare > 0) {
        await postWalletTransaction({
            userId: buyer._id,
            amount: earnings.buyerShare,
            type: 'commission',
            reference: `EARN-${order._id}-BUYER`,
            description: `Reward for order ${order.orderNumber}`,
            metadata: { orderId: order._id, orderNumber: order.orderNumber, rate: earnings.rate, share: earnings.referrer ? REFERRAL_SPLIT.BUYER : 1 },
            session
        });
        await User.updateOne(
            { _id: buyer._id },
            { $inc: { 'stats.totalCommissionEarned': earnings.buyerShare, 'commissionBalance.lifetime': earnings.buyerShare } },
            { session }
        );
    }

    if (earnings.referrerShare > 0 && earnings.referrer) {
        await postWalletTransaction({
            userId: earnings.referrer._id,
            amount: earnings.referrerShare,
            type: 'commission',
            reference: `EARN-${order._id}-REFERRER`,
            description: `Referral reward from order ${order.orderNumber}`,
            metadata: { orderId: order._id, orderNumber: order.orderNumber, referredUser: buyer._id, rate: earnings.rate, share: REFERRAL_SPLIT.REFERRER },
            session
        });
        await User.updateOne(
            { _id: earnings.referrer._id },
            { $inc: { 'stats.totalCommissionEarned': earnings.referrerShare, 'commissionBalance.lifetime': earnings.referrerShare } },
            { session }
        );
        await AffiliateCommission.create([{
            affiliate: earnings.referrer._id,
            referredUser: buyer._id,
            order: order._id,
            amount: earnings.referrerShare,
            commissionRate: earnings.rate * REFERRAL_SPLIT.REFERRER,
            status: 'paid',
            paidAt: new Date(),
            paymentMethod: 'wallet',
            paymentReference: `EARN-${order._id}-REFERRER`,
            notes: `40% referral share of ${earnings.rate}% commission`
        }], { session });
    }

    order.commissionAmount = earnings.total;
    order.commissionReleased = true;
    order.commissionProcessed = true;
    order.referralInfo = {
        referredBy: earnings.referrer?._id || null,
        referralCommissionRate: earnings.rate,
        referrerShare: earnings.referrerShare,
        userShare: earnings.buyerShare
    };

    return earnings;
};

/** Refund a wallet-paid order back to the buyer's wallet (once). */
export const refundWalletPayment = async (order, session = null, reason = 'Order cancelled') => {
    if (order.paymentMethod !== 'wallet' || !order.isPaid) return null;
    return postWalletTransaction({
        userId: order.userId,
        amount: order.totalAmount,
        type: 'refund',
        reference: `REFUND-${order._id}`,
        description: `${reason}: refund for order ${order.orderNumber}`,
        metadata: { orderId: order._id, orderNumber: order.orderNumber },
        session
    });
};

export const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

export default {
    getCommissionSettings,
    getBuyerCommissionRate,
    getWithdrawalWindowStatus,
    postWalletTransaction,
    calculateOrderEarnings,
    releaseOrderEarnings,
    refundWalletPayment
};
