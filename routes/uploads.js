import express from 'express';
import { upload, uploadProductImages } from '../middleware/upload.js';
import { uploadImage, uploadMultipleImages } from '../controllers/uploadController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Serve uploaded files
router.get('/:filename', (req, res) => {
    try {
        const isVercel = process.env.VERCEL === '1';
        const filePath = isVercel
            ? join('/tmp', 'uploads', req.params.filename)  // Vercel's tmp directory
            : join(process.cwd(), 'public', 'uploads', req.params.filename);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            console.error(`File not found: ${filePath}`);
            res.status(404).json({
                success: false,
                message: 'File not found',
                path: filePath
            });
        }
    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({
            success: false,
            message: 'Error serving file'
        });
    }
});

export default router;
