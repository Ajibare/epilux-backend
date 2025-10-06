import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';
import * as productController from '../controllers/productController.js';
import * as orderController from '../controllers/orderController.js';
import User from '../models/User.js';

const router = express.Router();

// Admin dashboard stats
router.get('/dashboard/stats', authenticate, authorize('admin'), adminController.getDashboardStats);

// User management routes
router.get('/users', authenticate, authorize('admin'), adminController.getUsers);
router.get('/users/:id', authenticate, authorize('admin'), adminController.getUser);
router.put('/users/:id', authenticate, authorize('admin'), adminController.updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), adminController.deleteUser);

// Product management routes
router.get('/products', authenticate, authorize('admin'), productController.getProducts);
router.post('/products', authenticate, authorize('admin'), productController.createProduct);
router.get('/products/:id', authenticate, authorize('admin'), productController.getProduct);
router.put('/products/:id', authenticate, authorize('admin'), productController.updateProduct);
router.delete('/products/:id', authenticate, authorize('admin'), productController.deleteProduct);
router.get('/products/categories', authenticate, authorize('admin'), productController.getCategories);

// Order management routes
router.get('/orders', authenticate, authorize('admin'), orderController.getOrders);
router.get('/orders/:id', authenticate, authorize('admin'), orderController.getOrder);
router.put('/orders/:id/status', authenticate, authorize('admin'), orderController.updateOrderStatus);
router.get('/orders/stats', authenticate, authorize('admin'), orderController.getOrderStats);

// Affiliate management routes
router.get('/affiliates', authenticate, authorize('admin'), adminController.getAffiliates);
router.get('/affiliates/:id', authenticate, authorize('admin'), adminController.getAffiliate);
router.put('/affiliates/:id/status', authenticate, authorize('admin'), adminController.updateAffiliateStatus);
router.get('/affiliates/:id/commissions', authenticate, authorize('admin'), adminController.getAffiliateCommissions);
router.post('/affiliates/:id/commission', authenticate, authorize('admin'), adminController.createCommission);
router.put('/commissions/:id/status', authenticate, authorize('admin'), adminController.updateCommissionStatus);

// Withdrawal management routes
router.get('/withdrawals', authenticate, authorize('admin'), adminController.getWithdrawals);
router.put('/withdrawals/:id/status', authenticate, authorize('admin'), adminController.updateWithdrawalStatus);

// System settings routes
router.get('/settings', authenticate, authorize('admin'), adminController.getSettings);
router.put('/settings', authenticate, authorize('admin'), adminController.updateSettings);

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

// Delete user (admin only)
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting user'
        });
    }
});

// Get admin dashboard stats (admin only)
router.get('/dashboard/stats', authenticate, authorize('admin'), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const adminUsers = await User.countDocuments({ role: 'admin' });
        const affiliateUsers = await User.countDocuments({ role: 'affiliate' });
        const regularUsers = await User.countDocuments({ role: 'user' });

        const stats = {
            totalUsers,
            adminUsers,
            affiliateUsers,
            regularUsers
        };

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard stats'
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
