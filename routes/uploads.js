import express from 'express';
import { upload, uploadProductImages } from '../middleware/upload.js';
import { uploadImage, uploadMultipleImages } from '../controllers/uploadController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';
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
        const uploadsDir = isVercel 
            ? '/tmp/uploads'  // Vercel's tmp directory
            : path.join(process.cwd(), 'public', 'uploads');
            
        const filename = req.params.filename;
        const filePath = path.join(uploadsDir, filename);
        
        // Security check: Prevent directory traversal
        if (filePath.indexOf(uploadsDir) !== 0) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        if (fs.existsSync(filePath)) {
            // Set appropriate content type based on file extension
            const ext = path.extname(filename).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.gif': 'image/gif'
            };
            
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            
            // Set cache headers
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            // Stream the file
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            
            // Handle errors
            fileStream.on('error', (error) => {
                console.error('Error streaming file:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: 'Error serving file'
                    });
                }
            });
        } else {
            console.error(`File not found: ${filePath}`);
            res.status(404).json({
                success: false,
                message: 'File not found',
                filename: filename
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
