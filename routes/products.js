import express from 'express';
import Product from '../models/Product.js';
import { catchAsync, NotFoundError } from '../middleware/errorHandler.js';
import {
    validateProductCreation,
    validateProductUpdate,
    validateMongoId,
    validatePagination,
    handleValidationErrors
} from '../middleware/validation.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all products (public)
router.get('/', validatePagination, handleValidationErrors, catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    
    const filter = { isActive: true };
    
    // Search functionality
    if (req.query.search) {
        filter.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { description: { $regex: req.query.search, $options: 'i' } },
            { category: { $regex: req.query.search, $options: 'i' } }
        ];
    }
    
    // Category filter
    if (req.query.category) {
        filter.category = req.query.category;
    }
    
    // Brand filter
    if (req.query.brand) {
        filter.brand = req.query.brand;
    }
    
    // Price range filter
    if (req.query.minPrice || req.query.maxPrice) {
        filter.price = {};
        if (req.query.minPrice) {
            filter.price.$gte = parseFloat(req.query.minPrice);
        }
        if (req.query.maxPrice) {
            filter.price.$lte = parseFloat(req.query.maxPrice);
        }
    }
    
    const products = await Product.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
    
    const total = await Product.countDocuments(filter);
    
    res.json({
        success: true,
        products,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

// Get single product by ID (public)
router.get('/:id', validateMongoId, handleValidationErrors, catchAsync(async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
        return next(new NotFoundError('Product not found'));
    }
    
    res.json({
        success: true,
        product
    });
}));

// Create new product (admin only)
router.post('/', authenticate, authorize('admin'), validateProductCreation, handleValidationErrors, catchAsync(async (req, res) => {
    // const product = new Product(req.body);
    const { name, description, price, sku, category, brand, inventory } = req.body;
const product = new Product({
  name,
  description,
  price,
  sku,
  category,
  brand,
  inventory,
});

    await product.save();
    
    res.status(201).json({
        success: true,
        message: 'Product created successfully',
        product
    });
}));

// Update product (admin only)
router.put('/:id', validateMongoId, authenticate, authorize('admin'), validateProductUpdate, handleValidationErrors, catchAsync(async (req, res, next) => {
    const product = await Product.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
    );
    
    if (!product) {
        return next(new NotFoundError('Product not found'));
    }
    
    res.json({
        success: true,
        message: 'Product updated successfully',
        product
    });
}));

// Delete product (admin only)
router.delete('/:id', validateMongoId, authenticate, authorize('admin'), catchAsync(async (req, res, next) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
        return next(new NotFoundError('Product not found'));
    }
    
    res.json({
        success: true,
        message: 'Product deleted successfully'
    });
}));

// Get product categories (public)
router.get('/categories/list', catchAsync(async (req, res) => {
    const categories = await Product.distinct('category', { isActive: true });
    
    res.json({
        success: true,
        categories
    });
}));

// Get product brands (public)
router.get('/brands/list', catchAsync(async (req, res) => {
    const brands = await Product.distinct('brand', { isActive: true });
    
    res.json({
        success: true,
        brands
    });
}));

export default router;
