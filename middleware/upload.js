import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Define uploads directory
const uploadDir = path.join(process.cwd(), 'public', 'uploads');

// Ensure uploads directory exists
const ensureUploadsDir = () => {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
};

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, ensureUploadsDir());
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'product-' + uniqueSuffix + ext);
    }
});

// File filter to only allow image files
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only image files are allowed (JPEG, PNG, WebP, GIF)'), false);
    }
};

// Configure multer with the storage and file filter
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
        files: 5 // Maximum of 5 files per upload
    }
});

// Helper function to get the public URL for a file
const getFileUrl = (filename) => {
    if (!filename) return null;
    // Return the full URL path that will be accessible from the frontend
    return `/uploads/${path.basename(filename)}`;
};

// Middleware for handling multiple image uploads
const uploadProductImages = (req, res, next) => {
    const uploadFiles = upload.array('images', 5);
    
    uploadFiles(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'File size too large. Maximum size is 10MB per file.'
                });
            } else if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({
                    success: false,
                    message: 'Too many files. Maximum of 5 images allowed.'
                });
            } else if (err.message.includes('Invalid file type')) {
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
            return res.status(500).json({
                success: false,
                message: 'Error uploading files',
                error: err.message
            });
        }
        
        // Add file URLs to the request object
        if (req.files && req.files.length > 0) {
            req.fileUrls = req.files.map(file => ({
                url: getFileUrl(file.filename),
                path: file.path
            }));
        }
        
        next();
    });
};

// Function to delete a file
const deleteFile = (filePath) => {
    if (!filePath) return false;
    
    // Handle both relative and absolute paths
    const fullPath = filePath.startsWith(process.cwd()) 
        ? filePath 
        : path.join(process.cwd(), filePath);
    
    try {
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Successfully deleted file: ${fullPath}`);
            return true;
        } else {
            console.warn(`File not found, cannot delete: ${fullPath}`);
            return false;
        }
    } catch (error) {
        console.error(`Error deleting file ${fullPath}:`, error);
        return false;
    }
};

export { upload, uploadProductImages, getFileUrl, deleteFile };
