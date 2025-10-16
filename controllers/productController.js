// import Product from '../models/Product.js';
// import { v2 as cloudinary } from 'cloudinary';
// import path from 'path';
// import fs from 'fs';



// // Configure Cloudinary if credentials are provided
// if (process.env.CLOUDINARY_CLOUD_NAME && 
//     process.env.CLOUDINARY_API_KEY && 
//     process.env.CLOUDINARY_API_SECRET) {
//     cloudinary.config({
//         cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//         api_key: process.env.CLOUDINARY_API_KEY,
//         api_secret: process.env.CLOUDINARY_API_SECRET
//     });
// }

// const useCloudinary = process.env.USE_CLOUDINARY === 'true';

// // Helper function to upload files to Cloudinary
// const uploadToCloudinary = async (file) => {
//     if (!useCloudinary) return null;
    
//     try {
//         const result = await cloudinary.uploader.upload(file.path, {
//             folder: 'products'
//         });
//         return {
//             url: result.secure_url,
//             publicId: result.public_id
//         };
//     } catch (error) {
//         console.error('Error uploading to Cloudinary:', error);
//         return null;
//     }
// };

// // Helper function to delete from Cloudinary
// const deleteFromCloudinary = async (publicId) => {
//     if (!useCloudinary || !publicId) return;
    
//     try {
//         await cloudinary.uploader.destroy(publicId);
//     } catch (error) {
//         console.error('Error deleting from Cloudinary:', error);
//     }
// };

// // Create new product
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

//         // Handle file uploads
//         let images = [];
        
//         if (req.files && req.files.length > 0) {
//             // Upload each file to Cloudinary
//             const uploadPromises = req.files.map((file, index) => {
//                 return new Promise((resolve, reject) => {
//                     cloudinary.uploader.upload(file.path, 
//                         { 
//                             folder: 'products',
//                             resource_type: 'auto' 
//                         }, 
//                         (error, result) => {
//                             // Delete file from server after upload
//                             fs.unlinkSync(file.path);
                            
//                             if (error) {
//                                 console.error('Error uploading to Cloudinary:', error);
//                                 reject(error);
//                             } else {
//                                 resolve({
//                                     url: result.secure_url,
//                                     publicId: result.public_id,
//                                     isPrimary: index === 0, // First image is primary by default
//                                     altText: `Image ${index + 1} of ${name}`
//                                 });
//                             }
//                         }
//                     );
//                 });
//             });

//             // Wait for all uploads to complete
//             images = await Promise.all(uploadPromises);
//         } else if (req.body.images && Array.isArray(req.body.images)) {
//             // If images are provided as URLs (for testing or manual entry)
//             images = req.body.images.map((url, index) => ({
//                 url,
//                 publicId: null,
//                 isPrimary: index === 0,
//                 altText: `Image ${index + 1} of ${name}`
//             }));
//         }

//         const productData = {
//             name,
//             description,
//             price: parseFloat(price),
//             stock: parseInt(stock, 10) || 0,
//             category,
//             images,
//             isFeatured: isFeatured === 'true' || isFeatured === true,
//             discount: parseFloat(discount) || 0,
//             specifications: typeof specifications === 'string' ? JSON.parse(specifications) : specifications,
//             createdBy: req.user.id,
//             isInStock: parseInt(stock, 10) > 0
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

// // Get all products with pagination and filters
// const getProducts = async (req, res) => {
//     try {
//         const { 
//             page = 1, 
//             limit = 10, 
//             search = '', 
//             category = '',
//             minPrice,
//             maxPrice,
//             sortBy = 'createdAt',
//             sortOrder = 'desc'
//         } = req.query;

//         const query = {};
        
//         // Search by name or description
//         if (search) {
//             query.$or = [
//                 { name: { $regex: search, $options: 'i' } },
//                 { description: { $regex: search, $options: 'i' } }
//             ];
//         }
        
//         // Filter by category
//         if (category) {
//             query.category = category;
//         }

//         // Price range filter
//         if (minPrice || maxPrice) {
//             query.price = {};
//             if (minPrice) query.price.$gte = Number(minPrice);
//             if (maxPrice) query.price.$lte = Number(maxPrice);
//         }

//         const sortOptions = {};
//         sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

//         const products = await Product.find(query)
//             .sort(sortOptions)
//             .limit(limit * 1)
//             .skip((page - 1) * limit)
//             .lean();

//         const count = await Product.countDocuments(query);

//         res.json({
//             success: true,
//             products,
//             totalPages: Math.ceil(count / limit),
//             currentPage: Number(page),
//             totalProducts: count
//         });
//     } catch (error) {
//         console.error('Error fetching products:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching products'
//         });
//     }
// };

// // Get single product with stock and images
// const getProduct = async (req, res) => {
//     try {
//         const product = await Product.findById(req.params.id)
//             .select('name description price stock images isActive isFeatured isInStock category brand')
//             .lean();
        
//         if (!product) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Product not found'
//             });
//         }

//         // Format the response
//         const response = {
//             success: true,
//             data: {
//                 ...product,
//                 stock: product.stock || 0,
//                 isInStock: product.stock > 0,
//                 images: product.images || [],
//                 primaryImage: product.images?.find(img => img.isPrimary)?.url || 
//                              (product.images?.length > 0 ? product.images[0].url : null)
//             }
//         };

//         res.json(response);
//     } catch (error) {
//         console.error('Error fetching product:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching product',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };

// // Update product
// const updateProduct = async (req, res) => {
//     try {
//         const updates = Object.keys(req.body);
//         const allowedUpdates = ['name', 'description', 'price', 'stock', 'category', 'images', 'isFeatured', 'specifications'];
//         const isValidOperation = updates.every(update => allowedUpdates.includes(update));

//         if (!isValidOperation) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Invalid updates!'
//             });
//         }

//         const product = await Product.findById(req.params.id);
        
//         if (!product) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Product not found'
//             });
//         }

//         updates.forEach(update => product[update] = req.body[update]);
//         product.updatedAt = new Date();
        
//         await product.save();

//         res.json({
//             success: true,
//             product
//         });
//     } catch (error) {
//         console.error('Error updating product:', error);
//         res.status(400).json({
//             success: false,
//             message: 'Error updating product',
//             error: error.message
//         });
//     }
// };

// // Delete product
// const deleteProduct = async (req, res) => {
//     try {
//         const product = await Product.findByIdAndDelete(req.params.id);
        
//         if (!product) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Product not found'
//             });
//         }

//         // TODO: Handle related data cleanup (order items, etc.)

//         res.json({
//             success: true,
//             message: 'Product deleted successfully'
//         });
//     } catch (error) {
//         console.error('Error deleting product:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error deleting product'
//         });
//     }
// };

// // Get product categories
// const getCategories = async (req, res) => {
//     try {
//         const categories = await Product.distinct('category');
//         res.json({
//             success: true,
//             categories
//         });
//     } catch (error) {
//         console.error('Error fetching categories:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching categories'
//         });
//     }
// };

// export {
//     createProduct,
//     getProducts,
//     getProduct,
//     updateProduct,
//     deleteProduct,
//     getCategories
// };



import Product from '../models/Product.js';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// ✅ Configure Cloudinary
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const useCloudinary = process.env.USE_CLOUDINARY === 'true';

// ✅ Helper: Upload file to Cloudinary
const uploadToCloudinary = async (filePath, folder = 'products') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'auto',
    });
    fs.unlinkSync(filePath);
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return null;
  }
};

// ✅ Create Product
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      stock = 0,
      category,
      isFeatured = false,
      discount = 0,
      specifications = {},
      imageUrl, // 👈 single image URL supported
    } = req.body;

    let images = [];

    // Case 1: Multiple files uploaded
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(async (file, index) => {
        const uploaded = await uploadToCloudinary(file.path);
        return {
          url: uploaded?.url,
          publicId: uploaded?.publicId || null,
          isPrimary: index === 0,
          altText: `${name} - image ${index + 1}`,
        };
      });
      images = await Promise.all(uploadPromises);
    }

    // Case 2: Single image URL provided
    else if (imageUrl && typeof imageUrl === 'string') {
      images = [
        {
          url: imageUrl,
          publicId: null,
          isPrimary: true,
          altText: `${name} - main image`,
        },
      ];
    }

    // Case 3: Array of URLs
    else if (req.body.images && Array.isArray(req.body.images)) {
      images = req.body.images.map((url, index) => ({
        url,
        publicId: null,
        isPrimary: index === 0,
        altText: `${name} - image ${index + 1}`,
      }));
    }

    if (images.length === 0) {
      return res.status(400).json({ success: false, message: 'No image provided' });
    }

    const product = await Product.create({
      name,
      description,
      price: parseFloat(price),
      stock: parseInt(stock, 10),
      category,
      images,
      isFeatured: isFeatured === 'true' || isFeatured === true,
      discount: parseFloat(discount) || 0,
      specifications: typeof specifications === 'string' ? JSON.parse(specifications) : specifications,
      createdBy: req.user.id,
      isInStock: parseInt(stock, 10) > 0,
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message,
    });
  }
};

// ✅ Update Product (also fixes image update)
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      stock,
      category,
      isFeatured,
      discount,
      imageUrl,
    } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Handle image updates
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(async (file, index) => {
        const uploaded = await uploadToCloudinary(file.path);
        return {
          url: uploaded?.url,
          publicId: uploaded?.publicId || null,
          isPrimary: index === 0,
          altText: `${name} - image ${index + 1}`,
        };
      });
      product.images = await Promise.all(uploadPromises);
    } else if (imageUrl) {
      // If single image URL is sent
      product.images = [
        {
          url: imageUrl,
          publicId: null,
          isPrimary: true,
          altText: `${name} - updated image`,
        },
      ];
    }

    // Update other fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (price) product.price = parseFloat(price);
    if (stock !== undefined) product.stock = parseInt(stock, 10);
    if (category) product.category = category;
    if (isFeatured !== undefined) product.isFeatured = isFeatured;
    if (discount !== undefined) product.discount = parseFloat(discount);
    product.isInStock = product.stock > 0;
    product.updatedAt = new Date();

    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating product',
      error: error.message,
    });
  }
};
