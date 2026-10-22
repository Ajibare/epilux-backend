import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// A promotional bundle managed by admins (e.g. the festival bundle):
// `bundleSize` units of `product` at `unitPrice` each. Orders placed from an
// offer are priced from this record on the server, never from the client.
const offerSchema = new Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: 80,
        match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes only']
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    badge: { type: String, trim: true, maxlength: 40 },
    image: {
        url: String,
        publicId: String
    },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    bundleSize: { type: Number, required: true, min: 1, max: 1000 },
    // Offer price per unit (₦); the bundle costs bundleSize × unitPrice
    unitPrice: { type: Number, required: true, min: 1 },
    features: {
        type: [{ type: String, trim: true, maxlength: 160 }],
        validate: [(list) => list.length <= 12, 'Up to 12 highlights']
    },
    terms: { type: String, trim: true, maxlength: 1000 },
    startsAt: Date,
    endsAt: Date,
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

offerSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

export default model('Offer', offerSchema);
