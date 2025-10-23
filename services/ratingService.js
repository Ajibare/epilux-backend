import ProductRating from '../models/ProductRating.js';
import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';

class RatingService {
    // Rate a product from an order
    static async rateProduct(userId, orderId, productId, rating, review = '', images = []) {
        // Validate rating
        if (rating < 1 || rating > 5) {
            throw new AppError('Rating must be between 1 and 5', 400);
        }

        // Check if order exists and is delivered/completed
        const order = await Order.findOne({
            _id: orderId,
            user: userId,
            status: { $in: ['delivered', 'completed'] }
        });

        if (!order) {
            throw new AppError('Order not found or not eligible for rating', 404);
        }

        // Check if product is in the order
        const productInOrder = order.items.some(
            item => item.product.toString() === productId.toString()
        );

        if (!productInOrder) {
            throw new AppError('Product not found in this order', 400);
        }

        // Check if user has already rated this product from this order
        const existingRating = await ProductRating.findOne({
            user: userId,
            order: orderId,
            product: productId
        });

        let productRating;
        
        if (existingRating) {
            // Update existing rating
            existingRating.rating = rating;
            existingRating.review = review;
            existingRating.images = images;
            productRating = await existingRating.save();
        } else {
            // Create new rating
            productRating = await ProductRating.create({
                user: userId,
                order: orderId,
                product: productId,
                rating,
                review,
                images
            });

            // Update reviews count
            await this.model('Product').findByIdAndUpdate(productId, {
                $inc: { reviewsCount: 1 }
            });
        }

        return productRating;
    }

    // Get product ratings with pagination
    static async getProductRatings(productId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const [ratings, total] = await Promise.all([
            ProductRating.find({ product: productId })
                .populate('user', 'name avatar')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ProductRating.countDocuments({ product: productId })
        ]);

        return {
            data: ratings,
            meta: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit
            }
        };
    }

    // Get user's product ratings
    static async getUserRatings(userId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const [ratings, total] = await Promise.all([
            ProductRating.find({ user: userId })
                .populate('product', 'name images price')
                .populate('order', 'orderNumber')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ProductRating.countDocuments({ user: userId })
        ]);

        return {
            data: ratings,
            meta: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit
            }
        };
    }

    // Get average rating for a product
    static async getProductAverageRating(productId) {
        const result = await ProductRating.aggregate([
            {
                $match: { product: productId }
            },
            {
                $group: {
                    _id: '$product',
                    averageRating: { $avg: '$rating' },
                    totalRatings: { $sum: 1 },
                    ratingDistribution: {
                        $push: {
                            rating: '$rating',
                            count: 1
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    productId: '$_id',
                    averageRating: { $round: ['$averageRating', 1] },
                    totalRatings: 1,
                    ratingDistribution: {
                        $reduce: {
                            input: [1, 2, 3, 4, 5],
                            initialValue: [],
                            in: {
                                $concatArrays: [
                                    '$$value',
                                    [
                                        {
                                            rating: '$$this',
                                            count: {
                                                $size: {
                                                    $filter: {
                                                        input: '$ratingDistribution',
                                                        as: 'r',
                                                        cond: { $eq: ['$$r.rating', '$$this'] }
                                                    }
                                                }
                                            }
                                        }
                                    ]
                                ]
                            }
                        }
                    }
                }
            }
        ]);

        return result[0] || {
            productId,
            averageRating: 0,
            totalRatings: 0,
            ratingDistribution: [1, 2, 3, 4, 5].map(r => ({
                rating: r,
                count: 0
            }))
        };
    }
}

export default RatingService;
