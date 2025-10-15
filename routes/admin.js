import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getDashboardStats,
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  suspendUser,
  getRecentAffiliateActivity,
  getAffiliates,
  getAffiliate,
  updateAffiliateStatus,
  getAffiliateCommissions,
  createCommission,
  updateCommissionStatus,
  getWithdrawals,
  updateWithdrawalStatus,
  getSettings,
  updateSettings
} from '../controllers/adminController.js';
import { uploadProductImages } from '../middleware/upload.js';
import {
  getProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  getCategories
} from '../controllers/productController.js';
import {
  getOrders,
  getOrder,
  updateOrderStatus,
  getOrderStats
} from '../controllers/orderController.js';
import User from '../models/User.js';

const router = express.Router();

// Admin dashboard stats
router.get('/dashboard/stats', authenticate, authorize('admin'), getDashboardStats);

// User management routes
router.post('/users', authenticate, authorize('admin'), createUser);
router.get('/users', authenticate, authorize('admin'), getUsers);
router.get('/users/:id', authenticate, authorize('admin'), getUser);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.put('/users/:id/suspend', authenticate, authorize('admin'), suspendUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

// Product management routes
router.get('/products', authenticate, authorize('admin'), getProducts);
router.post(
  '/products',
  authenticate,
  authorize('admin'),
  uploadProductImages,
  createProduct
);
router.get('/products/:id', authenticate, authorize('admin'), getProduct);
router.put('/products/:id', authenticate, authorize('admin'), updateProduct);
router.delete('/products/:id', authenticate, authorize('admin'), deleteProduct);
router.get('/products/categories', authenticate, authorize('admin'), getCategories);

// Order management routes
router.get('/orders', authenticate, authorize('admin'), getOrders);
router.get('/orders/stats', authenticate, authorize('admin'), getOrderStats);
router.get('/orders/:id', authenticate, authorize('admin'), getOrder);
router.put('/orders/:id/status', authenticate, authorize('admin'), updateOrderStatus);

// Affiliate management routes
router.get('/affiliates', authenticate, authorize('admin'), getAffiliates);
router.get('/affiliates/:id', authenticate, authorize('admin'), getAffiliate);
router.put('/affiliates/:id/status', authenticate, authorize('admin'), updateAffiliateStatus);
router.get('/affiliates/:id/commissions', authenticate, authorize('admin'), getAffiliateCommissions);
router.post('/affiliates/:id/commission', authenticate, authorize('admin'), createCommission);
router.put('/commissions/:id/status', authenticate, authorize('admin'), updateCommissionStatus);

// Withdrawal management routes
router.get('/withdrawals', authenticate, authorize('admin'), getWithdrawals);
router.put('/withdrawals/:id/status', authenticate, authorize('admin'), updateWithdrawalStatus);

// System settings routes
router.get('/settings', authenticate, authorize('admin'), getSettings);
router.put('/settings', authenticate, authorize('admin'), updateSettings);

// Update user role (admin only)
router.put('/users/:id/role', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { role } = req.body;
        
        if (!['user', 'admin', 'affiliate'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User role updated successfully',
            user
        });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user role'
        });
    }
});


// Get recent users (admin only)
router.get('/users/recent', authenticate, authorize('admin'), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const recentUsers = await User.find()
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit);

        res.json({
            success: true,
            users: recentUsers
        });
    } catch (error) {
        console.error('Error fetching recent users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recent users'
        });
    }
});

export default router;
