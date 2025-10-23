import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const productSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    sku: {
        type: String,
        unique: true,
        sparse: true,
        required: false
    },
    category: {
        type: String,
        required: true
    },
    brand: {
        type: String,
        required: false
    },
    images: [{
        url: {
            type: String,
            required: true
        },
        publicId: String,
        isPrimary: {
            type: Boolean,
            default: false
        },
        altText: String
    }],
    stock: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
        set: val => Math.round(val * 10) / 10 // Round to 1 decimal place
    },
    ratingCount: {
        type: Number,
        default: 0
    },
    reviewsCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    isInStock: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on update
productSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

export default model('Product', productSchema);
