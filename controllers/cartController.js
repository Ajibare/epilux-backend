import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import { AppError, NotFoundError } from '../middleware/errorHandler.js';
import { catchAsync } from '../middleware/errorHandler.js';

/**
 * @desc    Get user's cart
 * @route   GET /api/cart
 * @access  Private
 */
export const getCart = async (req, res, next) => {
  try {
    if (!req.user?._id) {
      return next(new AppError('User not authenticated', 401));
    }

    const cart = await Cart.findOne({ user: req.user._id })
      .populate('items.product', 'name price images stock');

    if (!cart) {
      return res.status(200).json({
        success: true,
        data: {
          items: [],
          totalItems: 0,
          subtotal: 0
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: cart._id,
        items: cart.items,
        totalItems: cart.totalItems,
        subtotal: cart.subtotal,
        updatedAt: cart.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add item to cart
 * @route   POST /api/cart/items
 * @access  Private
 */
export const addToCart = async (req, res, next) => {
  try {
    console.log('Add to cart request body:', req.body);
    const { productId, quantity = 1 } = req.body;

    // Validate input
    if (!productId) {
      console.log('Product ID is missing in request');
      return next(new AppError('Product ID is required', 400));
    }

    // Get product details - try both ObjectId and slug lookups
    console.log('Looking up product with ID/slug:', productId);
    
    let product;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(productId);
    
    if (isObjectId) {
      product = await Product.findById(productId);
    } else {
      // Try to find by slug if it's not a valid ObjectId
      product = await Product.findOne({ slug: productId });
    }
    
    if (!product) {
      console.log('Product not found with ID/slug:', productId);
      return next(new NotFoundError('Product not found'));
    }
    console.log('Found product:', {
      id: product._id,
      name: product.name,
      stock: product.stock,
      hasImages: product.images && product.images.length > 0
    });

    // Check if product is in stock
    if (product.stock < quantity) {
      return next(new AppError(`Only ${product.stock} items available in stock`, 400));
    }

    // Find user's cart or create new one if it doesn't exist
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = new Cart({
        user: req.user._id,
        items: []
      });
    }

    // Check if product already in cart
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      // Update quantity if product already in cart
      cart.items[itemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      if (!product.images || product.images.length === 0) {
        return next(new AppError('Product must have at least one image', 400));
      }
      
      cart.items.push({
        product: product._id,
        quantity,
        price: product.price,
        name: product.name,
        image: product.images[0] // We've already checked that images exist
      });
    }

    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Item added to cart',
      data: {
        id: cart._id,
        items: cart.items,
        totalItems: cart.totalItems,
        subtotal: cart.subtotal
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update cart item quantity
 * @route   PUT /api/cart/items/:itemId
 * @access  Private
 */
export const updateCartItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return next(new AppError('Valid quantity is required', 400));
    }

    // Find the cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return next(new NotFoundError('Cart not found'));
    }

    // Find the item in cart
    const itemIndex = cart.items.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return next(new NotFoundError('Item not found in cart'));
    }

    // Check product stock
    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product) {
      return next(new NotFoundError('Product not found'));
    }

    if (product.stock < quantity) {
      return next(new AppError(`Only ${product.stock} items available in stock`, 400));
    }

    // Update quantity
    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Cart updated',
      data: {
        id: cart._id,
        items: cart.items,
        totalItems: cart.totalItems,
        subtotal: cart.subtotal
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove item from cart
 * @route   DELETE /api/cart/items/:itemId
 * @access  Private
 */
export const removeFromCart = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return next(new NotFoundError('Cart not found'));
    }

    // Check if item exists in cart
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(item => item._id.toString() !== itemId);
    
    if (initialLength === cart.items.length) {
      return next(new NotFoundError('Item not found in cart'));
    }

    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: {
        id: cart._id,
        items: cart.items,
        totalItems: cart.totalItems,
        subtotal: cart.subtotal
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear cart
 * @route   DELETE /api/cart
 * @access  Private
 */
export const clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOneAndDelete({ user: req.user._id });

    if (!cart) {
      return next(new NotFoundError('Cart not found'));
    }

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: {
        id: cart._id
      }
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
};
