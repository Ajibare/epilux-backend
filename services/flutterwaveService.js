import axios from 'axios';
import dotenv from 'dotenv';
import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';

dotenv.config();

const FLUTTERWAVE_BASE_URL = process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3';
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY;

class FlutterwaveService {
    static async initializePayment(orderId, amount, customer, callbackUrl) {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                throw new AppError('Order not found', 404);
            }

            const tx_ref = `ORDER-${order.orderNumber}-${Date.now()}`;
            const payload = {
                tx_ref,
                amount: amount,
                currency: 'NGN', // Default to Naira, can be made configurable
                payment_options: 'card,ussd,account,banktransfer',
                redirect_url: callbackUrl,
                customer: {
                    email: customer.email,
                    phonenumber: customer.phone || '',
                    name: customer.name || 'Customer'
                },
                customizations: {
                    title: 'Epilux Store',
                    description: `Payment for Order #${order.orderNumber}`,
                    logo: process.env.STORE_LOGO_URL || ''
                },
                meta: {
                    order_id: orderId,
                    order_number: order.orderNumber
                }
            };

            const response = await axios.post(
                `${FLUTTERWAVE_BASE_URL}/payments`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`
                    }
                }
            );

            // Save payment reference to order
            order.payment = {
                reference: tx_ref,
                status: 'pending',
                method: 'flutterwave',
                amount: amount,
                initiatedAt: new Date(),
                provider: 'flutterwave',
                providerData: {
                    flw_ref: response.data.data.flw_ref,
                    payment_type: response.data.data.payment_type
                }
            };
            await order.save();

            return {
                paymentUrl: response.data.data.link,
                paymentReference: tx_ref,
                publicKey: FLUTTERWAVE_PUBLIC_KEY
            };

        } catch (error) {
            console.error('Flutterwave payment initialization error:', error.response?.data || error.message);
            throw new AppError(
                error.response?.data?.message || 'Failed to initialize Flutterwave payment',
                error.response?.status || 500
            );
        }
    }

    static async verifyPayment(transactionId) {
        try {
            const response = await axios.get(
                `${FLUTTERWAVE_BASE_URL}/transactions/${transactionId}/verify`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`
                    }
                }
            );

            const { status, amount, currency, tx_ref, flw_ref, created_at } = response.data.data;
            
            // Find and update order
            const order = await Order.findOne({ 'payment.reference': tx_ref });
            if (order) {
                order.payment.status = status.toLowerCase();
                order.payment.verifiedAt = new Date();
                order.payment.amountPaid = amount;
                order.payment.currency = currency;
                order.payment.providerData = {
                    ...(order.payment.providerData || {}),
                    flw_ref,
                    verifiedAt: new Date(created_at)
                };
                
                if (status.toLowerCase() === 'successful') {
                    order.status = 'processing'; // Update order status
                }
                
                await order.save();
            }

            return {
                status: status.toLowerCase(),
                amount,
                currency,
                reference: tx_ref,
                orderId: order?._id
            };

        } catch (error) {
            console.error('Flutterwave payment verification error:', error.response?.data || error.message);
            throw new AppError(
                error.response?.data?.message || 'Failed to verify Flutterwave payment',
                error.response?.status || 500
            );
        }
    }

    static async handleWebhook(payload, signature) {
        try {
            // Verify webhook signature
            const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
            
            // Verify the webhook signature
            const crypto = await import('crypto');
            const hash = crypto
                .createHmac('sha512', secretHash)
                .update(JSON.stringify(payload))
                .digest('hex');

            if (hash !== signature) {
                throw new AppError('Invalid webhook signature', 401);
            }

            const { event, data } = payload;
            
            if (event === 'charge.completed' || event === 'charge.successful') {
                return await this.verifyPayment(data.id);
            }

            return { status: 'ignored', message: 'No action taken' };

        } catch (error) {
            console.error('Flutterwave webhook processing error:', error);
            throw error;
        }
    }
}

export default FlutterwaveService;
