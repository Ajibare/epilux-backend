import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

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
        required: false,
        default: function() {
            // Auto-generate a unique SKU if not provided
            return `SKU-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString().slice(-4)}`;
        },
        validate: {
            validator: function(v) {
                // Ensure SKU is not null or empty string
                return v !== null && v.trim() !== '';
            },
            message: 'SKU cannot be empty'
        }
    },
    category: {
        type: String,
        required: true
    },
    brand: {
        type: String,
        required: false
    },
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    numOfReviews: {
        type: Number,
        default: 0
    },
    reviews: [{
        type: Types.ObjectId,
        ref: 'Review'
    }],
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
    },
    assignedMarketer: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
});

// Update timestamp on update
productSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

export default model('Product', productSchema);
