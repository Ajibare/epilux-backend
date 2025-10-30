import Review from '../models/Review.js';
import Product from '../models/Product.js';
import { NotFoundError } from '../middleware/errorHandler.js';

export const getProductReviews = async (req, res, next) => {
    try {
        const reviews = await Review.find({ 
            product: req.params.productId,
            isApproved: true 
        })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: reviews.length,
            data: reviews
        });
    } catch (error) {
        next(error);
    }
};

export const createReview = async (req, res, next) => {
    try {
        const { rating, comment } = req.body;
        const productId = req.params.productId;
        
        // Check if product exists
        const product = await Product.findById(productId);
        if (!product) {
            throw new NotFoundError('Product not found');
        }

        // Check if user already reviewed this product
        const existingReview = await Review.findOne({
            user: req.user.id,
            product: productId
        });

        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this product'
            });
        }

        const review = await Review.create({
            user: req.user.id,
            product: productId,
            rating,
            comment,
            isApproved: false // Admin needs to approve reviews
        });

        // Populate user data for response
        await review.populate('user', 'name email');

        res.status(201).json({
            success: true,
            message: 'Review submitted for approval',
            data: review
        });
    } catch (error) {
        next(error);
    }
};

export const updateReview = async (req, res, next) => {
    try {
        const { rating, comment } = req.body;
        const review = await Review.findById(req.params.id);

        if (!review) {
            throw new NotFoundError('Review not found');
        }

        // Check if user is the review owner or admin
        if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this review'
            });
        }

        review.rating = rating || review.rating;
        review.comment = comment || review.comment;
        
        // If admin is updating, they can approve the review
        if (req.user.role === 'admin' && req.body.isApproved !== undefined) {
            review.isApproved = req.body.isApproved;
        }

        const updatedReview = await review.save();
        await updatedReview.populate('user', 'name email');

        res.json({
            success: true,
            message: 'Review updated',
            data: updatedReview
        });
    } catch (error) {
        next(error);
    }
};

export const deleteReview = async (req, res, next) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            throw new NotFoundError('Review not found');
        }

        // Check if user is the review owner or admin
        if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this review'
            });
        }

        await review.remove();

        res.json({
            success: true,
            message: 'Review deleted'
        });
    } catch (error) {
        next(error);
    }
};
