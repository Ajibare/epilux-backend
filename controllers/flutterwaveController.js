import mongoose from 'mongoose';
import FlutterwaveService from '../services/flutterwaveService.js';
import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';

const isOwnerOrAdmin = (order, user) =>
    user.role === 'admin' || String(order.userId) === String(user._id || user.id);

export const initializeFlutterwavePayment = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { email, phone, name } = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            throw new AppError('Invalid order ID', 400);
        }

        const order = await Order.findById(orderId);
        if (!order) {
            throw new AppError('Order not found', 404);
        }
        if (!isOwnerOrAdmin(order, req.user)) {
            throw new AppError('Not authorized to pay for this order', 403);
        }

        const customerEmail = email || req.user.email;
        if (!customerEmail) {
            throw new AppError('An email address is required for payment', 400);
        }

        const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
        const result = await FlutterwaveService.initializePayment(
            order,
            {
                email: customerEmail,
                phone: phone || req.user.profile?.phone,
                name: name || [req.user.firstName, req.user.lastName].filter(Boolean).join(' ')
            },
            `${frontendUrl}/payment/callback`
        );

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        next(error);
    }
};

export const verifyFlutterwavePayment = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        if (!transactionId) {
            throw new AppError('Transaction ID is required', 400);
        }

        const result = await FlutterwaveService.verifyPayment(transactionId, req.user);

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        next(error);
    }
};

export const flutterwaveWebhook = async (req, res, next) => {
    try {
        const signature = req.headers['verif-hash'];
        if (!signature) {
            return res.status(401).json({ status: 'error', message: 'No signature provided' });
        }

        const result = await FlutterwaveService.handleWebhook(req.body, signature);
        res.status(200).json(result);

    } catch (error) {
        next(error);
    }
};

export const getFlutterwavePaymentStatus = async (req, res, next) => {
    try {
        const { reference } = req.params;
        const order = await Order.findOne({ 'payment.reference': reference });

        if (!order || !isOwnerOrAdmin(order, req.user)) {
            throw new AppError('Order not found', 404);
        }

        res.status(200).json({
            success: true,
            data: {
                status: order.payment.status,
                reference: order.payment.reference,
                amount: order.payment.amount,
                orderId: order._id,
                provider: 'flutterwave'
            }
        });
    } catch (error) {
        next(error);
    }
};
