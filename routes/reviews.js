import express from 'express';
import { 
    getProductReviews, 
    createReview, 
    updateReview, 
    deleteReview 
} from '../controllers/reviewController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateMongoId } from '../middleware/validation.js';

const router = express.Router({ mergeParams: true });

// Public routes
router.get('/', validateMongoId, getProductReviews);

// Protected routes (require authentication)
router.use(authenticate);

// Create a new review
router.post('/', validateMongoId, createReview);

// Update a review
router.put('/:id', validateMongoId, updateReview);

// Delete a review
router.delete('/:id', validateMongoId, deleteReview);

export default router;
