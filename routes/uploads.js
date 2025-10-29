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

export default router;
