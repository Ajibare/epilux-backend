import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { catchAsync } from '../middleware/errorHandler.js';
import { 
  getCart, 
  addToCart, 
  updateCartItem, 
  removeFromCart, 
  clearCart 
} from '../controllers/cartController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// @route   GET /api/cart
// @desc    Get user's cart
// @access  Private
router.get('/', catchAsync(getCart));

// @route   POST /api/cart/items
// @desc    Add item to cart
// @access  Private
router.post('/items', catchAsync(addToCart));

// @route   PUT /api/cart/items/:itemId
// @desc    Update cart item quantity
// @access  Private
router.put('/items/:itemId', catchAsync(updateCartItem));

// @route   DELETE /api/cart/items/:itemId
// @desc    Remove item from cart
// @access  Private
router.delete('/items/:itemId', catchAsync(removeFromCart));

// @route   DELETE /api/cart
// @desc    Clear cart
// @access  Private
router.delete('/', catchAsync(clearCart));

export default router;
