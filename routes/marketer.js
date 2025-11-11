import express from 'express';
import { authenticate as protect, authorize } from '../middleware/auth.js';
import * as marketerController from '../controllers/marketerController.js';

const router = express.Router();

// @desc    Get marketer dashboard with order statistics
// @route   GET /api/marketer/dashboard
// @access  Private/Marketer
router.get('/dashboard', protect, marketerController.getDashboard);

// @desc    Get marketer's assigned orders
// @route   GET /api/marketer/orders
// @access  Private/Marketer
router.get('/orders', protect, marketerController.getAssignedOrders);

// @desc    Update order status
// @route   PUT /api/marketer/orders/:id/status
// @access  Private/Marketer
router.put('/orders/:id/status', protect, marketerController.updateOrderStatus);

// @desc    Get order details
// @route   GET /api/marketer/orders/:id
// @access  Private/Marketer
router.get('/orders/:id', protect, async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            marketer: req.user.id
        })
        .populate('userId', 'name email phone address')
        .populate('items.productId', 'name price images');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or not assigned to you'
            });
        }

        res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Get order details error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});






// Add this near the top with other imports
import { getAllMarketersWithProducts } from '../controllers/marketerController.js';

// Add this route (before the export statement)
router.get('/admin/marketers', protect, authorize('admin'), getAllMarketersWithProducts);

export default router;