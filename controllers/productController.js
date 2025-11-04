import Product from '../models/Product.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



// Configure uploads directory based on environment
const isVercel = process.env.VERCEL === '1';
const uploadsDir = isVercel 
    ? '/tmp/uploads'  // Vercel's writable directory
    : path.join(process.cwd(), 'public', 'uploads');

// Ensure uploads directory exists
const ensureUploadsDir = () => {
    try {
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log(`Created uploads directory at: ${uploadsDir}`);
        }
        return uploadsDir;
    } catch (error) {
        console.error('Error creating uploads directory:', error);
        throw error;
    }
};

// Initialize uploads directory
ensureUploadsDir();

// Helper function to generate a unique filename
const generateUniqueFilename = (originalname) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    return uniqueSuffix + path.extname(originalname);
};

// Create new product
const createProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            stock = 0,
            category,
            isFeatured = false,
            discount = 0,
            specifications = {}
        } = req.body;

        // Handle file uploads
        let images = [];
        
        if (req.files && req.files.length > 0) {
            try {
                // Process each uploaded file
                for (const [index, file] of req.files.entries()) {
                    const filename = generateUniqueFilename(file.originalname);
                    const filePath = path.join(uploadsDir, filename);
                    
                    // Move the file to the uploads directory
                    await fs.promises.rename(file.path, filePath);
                    
                    // Add file info to images array with full URL
                    const imageUrl = `/uploads/${filename}`;
                    images.push({
                        url: imageUrl,
                        isPrimary: index === 0,
                        altText: `Image ${index + 1} of ${name}`,
                        // Store both relative and absolute URLs for flexibility
                        absoluteUrl: req.protocol + '://' + req.get('host') + imageUrl
                    });
                }
                
                if (images.length === 0) {
                    throw new Error('No valid images were uploaded');
                }
            } catch (error) {
                console.error('Error processing file uploads:', error);
                // Continue with empty images array if there's an error
            }
        } else if (req.body.images && Array.isArray(req.body.images)) {
            // If images are provided as URLs (for testing or manual entry)
            images = req.body.images.map((url, index) => ({
                url,
                publicId: null,
                isPrimary: index === 0,
                altText: `Image ${index + 1} of ${name}`
            }));
        }

        const productData = {
            name,
            description,
            price: parseFloat(price),
            stock: parseInt(stock, 10) || 0,
            category,
            images,
            isFeatured: isFeatured === 'true' || isFeatured === true,
            discount: parseFloat(discount) || 0,
            specifications: typeof specifications === 'string' ? JSON.parse(specifications) : specifications,
            createdBy: req.user.id,
            isInStock: parseInt(stock, 10) > 0
        };

        const product = new Product(productData);

        await product.save();

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating product',
            error: error.message
        });
    }
};

// Get all products with pagination and filters
const getProducts = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            category = '',
            minPrice,
            maxPrice,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const query = {};
        
        // Search by name or description
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Filter by category
        if (category) {
            query.category = category;
        }

        // Price range filter
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        let products = await Product.find(query)
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        // Process each product to ensure images are properly formatted
        products = products.map(product => {
            if (Array.isArray(product.images) && product.images.length > 0) {
                // Sort images to put primary image first
                product.images.sort((a, b) => {
                    if (a.isPrimary) return -1;
                    if (b.isPrimary) return 1;
                    return 0;
                });

                // If no primary image is set, use the first image as primary
                if (product.images.length > 0 && !product.images[0].isPrimary) {
                    product.images[0].isPrimary = true;
                }

                // Add primaryImage field for easy access
                product.primaryImage = product.images[0]?.url || null;
            } else {
                product.images = [];
                product.primaryImage = null;
            }
            return product;
        });

        const count = await Product.countDocuments(query);

        res.json({
            success: true,
            products,
            totalPages: Math.ceil(count / limit),
            currentPage: Number(page),
            totalProducts: count
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching products'
        });
    }
};

// Get single product with stock and images
const getProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .select('name description price stock images isActive isFeatured isInStock category brand')
            .lean();
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Ensure images is an array
        if (!Array.isArray(product.images)) {
            product.images = [];
        } else {
            // Sort images to put primary image first
            product.images.sort((a, b) => {
                if (a.isPrimary) return -1;
                if (b.isPrimary) return 1;
                return 0;
            });

            // If no primary image is set, use the first image as primary
            if (product.images.length > 0 && !product.images[0].isPrimary) {
                product.images[0].isPrimary = true;
            }
        }

        // Add a helper field for the primary image URL
        product.primaryImage = product.images.length > 0 ? product.images[0]?.url : null;

        res.json({
            success: true,
            product
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching product'
        });
    }
};

// Update product
const updateProduct = async (req, res) => {
    try {
        const updates = Object.keys(req.body);
        const allowedUpdates = ['name', 'description', 'price', 'stock', 'category', 'images', 'isFeatured', 'specifications'];
        const isValidOperation = updates.every(update => allowedUpdates.includes(update));

        if (!isValidOperation) {
            return res.status(400).json({
                success: false,
                message: 'Invalid updates!'
            });
        }

        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        updates.forEach(update => product[update] = req.body[update]);
        product.updatedAt = new Date();
        
        await product.save();

        res.json({
            success: true,
            product
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(400).json({
            success: false,
            message: 'Error updating product',
            error: error.message
        });
    }
};

// Delete product
const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // TODO: Handle related data cleanup (order items, etc.)

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting product'
        });
    }
};

// Get product categories
const getCategories = async (req, res) => {
    try {
        const categories = await Product.distinct('category');
        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching categories'
        });
    }
};

export {
    createProduct,
    getProducts,
    getProduct,
    updateProduct,
    deleteProduct,
    getCategories
};
