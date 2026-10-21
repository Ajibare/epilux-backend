import axios from 'axios';
import crypto from 'crypto';
import config from '../config/environment.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import { AppError } from '../middleware/errorHandler.js';

const FLUTTERWAVE_BASE_URL = config.FLUTTERWAVE_BASE_URL;
const FLUTTERWAVE_SECRET_KEY = config.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_PUBLIC_KEY = config.FLUTTERWAVE_PUBLIC_KEY;

const flutterwaveHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`
});

// Constant-time comparison for webhook secrets
const safeEqual = (a, b) => {
    const bufA = Buffer.from(String(a || ''));
    const bufB = Buffer.from(String(b || ''));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

class FlutterwaveService {
    /**
     * Start a hosted Flutterwave checkout for an order.
     * The amount charged is always the order's own total, never a client value.
     */
    static async initializePayment(order, customer, callbackUrl) {
        if (!FLUTTERWAVE_SECRET_KEY) {
            throw new AppError('Online payments are not configured. Please contact support.', 503);
        }

        if (order.isPaid || order.payment?.status === 'success') {
            throw new AppError('This order has already been paid', 400);
        }

        if (['cancelled', 'rejected'].includes(order.status)) {
            throw new AppError(`This order was ${order.status} and can no longer be paid`, 400);
        }

        const amount = order.totalAmount;
        const tx_ref = `ORDER-${order.orderNumber}-${Date.now()}`;
        const payload = {
            tx_ref,
            amount,
            currency: 'NGN',
            payment_options: 'card,ussd,account,banktransfer',
            redirect_url: callbackUrl,
            customer: {
                email: customer.email,
                phonenumber: customer.phone || '',
                name: customer.name || 'Customer'
            },
            customizations: {
                title: 'Epilux Water',
                description: `Payment for Order #${order.orderNumber}`,
                logo: process.env.STORE_LOGO_URL?.startsWith('http') ? process.env.STORE_LOGO_URL : undefined
            },
            meta: {
                order_id: String(order._id),
                order_number: order.orderNumber
            }
        };

        let response;
        try {
            response = await axios.post(`${FLUTTERWAVE_BASE_URL}/payments`, payload, {
                headers: flutterwaveHeaders(),
                timeout: 20000
            });
        } catch (error) {
            console.error('Flutterwave payment initialization error:', error.response?.data || error.message);
            throw new AppError(
                error.response?.data?.message || 'Failed to initialize payment. Please try again.',
                error.response?.status && error.response.status < 500 ? 400 : 502
            );
        }

        const link = response.data?.data?.link;
        if (!link) {
            throw new AppError('Payment provider did not return a checkout link', 502);
        }

        order.payment = {
            ...(order.payment?.toObject?.() || {}),
            reference: tx_ref,
            status: 'pending',
            method: 'flutterwave',
            amount,
            currency: 'NGN',
            initiatedAt: new Date()
        };
        order.paymentMethod = 'flutterwave';
        await order.save();

        return {
            paymentUrl: link,
            link,
            paymentReference: tx_ref,
            amount,
            publicKey: FLUTTERWAVE_PUBLIC_KEY
        };
    }

    /**
     * Verify a transaction with Flutterwave and settle the matching order.
     * An order is only marked paid when Flutterwave reports success for at
     * least the order total in NGN. Safe to call repeatedly.
     * @param {String} transactionId - Flutterwave transaction id
     * @param {Object} [requester] - authenticated user; must own the order unless admin
     */
    static async verifyPayment(transactionId, requester = null) {
        let data;
        try {
            const response = await axios.get(
                `${FLUTTERWAVE_BASE_URL}/transactions/${encodeURIComponent(transactionId)}/verify`,
                { headers: flutterwaveHeaders(), timeout: 20000 }
            );
            data = response.data?.data;
        } catch (error) {
            console.error('Flutterwave payment verification error:', error.response?.data || error.message);
            throw new AppError(
                error.response?.data?.message || 'Failed to verify payment',
                error.response?.status && error.response.status < 500 ? 400 : 502
            );
        }

        if (!data?.tx_ref) {
            throw new AppError('Payment could not be verified', 400);
        }

        const order = await Order.findOne({ 'payment.reference': data.tx_ref });
        if (!order) {
            throw new AppError('No order matches this payment', 404);
        }

        if (requester && requester.role !== 'admin' && String(order.userId) !== String(requester._id || requester.id)) {
            throw new AppError('Not authorized to verify this payment', 403);
        }

        const providerStatus = String(data.status || '').toLowerCase();
        const amountPaid = Number(data.amount) || 0;
        const result = {
            orderId: order._id,
            orderNumber: order.orderNumber,
            reference: data.tx_ref,
            amount: amountPaid,
            currency: data.currency
        };

        // Already settled: don't re-process
        if (order.isPaid) {
            return { ...result, status: 'success' };
        }

        order.payment.verifiedAt = new Date();
        order.payment.amountPaid = amountPaid;
        order.payment.currency = data.currency;
        order.payment.metadata = {
            ...(order.payment.metadata || {}),
            transactionId: data.id,
            flwRef: data.flw_ref,
            paymentType: data.payment_type
        };

        const paidInFull = data.currency === 'NGN' && amountPaid >= order.totalAmount;

        if (providerStatus === 'successful' && paidInFull) {
            order.payment.status = 'success';
            order.paymentStatus = 'completed';
            order.isPaid = true;
            order.paidAt = new Date();
            if (order.status === 'pending') {
                order.status = 'processing';
            }
            await order.save();

            // The cart has been checked out; empty it (best-effort)
            await Cart.deleteOne({ user: order.userId }).catch((error) =>
                console.error('Failed to clear cart after payment:', error.message)
            );

            return { ...result, status: 'success' };
        }

        if (providerStatus === 'successful' && !paidInFull) {
            // Never accept an underpayment as settled
            console.error(`Underpayment for order ${order.orderNumber}: paid ${amountPaid} ${data.currency}, expected ${order.totalAmount} NGN`);
            order.payment.status = 'failed';
            order.paymentStatus = 'failed';
            await order.save();
            return { ...result, status: 'failed', message: 'The amount paid does not match the order total. Please contact support.' };
        }

        if (providerStatus === 'failed') {
            order.payment.status = 'failed';
            order.paymentStatus = 'failed';
            await order.save();
            return { ...result, status: 'failed' };
        }

        // Still pending at the provider
        await order.save();
        return { ...result, status: 'pending' };
    }

    /**
     * Flutterwave sends the secret hash configured in the dashboard in the
     * `verif-hash` header. The transaction is re-verified with the API rather
     * than trusting the webhook body.
     */
    static async handleWebhook(payload, signature) {
        const secretHash = config.FLUTTERWAVE_WEBHOOK_HASH;
        if (!secretHash || !safeEqual(signature, secretHash)) {
            throw new AppError('Invalid webhook signature', 401);
        }

        const event = payload?.event;
        const transactionId = payload?.data?.id;

        if ((event === 'charge.completed' || event === 'charge.successful') && transactionId) {
            return await this.verifyPayment(transactionId);
        }

        return { status: 'ignored', message: 'No action taken' };
    }
}

export default FlutterwaveService;
