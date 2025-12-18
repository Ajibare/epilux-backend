import axios from 'axios';
import dotenv from 'dotenv';
import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';

dotenv.config();

const WEMA_BASE_URL = process.env.WEMA_BASE_URL || 'https://api.wemabank.com/merchant-api/v1';
const MERCHANT_ID = process.env.WEMA_MERCHANT_ID;
const API_KEY = process.env.WEMA_API_KEY;

class PaymentService {
    static async initializePayment(orderId, amount, customerEmail, callbackUrl) {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                throw new AppError('Order not found', 404);
            }

            const payload = {
                merchantId: MERCHANT_ID,
                amount: amount * 100, // Convert to kobo
                customerEmail,
                customerName: order.customerInfo?.name || 'Customer',
                paymentReference: `ORDER-${order.orderNumber}-${Date.now()}`,
                paymentDescription: `Payment for Order #${order.orderNumber}`,
                callbackUrl
            };

            const response = await axios.post(
                `${WEMA_BASE_URL}/transactions/initiate`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`
                    }
                }
            );

            // Save payment reference to order
            order.payment = {
                reference: payload.paymentReference,
                status: 'pending',
                method: 'wema',
                amount: amount,
                initiatedAt: new Date()
            };
            await order.save();

            return {
                paymentUrl: response.data.data.paymentUrl,
                paymentReference: payload.paymentReference
            };

        } catch (error) {
            console.error('Payment initialization error:', error.response?.data || error.message);
            throw new AppError(
                error.response?.data?.message || 'Failed to initialize payment',
                error.response?.status || 500
            );
        }
    }

    static async verifyPayment(paymentReference) {
        try {
            const response = await axios.get(
                `${WEMA_BASE_URL}/transactions/verify/${paymentReference}`,
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`
                    }
                }
            );

            const { status, amount, transactionDate } = response.data.data;

            // Update order with payment status
            const order = await Order.findOne({ 'payment.reference': paymentReference });
            if (order) {
                order.payment.status = status.toLowerCase();
                order.payment.verifiedAt = new Date();
                order.payment.amountPaid = amount / 100; // Convert back to Naira
                
                if (status.toLowerCase() === 'success') {
                    order.status = 'processing'; // Update order status
                }
                
                await order.save();
            }

            return {
                status,
                amount: amount / 100,
                transactionDate,
                orderId: order?._id
            };

        } catch (error) {
            console.error('Payment verification error:', error.response?.data || error.message);
            throw new AppError(
                error.response?.data?.message || 'Failed to verify payment',
                error.response?.status || 500
            );
        }
    }

    static async handleWebhook(payload) {
        try {
            const { event, data } = payload;
            
            if (event === 'charge.success') {
                return await this.verifyPayment(data.reference);
            }

            return { status: 'ignored', message: 'No action taken' };

        } catch (error) {
            console.error('Webhook processing error:', error);
            throw error;
        }
    }
}

export default PaymentService;
