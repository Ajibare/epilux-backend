import mongoose from 'mongoose';

const productRatingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    review: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    images: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Prevent duplicate ratings from the same user for the same product and order
productRatingSchema.index({ user: 1, product: 1, order: 1 }, { unique: true });

// Static method to get average rating of a product
productRatingSchema.statics.getAverageRating = async function(productId) {
    const result = await this.aggregate([
        {
            $match: { product: productId }
        },
        {
            $group: {
                _id: '$product',
                averageRating: { $avg: '$rating' },
                numberOfRatings: { $sum: 1 }
            }
        }
    ]);

    try {
        await this.model('Product').findByIdAndUpdate(productId, {
            rating: result[0] ? result[0].averageRating : 0,
            ratingCount: result[0] ? result[0].numberOfRatings : 0
        });
    } catch (err) {
        console.error('Error updating product rating:', err);
    }
};

// Call getAverageRating after save
productRatingSchema.post('save', function() {
    this.constructor.getAverageRating(this.product);
});

// Call getAverageRating after remove
productRatingSchema.post('remove', function() {
    this.constructor.getAverageRating(this.product);
});

const ProductRating = mongoose.model('ProductRating', productRatingSchema);

export default ProductRating;
