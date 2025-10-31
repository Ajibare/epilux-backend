import Review from '../models/Review.js';
import Product from '../models/Product.js';
import { NotFoundError } from '../middleware/errorHandler.js';

import mongoose from 'mongoose';

export const getProductReviews = async (req, res, next) => {
    try {
        let productId = req.params.productId;
        let query = { isApproved: true };
        
        // Check if the productId is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(productId)) {
            query.product = productId;
        } else {
            // If not a valid ObjectId, assume it's a slug and find the product by slug
            const product = await Product.findOne({ slug: productId });
            if (!product) {
                throw new NotFoundError('Product not found');
            }
            query.product = product._id;
        }

        const reviews = await Review.find(query)
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
        let productId = req.params.productId;
        let product;
        
        // Check if product exists - handle both slug and ObjectId
        if (mongoose.Types.ObjectId.isValid(productId)) {
            product = await Product.findById(productId);
        } else {
            product = await Product.findOne({ slug: productId });
        }
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
        const reviewId = req.params.id;
        let productId = req.params.productId;

        // Find the product to get its ID if a slug was provided
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            const product = await Product.findOne({ slug: productId });
            if (!product) {
                throw new NotFoundError('Product not found');
            }
            productId = product._id;
        }

        // Find the review
        const review = await Review.findOne({
            _id: reviewId,
            product: productId,
            user: req.user.id // Ensure the user owns the review
        });

        if (!review) {
            throw new NotFoundError('Review not found');
        }

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
        const reviewId = req.params.id;
        let productId = req.params.productId;

        // Find the product to get its ID if a slug was provided
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            const product = await Product.findOne({ slug: productId });
            if (!product) {
                throw new NotFoundError('Product not found');
            }
            productId = product._id;
        }

        // Find and delete the review
        const review = await Review.findOneAndDelete({
            _id: reviewId,
            product: productId,
            user: req.user.id // Ensure the user owns the review
        });

        if (!review) {
            throw new NotFoundError('Review not found');
        }

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
