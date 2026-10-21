import express from 'express';
import Product from '../models/Product.js';
import { catchAsync } from '../middleware/errorHandler.js';
import reviewRouter from './reviews.js';
import {
    validateMongoId,
    validatePagination,
    handleValidationErrors
} from '../middleware/validation.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadProductImages } from '../middleware/upload.js';
import { createProduct, getProduct, updateProduct, deleteProduct } from '../controllers/productController.js';

const router = express.Router();

// Escape user input before using it inside a regular expression
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Serve uploaded files statically
router.use('/uploads', express.static('public/uploads'));

// Get all products (public)
router.get('/', validatePagination, handleValidationErrors, catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const filter = { isActive: true };

    // Search functionality
    if (req.query.search) {
        const search = escapeRegex(req.query.search);
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } }
        ];
    }

    // Category filter
    if (req.query.category) {
        filter.category = String(req.query.category);
    }

    // Brand filter
    if (req.query.brand) {
        filter.brand = String(req.query.brand);
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

// Admin product management (same implementation as /api/admin/products)
router.post('/', authenticate, authorize('admin'), uploadProductImages, createProduct);
router.put('/:id', validateMongoId, handleValidationErrors, authenticate, authorize('admin'), uploadProductImages, updateProduct);
router.delete('/:id', validateMongoId, handleValidationErrors, authenticate, authorize('admin'), deleteProduct);

// Mount review routes
router.use('/:productId/reviews', reviewRouter);

// Get product categories (public)
router.get('/categories', catchAsync(async (req, res) => {
    const categories = await Product.distinct('category', { isActive: true });

    res.json({
        success: true,
        categories
    });
}));

// Get product brands (public)
router.get('/brands', catchAsync(async (req, res) => {
    const brands = await Product.distinct('brand', { isActive: true });

    res.json({
        success: true,
        brands
    });
}));

// Get a single product (public). Declared last so /categories and /brands match first.
router.get('/:id', validateMongoId, handleValidationErrors, getProduct);

export default router;
