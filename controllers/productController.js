import Product from '../models/Product.js';
import { persistImages, removeImages } from '../utils/imageStorage.js';

// Create new product
// const createProduct = async (req, res) => {
//     try {
//         const {
//             name,
//             description,
//             price,
//             stock = 0,
//             category,
//             isFeatured = false,
//             discount = 0,
//             specifications = {}
//         } = req.body;


//          // Validate required fields
//         const missingFields = [];
//         if (!name) missingFields.push('name');
//         if (!description) missingFields.push('description');
//         if (price === undefined) missingFields.push('price');
//         if (!category) missingFields.push('category');

//         if (missingFields.length > 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: `Missing required fields: ${missingFields.join(', ')}`,
//                 fields: missingFields
//             });
//         }

//         // Validate price is a valid positive number
//         const priceValue = parseFloat(price);
//         if (isNaN(priceValue) || priceValue < 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Price must be a valid positive number',
//                 field: 'price'
//             });
//         }


//         // Handle file uploads
//         let images = [];
        
//         if (req.files && req.files.length > 0) {
//             try {
//                 // Process each uploaded file
//                 for (const [index, file] of req.files.entries()) {
//                     const filename = generateUniqueFilename(file.originalname);
//                     const filePath = path.join(uploadsDir, filename);
                    
//                     // Move the file to the uploads directory
//                     await fs.promises.rename(file.path, filePath);
                    
//                     // Add file info to images array with full URL
//                     const imageUrl = `/uploads/${filename}`;
//                     images.push({
//                         url: imageUrl,
//                         isPrimary: index === 0,
//                         altText: `Image ${index + 1} of ${name}`,
//                         // Store both relative and absolute URLs for flexibility
//                         absoluteUrl: req.protocol + '://' + req.get('host') + imageUrl
//                     });
//                 }
                
//                 if (images.length === 0) {
//                     throw new Error('No valid images were uploaded');
//                 }
//             } catch (error) {
//                 console.error('Error processing file uploads:', error);
//                 // Continue with empty images array if there's an error
//             }
//         } else if (req.body.images && Array.isArray(req.body.images)) {
//             // If images are provided as URLs (for testing or manual entry)
//             images = req.body.images.map((url, index) => ({
//                 url,
//                 publicId: null,
//                 isPrimary: index === 0,
//                 altText: `Image ${index + 1} of ${name}`
//             }));
//         }

//         // const productData = {
//         //     name,
//         //     description,
//         //     price: parseFloat(price),
//         //     stock: parseInt(stock, 10) || 0,
//         //     category,
//         //     images,
//         //     isFeatured: isFeatured === 'true' || isFeatured === true,
//         //     discount: parseFloat(discount) || 0,
//         //     specifications: typeof specifications === 'string' ? JSON.parse(specifications) : specifications,
//         //     createdBy: req.user.id,
//         //     isInStock: parseInt(stock, 10) > 0
//         // };


//          const productData = {
//             name: name.trim(),
//             description: description.trim(),
//             price: priceValue,
//             stock: Math.max(0, parseInt(stock, 10) || 0),
//             category: category.trim(),
//             images,
//             isFeatured: isFeatured === 'true' || isFeatured === true,
//             discount: Math.max(0, Math.min(parseFloat(discount) || 0, 100)), // Ensure discount is between 0-100
//             specifications: typeof specifications === 'string' ? 
//                 JSON.parse(specifications) : 
//                 (specifications || {}),
//             createdBy: req.user?.id,
//             isInStock: (parseInt(stock, 10) || 0) > 0
//         };

//         const product = new Product(productData);

//         await product.save();

//         res.status(201).json({
//             success: true,
//             message: 'Product created successfully',
//             data: product
//         });
//     } catch (error) {
//         console.error('Error creating product:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error creating product',
//             error: error.message
//         });
//     }
// };


// Multipart form fields arrive as strings; JSON bodies arrive typed.
const toBoolean = (value) => value === true || value === 'true';

// Accept images as URL strings, {url, ...} objects, or a JSON string of either.
const parseImageList = (raw) => {
    if (raw === undefined || raw === null || raw === '') return undefined;
    let list = raw;
    if (typeof raw === 'string') {
        try {
            list = JSON.parse(raw);
        } catch {
            list = [raw];
        }
    }
    if (!Array.isArray(list)) list = [list];
    return list
        .map((img) => (typeof img === 'string' ? { url: img } : img))
        // Blob URLs are browser-local previews and can never be served
        .filter((img) => img && typeof img.url === 'string' && img.url && !img.url.startsWith('blob:'))
        .map((img) => ({
            url: img.url,
            publicId: img.publicId || undefined,
            isPrimary: !!img.isPrimary,
            altText: img.altText || img.alt || undefined
        }));
};

const ensureSinglePrimary = (images) => {
    if (images.length === 0) return images;
    const primaryIndex = Math.max(0, images.findIndex((img) => img.isPrimary));
    return images.map((img, index) => ({ ...img, isPrimary: index === primaryIndex }));
};

const createProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            stock = 0,
            category,
            brand,
            isFeatured = false,
            discount = 0,
            specifications = {}
        } = req.body;

        // Validate required fields
        const missingFields = [];
        if (!name) missingFields.push('name');
        if (!description) missingFields.push('description');
        if (price === undefined) missingFields.push('price');
        if (!category) missingFields.push('category');

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`,
                fields: missingFields
            });
        }

        // Validate price is a valid positive number
        const priceValue = parseFloat(price);
        if (isNaN(priceValue) || priceValue < 0) {
            return res.status(400).json({
                success: false,
                message: 'Price must be a valid positive number',
                field: 'price'
            });
        }

        // Images: URLs supplied in the body plus any uploaded files
        let images = parseImageList(req.body.images) || [];
        let uploaded = [];
        if (req.files && req.files.length > 0) {
            uploaded = await persistImages(req.files);
            images = images.concat(uploaded.map((img) => ({ ...img, isPrimary: false })));
        }
        images = ensureSinglePrimary(images).map((img, index) => ({
            ...img,
            altText: img.altText || `Image ${index + 1} of ${name}`
        }));

        // Prepare product data
        const productData = {
            name: name.trim(),
            description: description.trim(),
            price: priceValue,
            stock: Math.max(0, parseInt(stock, 10) || 0),
            category: category.trim(),
            brand: typeof brand === 'string' && brand.trim() ? brand.trim() : undefined,
            images,
            isFeatured: toBoolean(isFeatured),
            discount: Math.max(0, Math.min(parseFloat(discount) || 0, 100)), // Ensure discount is between 0-100
            specifications: typeof specifications === 'string' ? 
                JSON.parse(specifications) : 
                (specifications || {}),
            createdBy: req.user?.id,
            isInStock: (parseInt(stock, 10) || 0) > 0
        };

        // Create and save the product
        const product = new Product(productData);
        try {
            await product.save();
        } catch (saveError) {
            // Don't leave orphaned uploads behind when the product isn't saved
            await removeImages(uploaded);
            throw saveError;
        }

        // Send success response
        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });

    } catch (error) {
        console.error('Error creating product:', error);
        
        // Handle specific error types
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }));
            
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors
            });
        }

        // Handle JSON parse error
        if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid JSON in specifications'
            });
        }

        // Generic error response
        res.status(500).json({
            success: false,
            message: 'Error creating product',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
        // Inactive products are only visible to admins
        const filter = { _id: req.params.id };
        if (req.user?.role !== 'admin') {
            filter.isActive = { $ne: false };
        }

        const product = await Product.findOne(filter)
            .select('name description price stock images isActive isFeatured isInStock category brand sku rating ratingCount averageRating numOfReviews reviewsCount createdAt updatedAt')
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
// Accepts JSON or multipart. Unknown fields (e.g. sku) are ignored rather than
// rejected so older clients keep working. With multipart, `images` (JSON) is the
// list of existing images to keep and uploaded files are appended to it.
const updateProduct = async (req, res) => {
    let uploaded = [];
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const body = req.body || {};

        ['name', 'description', 'category', 'brand'].forEach((field) => {
            if (typeof body[field] === 'string') product[field] = body[field].trim();
        });

        if (body.price !== undefined && body.price !== '') {
            const price = parseFloat(body.price);
            if (isNaN(price) || price < 0) {
                return res.status(400).json({ success: false, message: 'Price must be a valid positive number', field: 'price' });
            }
            product.price = price;
        }

        // `inventory.quantity` is accepted for older clients
        const rawStock = body.stock ?? body.inventory?.quantity;
        if (rawStock !== undefined && rawStock !== '') {
            const stock = parseInt(rawStock, 10);
            if (isNaN(stock) || stock < 0) {
                return res.status(400).json({ success: false, message: 'Stock must be a non-negative integer', field: 'stock' });
            }
            product.stock = stock;
        }

        if (body.isFeatured !== undefined) product.isFeatured = toBoolean(body.isFeatured);
        if (body.isActive !== undefined) product.isActive = toBoolean(body.isActive);

        if (body.specifications !== undefined) {
            product.specifications = typeof body.specifications === 'string'
                ? JSON.parse(body.specifications)
                : body.specifications;
        }

        const keptImages = parseImageList(body.images);
        if (req.files && req.files.length > 0) {
            uploaded = await persistImages(req.files);
        }

        let removedImages = [];
        if (keptImages !== undefined || uploaded.length > 0) {
            const nextImages = ensureSinglePrimary([
                ...(keptImages ?? product.images.map((img) => img.toObject())),
                ...uploaded.map((img) => ({ ...img, isPrimary: false }))
            ]).map((img, index) => ({
                ...img,
                altText: img.altText || `Image ${index + 1} of ${product.name}`
            }));

            const nextUrls = new Set(nextImages.map((img) => img.url));
            removedImages = product.images.filter((img) => !nextUrls.has(img.url));
            product.images = nextImages;
        }

        product.isInStock = product.stock > 0;
        product.updatedAt = new Date();

        await product.save();
        // Only delete files after the new state is safely persisted
        await removeImages(removedImages);

        res.json({
            success: true,
            message: 'Product updated successfully',
            product,
            data: product
        });
    } catch (error) {
        await removeImages(uploaded);
        console.error('Error updating product:', error);
        res.status(400).json({
            success: false,
            message: error.name === 'SyntaxError' ? 'Invalid JSON in request' : 'Error updating product',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

        await removeImages(product.images);
        // Note: existing orders keep the item price but their product reference
        // will no longer populate, so order views must tolerate a missing product.

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
