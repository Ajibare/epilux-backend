import express from 'express';
import { upload, uploadProductImages } from '../middleware/upload.js';
import { uploadImage, uploadMultipleImages } from '../controllers/uploadController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Single file upload
router.post(
    '/',
    authenticate,
    authorize('admin'),
    upload.single('image'),
    uploadImage
);

// Multiple files upload
router.post(
    '/multiple',
    authenticate,
    authorize('admin'),
    upload.array('images', 10), // Max 10 files
    uploadMultipleImages
);

// Serve uploaded files in production
if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    const fs = require('fs');
    const path = require('path');
    
    router.get('/:filename', (req, res) => {
        const filePath = path.join('/tmp/epilux-uploads', req.params.filename);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }
    });
}

export default router;
