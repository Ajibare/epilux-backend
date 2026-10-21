import express from 'express';
import { authenticate as protect } from '../middleware/auth.js';
import { 
    rateProduct, 
    getProductRatings, 
    getUserRatings, 
    getProductRatingSummary 
} from '../controllers/orderController.js';

const router = express.Router();

// Rate a product from an order
router.post('/orders/:orderId/products/:productId/rate', protect, rateProduct);

// Get all ratings for a product
router.get('/products/:productId/ratings', getProductRatings);

// Get rating summary for a product
router.get('/products/:productId/ratings/summary', getProductRatingSummary);

// Get current user's ratings
router.get('/users/me/ratings', protect, getUserRatings);

export default router;
