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
import { uploadProductImages, deleteFile } from '../middleware/upload.js';

const router = express.Router();

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
            pages: Math.ceil(total / limit)
        }
    });
}));

// Create a new product (admin only)
router.post(
    '/',
    authenticate,
    authorize('admin'),
    uploadProductImages,
    validateProductCreation,
    handleValidationErrors,
    catchAsync(async (req, res) => {
        try {
            // Handle file uploads if files were uploaded
            let images = [];
            
            if (req.fileUrls && req.fileUrls.length > 0) {
                images = req.fileUrls.map(file => ({
                    url: file.url,
                    path: file.path
                }));
            } else if (req.body.images && Array.isArray(req.body.images)) {
                // If images are provided as URLs (for testing or manual entry)
                images = req.body.images.map(url => ({
                    url,
                    path: null
                }));
            }

            // Parse specifications if it's a string
            let specifications = {};
            if (req.body.specifications) {
                try {
                    specifications = typeof req.body.specifications === 'string' 
                        ? JSON.parse(req.body.specifications)
                        : req.body.specifications;
                } catch (e) {
                    console.error('Error parsing specifications:', e);
                }
            }

            const product = new Product({
                name: req.body.name,
                description: req.body.description,
                price: parseFloat(req.body.price),
                stock: parseInt(req.body.stock) || 0,
                category: req.body.category,
                brand: req.body.brand,
                images: images,
                isFeatured: req.body.isFeatured === 'true' || req.body.isFeatured === true,
                createdBy: req.user.id
            });

            await product.save();
            
            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                data: product
            });
        } catch (error) {
            // Clean up any uploaded files if there was an error
            if (req.fileUrls && req.fileUrls.length > 0) {
                req.fileUrls.forEach(file => {
                    if (file.path) {
                        deleteFile(file.path);
                    }
                });
            }
            throw error;
        }
    })
);

// Update product (admin only)
router.put(
    '/:id',
    validateMongoId,
    authenticate,
    authorize('admin'),
    uploadProductImages,
    validateProductUpdate,
    handleValidationErrors,
    catchAsync(async (req, res, next) => {
        try {
            const productId = req.params.id;
            const updateData = { ...req.body };
            
            // Get existing product to handle old image deletion if new images are uploaded
            const existingProduct = await Product.findById(productId);
            if (!existingProduct) {
                // Clean up uploaded files if product not found
                if (req.fileUrls && req.fileUrls.length > 0) {
                    req.fileUrls.forEach(file => deleteFile(file.path));
                }
                return next(new NotFoundError('Product not found'));
            }
            
            // Handle file uploads if new images are provided
            if (req.fileUrls && req.fileUrls.length > 0) {
                // Delete old image files
                if (existingProduct.images && existingProduct.images.length > 0) {
                    existingProduct.images.forEach(img => {
                        if (img.path) {
                            deleteFile(img.path);
                        }
                    });
                }
                
                // Set new images
                updateData.images = req.fileUrls.map(file => ({
                    url: file.url,
                    path: file.path
                }));
            } else if (req.body.images && Array.isArray(req.body.images)) {
                // If images are provided as URLs (for testing or manual entry)
                updateData.images = req.body.images.map(url => ({
                    url,
                    path: null
                }));
                
                // Delete old image files if they exist
                if (existingProduct.images && existingProduct.images.length > 0) {
                    existingProduct.images.forEach(img => {
                        if (img.path) {
                            deleteFile(img.path);
                        }
                    });
                }
            }
            
            // Parse specifications if it's a string
            if (updateData.specifications && typeof updateData.specifications === 'string') {
                try {
                    updateData.specifications = JSON.parse(updateData.specifications);
                } catch (e) {
                    console.error('Error parsing specifications:', e);
                }
            }
            
            // Parse numeric fields
            if (updateData.price) updateData.price = parseFloat(updateData.price);
            if (updateData.stock) updateData.stock = parseInt(updateData.stock);
            // if (updateData.discount) updateData.discount = parseFloat(updateData.discount);
            if (updateData.isFeatured) {
                updateData.isFeatured = updateData.isFeatured === 'true' || updateData.isFeatured === true;
            }
            
            const product = await Product.findByIdAndUpdate(
                productId,
                { $set: updateData },
                { new: true, runValidators: true }
            );
            
            res.json({
                success: true,
                message: 'Product updated successfully',
                data: product
            });
        } catch (error) {
            // Clean up any uploaded files if there was an error
            if (req.fileUrls && req.fileUrls.length > 0) {
                req.fileUrls.forEach(file => {
                    if (file.path) {
                        deleteFile(file.path);
                    }
                });
            }
            throw error;
        }
    })
);

// Delete product (admin only)
router.delete('/:id', validateMongoId, authenticate, authorize('admin'), catchAsync(async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
        return next(new NotFoundError('Product not found'));
    }
    
    // Delete associated image files
    if (product.images && product.images.length > 0) {
        product.images.forEach(img => {
            if (img.path) {
                deleteFile(img.path);
            }
        });
    }
    
    // Delete the product
    await Product.deleteOne({ _id: req.params.id });
    
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
