import mongoose from 'mongoose';
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

    let cart = await Cart.findOne({ user: req.user._id });
    
    // Refresh items from the catalogue so the cart always shows current
    // prices, names, images and stock, and drops products that are gone.
    if (cart) {
      const productIds = cart.items.map((item) => item.product);
      const products = await Product.find({ _id: { $in: productIds } }).lean();
      const byId = new Map(products.map((p) => [String(p._id), p]));

      const freshItems = [];
      for (const item of cart.items) {
        const product = byId.get(String(item.product));
        if (!product || product.isActive === false) continue;

        const primaryImg = product.images?.find((img) => img.isPrimary) || product.images?.[0];
        item.price = product.price;
        item.name = product.name;
        item.image = primaryImg?.url || item.image || '';
        item.images = (product.images || []).map((img) => ({
          url: img.url,
          isPrimary: img.isPrimary || false,
          altText: img.altText || product.name
        }));
        item.productDetails = { stock: product.stock, sku: product.sku || '' };
        freshItems.push(item);
      }

      if (freshItems.length !== cart.items.length) {
        // Persist removal of unavailable products
        cart.items = freshItems;
        await cart.save();
      }
    }

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
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return next(new AppError('User authentication required', 401));
    }

    const { productId } = req.body;
    const quantity = parseInt(req.body.quantity ?? 1, 10);

    // Validate input
    if (!productId) {
      return next(new AppError('Product ID is required', 400));
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return next(new AppError('Quantity must be a whole number of at least 1', 400));
    }

    // Get product details - try both ObjectId and slug lookups
    let product;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(productId);
    
    if (isObjectId) {
      product = await Product.findById(productId);
    } else {
      // Try to find by slug if it's not a valid ObjectId
      product = await Product.findOne({ slug: productId });
    }
    
    if (!product || product.isActive === false) {
      return next(new NotFoundError('Product not found'));
    }

    // Find user's cart or create new one if it doesn't exist
    console.log('Looking for cart with user ID:', req.user._id);
    
    // Ensure user ID is valid
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      console.error('Invalid user ID format:', req.user._id);
      return next(new AppError('Invalid user ID format', 400));
    }

    // Convert to ObjectId for consistent comparison
    const userId = new mongoose.Types.ObjectId(req.user._id);
    
    // Try to find existing cart
    let cart;
    try {
      cart = await Cart.findOne({ user: userId });
      console.log('Found existing cart:', cart ? `ID: ${cart._id}` : 'No cart found');
      
      if (!cart) {
        console.log('Creating new cart with user ID:', userId);
        
        // First, clean up any existing carts with null or missing user
        try {
          const deleteResult = await Cart.deleteMany({ 
            $or: [
              { user: null },
              { user: { $exists: false } }
            ] 
          });
          
          if (deleteResult.deletedCount > 0) {
            console.log(`Cleaned up ${deleteResult.deletedCount} carts with null or missing user`);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up null user carts:', cleanupError);
          // Continue anyway, as this isn't critical
        }

        // Now create the new cart
        cart = new Cart({
          user: userId,
          items: []
        });
        
        // Validate the cart before saving
        await cart.validate();
        console.log('New cart validated successfully:', {
          id: cart._id,
          user: cart.user,
          userType: typeof cart.user,
          userExists: !!cart.user
        });
      }
    } catch (error) {
      console.error('Error finding/creating cart:', error);
      if (error.name === 'ValidationError') {
        return next(new AppError(`Validation error: ${error.message}`, 400));
      }
      throw error;
    }

    // Process product images - simplified approach
    let primaryImage = '';
    let productImages = [];
    
    if (product.images && product.images.length > 0) {
      // Find primary image or use first one
      const primaryImg = product.images.find(img => img.isPrimary) || product.images[0];
      primaryImage = primaryImg?.url || '';
      
      // Create simplified image array
      productImages = product.images.map(img => ({
        url: img.url,
        isPrimary: img.isPrimary || false,
        altText: img.altText || product.name
      }));
      
      console.log('Product images processed:', {
        primaryImage,
        imageCount: productImages.length
      });
    } else {
      console.log('Product has no images, using placeholder');
      primaryImage = '';
      productImages = [];
    }

    // Check if product already in cart
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === product._id.toString()
    );

    // Stock check covers what's already in the cart plus what's being added
    const alreadyInCart = itemIndex > -1 ? cart.items[itemIndex].quantity : 0;
    if (product.stock < alreadyInCart + quantity) {
      const remaining = Math.max(0, product.stock - alreadyInCart);
      return next(new AppError(
        remaining > 0
          ? `Only ${remaining} more of ${product.name} can be added (${product.stock} in stock)`
          : `${product.name} is out of stock`,
        400
      ));
    }

    if (itemIndex > -1) {
      // Update quantity and refresh price if product already in cart
      cart.items[itemIndex].quantity = alreadyInCart + quantity;
      cart.items[itemIndex].price = product.price;
    } else {
      // Add new item to cart. Price and name always come from the catalogue.
      cart.items.push({
        product: product._id,
        quantity,
        price: product.price,
        name: product.name,
        image: primaryImage,
        images: productImages,
        productDetails: {
          stock: product.stock,
          sku: product.sku || ''
        }
      });
    }

    try {
      await cart.save();
      console.log('Cart saved successfully:', {
        cartId: cart._id,
        userId: cart.user,
        itemCount: cart.items.length
      });

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
    } catch (saveError) {
      console.error('Error saving cart:', {
        name: saveError.name,
        message: saveError.message,
        code: saveError.code,
        keyPattern: saveError.keyPattern,
        keyValue: saveError.keyValue,
        stack: saveError.stack
      });

      if (saveError.name === 'MongoServerError' && saveError.code === 11000) {
        // If we get a duplicate key error, try to find and use the existing cart
        try {
          console.log('Duplicate cart detected, attempting to find existing cart for user:', userId);
          const existingCart = await Cart.findOne({ user: userId });
          
          if (existingCart) {
            console.log('Found existing cart, merging items');
            // Merge items from the new cart to the existing one
            const existingItemIndex = existingCart.items.findIndex(
              item => item.product.toString() === product._id.toString()
            );

            if (existingItemIndex > -1) {
              // Update quantity if product already in cart
              existingCart.items[existingItemIndex].quantity += quantity;
            } else {
              // Add new item to existing cart
              existingCart.items.push({
                product: product._id,
                quantity: parseInt(quantity, 10),
                price: req.body.price ? parseFloat(req.body.price) : product.price,
                name: req.body.name || product.name,
                image: req.body.image || primaryImage,
                images: productImages,
                productDetails: {
                  stock: product.stock,
                  sku: product.sku || ''
                }
              });
            }

            // Save the updated cart
            await existingCart.save();
            console.log('Successfully merged with existing cart');

            return res.status(200).json({
              success: true,
              message: 'Item added to existing cart',
              data: {
                id: existingCart._id,
                items: existingCart.items,
                totalItems: existingCart.totalItems,
                subtotal: existingCart.subtotal
              }
            });
          }
        } catch (mergeError) {
          console.error('Error merging with existing cart:', mergeError);
          return next(new AppError('Error processing your cart. Please try again.', 500));
        }
      }
      
      // For other types of errors or if we couldn't merge with an existing cart
      return next(saveError);
    }
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
    // Cart items have no _id of their own, so :itemId is the product ID
    const { itemId } = req.params;
    const quantity = parseInt(req.body.quantity, 10);

    if (!Number.isInteger(quantity) || quantity < 1) {
      return next(new AppError('Valid quantity is required', 400));
    }

    // Find the cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return next(new NotFoundError('Cart not found'));
    }

    // Find the item in cart
    const itemIndex = cart.items.findIndex(
      item => item.product?.toString() === itemId
    );

    if (itemIndex === -1) {
      return next(new NotFoundError('Item not found in cart'));
    }

    // Check product stock
    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product || product.isActive === false) {
      return next(new NotFoundError('Product not found'));
    }

    if (product.stock < quantity) {
      return next(new AppError(`Only ${product.stock} of ${product.name} available in stock`, 400));
    }

    // Update quantity (and keep the price current)
    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].price = product.price;
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

    // Check if item exists in cart (:itemId is the product ID)
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(item => item.product?.toString() !== itemId);
    
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
    // Idempotent: clearing an empty or missing cart still succeeds
    const cart = await Cart.findOneAndDelete({ user: req.user._id });

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: {
        id: cart?._id || null,
        items: [],
        totalItems: 0,
        subtotal: 0
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
