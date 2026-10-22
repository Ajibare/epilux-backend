import express from 'express';
import mongoose from 'mongoose';
import Offer from '../models/Offer.js';
import Product from '../models/Product.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import { uploadProductImages } from '../middleware/upload.js';
import { persistImage, removeImages } from '../utils/imageStorage.js';
import { serializeOffer } from '../services/offerService.js';

const router = express.Router();
const PRODUCT_FIELDS = 'name price category images stock isActive';

// Normalise and validate admin input. Multipart forms send everything as
// strings (features as JSON), JSON bodies send native types.
const readOfferInput = async (body, { partial = false } = {}) => {
    const errors = [];
    const data = {};
    const str = (key, max) => {
        if (body[key] === undefined) return;
        const value = String(body[key] ?? '').trim();
        if (value.length > max) errors.push(`${key} is too long`);
        data[key] = value;
    };

    str('title', 120);
    str('subtitle', 160);
    str('description', 2000);
    str('badge', 40);
    str('terms', 1000);

    if (body.slug !== undefined) {
        const slug = String(body.slug).toLowerCase().trim();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) errors.push('The link name may only use lowercase letters, numbers and dashes');
        data.slug = slug;
    }
    if (body.product !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(String(body.product))) errors.push('Choose a product');
        else if (!(await Product.exists({ _id: body.product }))) errors.push('That product no longer exists');
        else data.product = body.product;
    }
    if (body.bundleSize !== undefined) {
        const n = Number(body.bundleSize);
        if (!Number.isInteger(n) || n < 1 || n > 1000) errors.push('Units per bundle must be a whole number from 1 to 1000');
        data.bundleSize = n;
    }
    if (body.unitPrice !== undefined) {
        const n = Number(body.unitPrice);
        if (!Number.isFinite(n) || n < 1) errors.push('Offer price per unit must be at least ₦1');
        data.unitPrice = Math.round(n * 100) / 100;
    }
    if (body.features !== undefined) {
        let list = body.features;
        if (typeof list === 'string') {
            try { list = JSON.parse(list); } catch { list = list.split('\n'); }
        }
        list = (Array.isArray(list) ? list : []).map((f) => String(f).trim()).filter(Boolean);
        if (list.length > 12) errors.push('Up to 12 highlights');
        if (list.some((f) => f.length > 160)) errors.push('Each highlight can be up to 160 characters');
        data.features = list;
    }
    for (const key of ['startsAt', 'endsAt']) {
        if (body[key] === undefined) continue;
        if (body[key] === '' || body[key] === null) { data[key] = null; continue; }
        const d = new Date(body[key]);
        if (Number.isNaN(d.getTime())) errors.push(`${key === 'startsAt' ? 'Start' : 'End'} date is not valid`);
        else data[key] = d;
    }
    if (data.startsAt && data.endsAt && data.startsAt > data.endsAt) errors.push('The offer must end after it starts');
    if (body.isActive !== undefined) data.isActive = body.isActive === true || body.isActive === 'true';

    if (!partial) {
        for (const [key, label] of [['slug', 'link name'], ['title', 'title'], ['product', 'product'], ['bundleSize', 'units per bundle'], ['unitPrice', 'offer price']]) {
            if (data[key] === undefined || data[key] === '') errors.push(`The ${label} is required`);
        }
    }
    return { data, errors };
};

const handleError = (res, error, fallback) => {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'Another offer already uses this link name' });
    if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: Object.values(error.errors)[0]?.message || 'Invalid offer' });
    console.error(fallback, error);
    return res.status(500).json({ success: false, message: fallback });
};

// @route GET /api/offers  (public) live offers
router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const offers = await Offer.find({
            isActive: true,
            $and: [
                { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
                { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] }
            ]
        }).populate('product', PRODUCT_FIELDS).sort({ updatedAt: -1 }).limit(20);
        res.json({ success: true, data: offers.map((o) => serializeOffer(o)) });
    } catch (error) {
        handleError(res, error, 'Error fetching offers');
    }
});

// @route GET /api/offers/admin/all  (admin) every offer
router.get('/admin/all', authenticate, authorize('admin'), async (req, res) => {
    try {
        const offers = await Offer.find().populate('product', PRODUCT_FIELDS).sort({ updatedAt: -1 });
        res.json({ success: true, data: offers.map((o) => serializeOffer(o, { admin: true })) });
    } catch (error) {
        handleError(res, error, 'Error fetching offers');
    }
});

// @route GET /api/offers/:slug  (public; switched-off offers only for admins)
router.get('/:slug', optionalAuth, async (req, res) => {
    try {
        const offer = await Offer.findOne({ slug: String(req.params.slug).toLowerCase() }).populate('product', PRODUCT_FIELDS);
        const isAdmin = req.user?.role === 'admin';
        if (!offer || (!offer.isActive && !isAdmin)) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        res.json({ success: true, data: serializeOffer(offer, { admin: isAdmin }) });
    } catch (error) {
        handleError(res, error, 'Error fetching offer');
    }
});

// @route POST /api/offers  (admin) multipart: fields + optional `images` file
router.post('/', authenticate, authorize('admin'), uploadProductImages, async (req, res) => {
    let uploaded = null;
    try {
        const { data, errors } = await readOfferInput(req.body || {});
        if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });
        if (req.files?.[0]) {
            uploaded = await persistImage(req.files[0], 'epilux/offers');
            data.image = uploaded;
        }
        const offer = await Offer.create({ ...data, createdBy: req.user.id, updatedBy: req.user.id });
        await offer.populate('product', PRODUCT_FIELDS);
        res.status(201).json({ success: true, message: 'Offer created', data: serializeOffer(offer, { admin: true }) });
    } catch (error) {
        if (uploaded) await removeImages([uploaded]);
        handleError(res, error, 'Error creating offer');
    }
});

// @route PUT /api/offers/:id  (admin) partial update; `removeImage=true` clears the image
router.put('/:id', authenticate, authorize('admin'), uploadProductImages, async (req, res) => {
    let uploaded = null;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid offer' });
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

        const { data, errors } = await readOfferInput(req.body || {}, { partial: true });
        const startsAt = data.startsAt !== undefined ? data.startsAt : offer.startsAt;
        const endsAt = data.endsAt !== undefined ? data.endsAt : offer.endsAt;
        if (startsAt && endsAt && startsAt > endsAt) errors.push('The offer must end after it starts');
        if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

        const previousImage = offer.image?.url ? { url: offer.image.url, publicId: offer.image.publicId } : null;
        if (req.files?.[0]) {
            uploaded = await persistImage(req.files[0], 'epilux/offers');
            data.image = uploaded;
        } else if (req.body?.removeImage === 'true' || req.body?.removeImage === true) {
            data.image = { url: undefined, publicId: undefined };
        }

        offer.set({ ...data, updatedBy: req.user.id });
        await offer.save();
        if (data.image && previousImage) await removeImages([previousImage]);
        await offer.populate('product', PRODUCT_FIELDS);
        res.json({ success: true, message: 'Offer saved', data: serializeOffer(offer, { admin: true }) });
    } catch (error) {
        if (uploaded) await removeImages([uploaded]);
        handleError(res, error, 'Error saving offer');
    }
});

// @route DELETE /api/offers/:id  (admin). Past orders keep their own copy of the offer details.
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid offer' });
        const offer = await Offer.findByIdAndDelete(req.params.id);
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (offer.image?.url) await removeImages([offer.image]);
        res.json({ success: true, message: 'Offer deleted' });
    } catch (error) {
        handleError(res, error, 'Error deleting offer');
    }
});

export default router;
