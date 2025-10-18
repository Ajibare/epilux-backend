import express from 'express';
import { 
    assignDelivery, 
    markAsDelivered, 
    confirmDelivery, 
    getMarketerDeliveries,
    getDelivery,
     createDispute,
    rateOrder,
    updateDeliveryLocation
} from '../controllers/deliveryController.js';
import { authenticate as protect, admin, marketer, authorize } from '../middleware/auth.js';

const router = express.Router();

// Admin routes
router.route('/assign')
    .post(protect, admin, assignDelivery);

// Marketer routes
router.route('/marketer')
    .get(protect, marketer, getMarketerDeliveries);

router.route('/:id/deliver')
    .put(protect, marketer, markAsDelivered);

// Customer routes
router.route('/:id/confirm')
    .put(protect, confirmDelivery);

// General access (with authorization checks in controller)
router.route('/:id')
    .get(protect, getDelivery);

router.post('/orders/:id/disputes', protect, createDispute);
router.post('/orders/:id/rate', protect, rateOrder);
router.put('/orders/:id/location', protect, marketer, updateDeliveryLocation);

export default router;
