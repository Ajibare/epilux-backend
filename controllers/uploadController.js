import path from 'path';
import { getFileUrl, deleteFile } from '../middleware/upload.js';

/**
 * Handles file uploads
 * @route POST /api/uploads
 * @access Private/Admin
 */
export const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Get the uploaded file details
        const file = req.file;
        const fileUrl = getFileUrl(file.filename);
        const fullUrl = `${req.protocol}://${req.get('host')}${fileUrl}`;

        res.status(201).json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                url: fullUrl,
                path: file.path,
                filename: file.filename,
                size: file.size,
                mimetype: file.mimetype
            }
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        
        // Clean up the uploaded file if there was an error
        if (req.file) {
            deleteFile(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: 'Error uploading file',
            error: error.message
        });
    }
};

/**
 * Handles multiple file uploads
 * @route POST /api/uploads/multiple
 * @access Private/Admin
 */
export const uploadMultipleImages = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        // Process each uploaded file
        const uploadedFiles = req.files.map(file => ({
            url: `${req.protocol}://${req.get('host')}${getFileUrl(file.filename)}`,
            path: file.path,
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
        }));

        res.status(201).json({
            success: true,
            message: 'Files uploaded successfully',
            data: uploadedFiles
        });
    } catch (error) {
        console.error('Error uploading files:', error);
        
        // Clean up any uploaded files if there was an error
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                deleteFile(file.path);
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error uploading files',
            error: error.message
        });
    }
};
