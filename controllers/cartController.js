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
    
    // If cart exists, populate product details
    if (cart) {
      // Get fresh product data to ensure we have the latest info
      for (const item of cart.items) {
        const product = await Product.findById(item.product);
        if (product) {
          // Update item with latest product data
          item.productDetails = {
            name: product.name,
            price: product.price,
            stock: product.stock,
            sku: product.sku,
            images: product.images || []
          };
          
          // Ensure cart item has image data
          if (!item.image && product.images && product.images.length > 0) {
            const primaryImage = product.images.find(img => img.isPrimary) || product.images[0];
            item.image = primaryImage?.url || '';
            item.images = product.images.map(img => ({
              url: img.url,
              isPrimary: img.isPrimary || false,
              altText: img.altText || product.name
            }));
          }
        }
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
    console.log('Add to cart request body:', req.body);
    console.log('Authenticated user:', req.user ? { id: req.user._id, email: req.user.email } : 'NOT AUTHENTICATED');
    
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      console.log('Authentication failed - no user or user ID');
      return next(new AppError('User authentication required', 401));
    }
    
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

    // Process product images
    let primaryImage = '';
    let productImages = [];
    
    if (product.images && product.images.length > 0) {
      // Sort images to get primary image first
      const sortedImages = [...product.images].sort((a, b) => {
        if (a.isPrimary) return -1;
        if (b.isPrimary) return 1;
        return 0;
      });
      
      primaryImage = sortedImages[0]?.url || '';
      productImages = sortedImages.map(img => ({
        url: img.url,
        isPrimary: img.isPrimary || false,
        altText: img.altText || product.name
      }));
    } else {
      console.log('Product has no images, proceeding without image');
      primaryImage = '';
      productImages = [];
    }

    // Check if product already in cart
    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === product._id.toString()
    );

    if (itemIndex > -1) {
      // Update quantity if product already in cart
      cart.items[itemIndex].quantity += quantity;
    } else {
      // Add new item to cart with all images and primary image
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
