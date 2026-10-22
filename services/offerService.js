import Offer from '../models/Offer.js';
import Product from '../models/Product.js';
import { AppError } from '../middleware/errorHandler.js';

export const MAX_BUNDLES_PER_ORDER = 50;

const roundMoney = (n) => Math.round(n * 100) / 100;

/** 'off' | 'scheduled' | 'live' | 'ended' */
export const offerStatus = (offer, now = new Date()) => {
    if (!offer.isActive) return 'off';
    if (offer.startsAt && offer.startsAt > now) return 'scheduled';
    if (offer.endsAt && offer.endsAt < now) return 'ended';
    return 'live';
};

/** Public shape of an offer, with prices worked out from the product's current price. */
export const serializeOffer = (offer, { admin = false } = {}) => {
    const product = offer.product && typeof offer.product === 'object' && offer.product._id ? offer.product : null;
    const regularUnitPrice = product?.price ?? null;
    const bundlePrice = roundMoney(offer.unitPrice * offer.bundleSize);
    const regularBundlePrice = regularUnitPrice !== null ? roundMoney(regularUnitPrice * offer.bundleSize) : null;
    const savings = regularBundlePrice !== null ? Math.max(0, roundMoney(regularBundlePrice - bundlePrice)) : 0;
    const status = offerStatus(offer);

    return {
        _id: offer._id,
        slug: offer.slug,
        title: offer.title,
        subtitle: offer.subtitle,
        description: offer.description,
        badge: offer.badge,
        image: offer.image?.url ? { url: offer.image.url } : null,
        bundleSize: offer.bundleSize,
        unitPrice: offer.unitPrice,
        bundlePrice,
        regularUnitPrice,
        regularBundlePrice,
        savings,
        savingsPercent: regularBundlePrice ? Math.round((savings / regularBundlePrice) * 100) : 0,
        features: offer.features || [],
        terms: offer.terms,
        startsAt: offer.startsAt,
        endsAt: offer.endsAt,
        status,
        isLive: status === 'live',
        product: product ? {
            _id: product._id,
            name: product.name,
            category: product.category,
            images: product.images,
            stock: admin ? product.stock : undefined,
            inStock: (product.stock ?? 0) >= offer.bundleSize && product.isActive !== false
        } : null,
        ...(admin && { isActive: offer.isActive, createdAt: offer.createdAt, updatedAt: offer.updatedAt })
    };
};

/**
 * The offer a customer is ordering from, checked to be live and in stock.
 * Returns the product line to price the order with.
 */
export const resolveOfferLine = async (slug, bundles, session = null) => {
    const count = Number(bundles ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > MAX_BUNDLES_PER_ORDER) {
        throw new AppError(`Choose between 1 and ${MAX_BUNDLES_PER_ORDER} bundles`, 400);
    }
    const query = Offer.findOne({ slug: String(slug || '').toLowerCase().trim() });
    if (session) query.session(session);
    const offer = await query;
    if (!offer) throw new AppError('This offer was not found', 404);

    const status = offerStatus(offer);
    if (status !== 'live') {
        throw new AppError(status === 'scheduled' ? 'This offer has not started yet' : 'This offer is no longer available', 400);
    }

    const productQuery = Product.findById(offer.product).select('_id name price isActive');
    if (session) productQuery.session(session);
    const product = await productQuery;
    if (!product || product.isActive === false) {
        throw new AppError('This offer is no longer available', 400);
    }

    return {
        offer,
        productId: String(product._id),
        quantity: offer.bundleSize * count,
        unitPrice: offer.unitPrice,
        bundles: count
    };
};
