import fs from 'fs';
import path from 'path';
import { uploadToCloudinary, deleteFromCloudinary } from './cloudinary.js';

// Serverless file systems (Vercel) are ephemeral, so anything written to disk
// there disappears between invocations. Cloudinary is used whenever it is
// configured; local disk is only a fallback for development.
export const isCloudinaryEnabled = () =>
    process.env.USE_CLOUDINARY === 'true' &&
    !!process.env.CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET;

const localUploadsDir = () =>
    process.env.VERCEL === '1' ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');

const removeTempFile = async (filePath) => {
    try {
        await fs.promises.unlink(filePath);
    } catch {
        // Already gone; nothing to clean up
    }
};

/**
 * Persist a single multer file and return its public location.
 * @param {Express.Multer.File} file
 * @param {String} folder - Cloudinary folder
 * @returns {Promise<{url: String, publicId: String|null}>}
 */
export const persistImage = async (file, folder = 'epilux/products') => {
    if (isCloudinaryEnabled()) {
        try {
            const result = await uploadToCloudinary(file.path, folder);
            return { url: result.url, publicId: result.public_id };
        } finally {
            await removeTempFile(file.path);
        }
    }

    const dir = localUploadsDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const filename = path.basename(file.path);
    const destination = path.join(dir, filename);
    if (path.resolve(file.path) !== path.resolve(destination)) {
        await fs.promises.rename(file.path, destination);
    }
    return { url: `/uploads/${filename}`, publicId: null };
};

/**
 * Persist several multer files. If any upload fails, the ones that already
 * succeeded are removed so no orphaned assets are left behind.
 */
export const persistImages = async (files = [], folder) => {
    const saved = [];
    try {
        for (const file of files) {
            saved.push(await persistImage(file, folder));
        }
        return saved;
    } catch (error) {
        await removeImages(saved);
        await Promise.all(files.map((file) => removeTempFile(file.path)));
        throw error;
    }
};

/**
 * Best-effort removal of previously stored images (Cloudinary or local).
 */
export const removeImages = async (images = []) => {
    await Promise.all(images.map(async (image) => {
        try {
            if (image?.publicId && isCloudinaryEnabled()) {
                await deleteFromCloudinary(image.publicId);
            } else if (image?.url?.startsWith('/uploads/')) {
                await removeTempFile(path.join(localUploadsDir(), path.basename(image.url)));
            }
        } catch (error) {
            console.error('Failed to remove image:', error.message);
        }
    }));
};
