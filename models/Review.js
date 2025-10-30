import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
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
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        trim: true
    },
    isApproved: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Prevent duplicate reviews from same user on same product
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

// Static method to get average rating of a product
reviewSchema.statics.getAverageRating = async function(productId) {
    const obj = await this.aggregate([
        {
            $match: { product: productId, isApproved: true }
        },
        {
            $group: {
                _id: '$product',
                averageRating: { $avg: '$rating' },
                numOfReviews: { $sum: 1 }
            }
        }
    ]);

    try {
        await this.model('Product').findByIdAndUpdate(productId, {
            averageRating: obj[0] ? Math.ceil(obj[0].averageRating * 10) / 10 : 0,
            numOfReviews: obj[0] ? obj[0].numOfReviews : 0
        });
    } catch (err) {
        console.error(err);
    }
};

// Call getAverageRating after save
reviewSchema.post('save', async function() {
    await this.constructor.getAverageRating(this.product);
});

// Call getAverageRating after remove
reviewSchema.post('remove', async function() {
    await this.constructor.getAverageRating(this.product);
});

const Review = mongoose.model('Review', reviewSchema);

export default Review;
