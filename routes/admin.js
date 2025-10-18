import express from 'express';
import { authenticate, authorize, ROLES } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';
import { uploadProductImages } from '../middleware/upload.js';
import * as productController from '../controllers/productController.js';
import * as orderController from '../controllers/orderController.js';

const router = express.Router();

// Admin dashboard stats
router.get('/dashboard/stats', authenticate, authorize(ROLES.ADMIN), adminController.getDashboardStats);

// User management routes
router.route('/users')
  .get(authenticate, authorize(ROLES.ADMIN), adminController.getUsers)
  .post(authenticate, authorize(ROLES.ADMIN), adminController.createUser);

router.route('/users/:id')
  .get(authenticate, authorize(ROLES.ADMIN), adminController.getUser)
  .put(authenticate, authorize(ROLES.ADMIN), adminController.updateUser)
  .delete(authenticate, authorize(ROLES.ADMIN), adminController.deleteUser);

router.put('/users/:id/suspend', authenticate, authorize(ROLES.ADMIN), adminController.suspendUser);
router.put('/users/:id/role', authenticate, authorize(ROLES.ADMIN), adminController.updateUserRole);

// Product management routes
router.route('/products')
  .get(authenticate, authorize(ROLES.ADMIN), productController.getProducts)
  .post(authenticate, authorize(ROLES.ADMIN), uploadProductImages, productController.createProduct);

router.route('/products/:id')
  .get(authenticate, authorize(ROLES.ADMIN), productController.getProduct)
  .put(authenticate, authorize(ROLES.ADMIN), uploadProductImages, productController.updateProduct)
  .delete(authenticate, authorize(ROLES.ADMIN), productController.deleteProduct);

router.get('/products/categories', authenticate, authorize(ROLES.ADMIN), productController.getCategories);

// Order management routes
router.get('/orders', authenticate, authorize(ROLES.ADMIN), orderController.getOrders);
router.get('/orders/:id', authenticate, authorize(ROLES.ADMIN), orderController.getOrder);
router.put('/orders/:id/status', authenticate, authorize(ROLES.ADMIN), orderController.updateOrderStatus);
router.get('/orders/stats', authenticate, authorize(ROLES.ADMIN), orderController.getOrderStats);

// Affiliate management routes
router.get('/affiliates', authenticate, authorize(ROLES.ADMIN), adminController.getAffiliates);
router.get('/affiliates/:id', authenticate, authorize(ROLES.ADMIN), adminController.getAffiliate);
router.put('/affiliates/:id/status', authenticate, authorize(ROLES.ADMIN), adminController.updateAffiliateStatus);
router.get('/affiliates/:id/commissions', authenticate, authorize(ROLES.ADMIN), adminController.getAffiliateCommissions);
router.post('/affiliates/commissions', authenticate, authorize(ROLES.ADMIN), adminController.createCommission);

// Commission management routes
router.get('/commissions', authenticate, authorize(ROLES.ADMIN), adminController.getAffiliateCommissions);
router.put('/commissions/:id/status', authenticate, authorize(ROLES.ADMIN), adminController.updateCommissionStatus);

// Withdrawal management routes
router.get('/withdrawals', authenticate, authorize(ROLES.ADMIN), adminController.getWithdrawals);
router.put('/withdrawals/:id/status', authenticate, authorize(ROLES.ADMIN), adminController.updateWithdrawalStatus);

// Settings routes
router.route('/settings')
  .get(authenticate, authorize(ROLES.ADMIN), adminController.getSettings)
  .put(authenticate, authorize(ROLES.ADMIN), adminController.updateSettings);

export default router;
