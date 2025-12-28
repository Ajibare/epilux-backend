import FlutterwaveService from '../services/flutterwaveService.js';
import { AppError } from '../middleware/errorHandler.js';

export const initializeFlutterwavePayment = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { amount, email, phone, name } = req.body;

        if (!orderId || !amount || !email) {
            throw new AppError('Missing required parameters', 400);
        }

        const result = await FlutterwaveService.initializePayment(
            orderId,
            amount,
            { email, phone, name },
            req.body.callbackUrl || `${process.env.FRONTEND_URL}/payment/callback`
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

        const result = await FlutterwaveService.verifyPayment(transactionId);
        
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
        
        if (!order) {
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
