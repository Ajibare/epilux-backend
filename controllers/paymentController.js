import PaymentService from '../services/paymentService.js';
import { AppError } from '../middleware/errorHandler.js';

export const initializePayment = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { amount, email, callbackUrl } = req.body;

        if (!orderId || !amount || !email) {
            throw new AppError('Missing required parameters', 400);
        }

        const { paymentUrl, paymentReference } = await PaymentService.initializePayment(
            orderId,
            amount,
            email,
            callbackUrl || `${process.env.FRONTEND_URL}/payment/callback`
        );

        res.status(200).json({
            success: true,
            data: {
                paymentUrl,
                paymentReference
            }
        });

    } catch (error) {
        next(error);
    }
};

export const verifyPayment = async (req, res, next) => {
    try {
        const { reference } = req.params;
        const result = await PaymentService.verifyPayment(reference);
        
        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        next(error);
    }
};

export const webhookHandler = async (req, res, next) => {
    try {
        // Verify webhook signature here (recommended)
        // const signature = req.headers['x-wema-signature'];
        // verifySignature(signature, req.rawBody);
        
        const result = await PaymentService.handleWebhook(req.body);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

// Add this to handle payment verification from frontend
export const checkPaymentStatus = async (req, res, next) => {
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
                orderId: order._id
            }
        });
    } catch (error) {
        next(error);
    }
};
