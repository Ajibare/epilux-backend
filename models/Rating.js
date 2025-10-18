// models/Rating.js
import mongoose from 'mongoose';

const ratingSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    ratedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    comment: String,
    aspects: {
        deliverySpeed: { type: Number, min: 1, max: 5 },
        productCondition: { type: Number, min: 1, max: 5 },
        service: { type: Number, min: 1, max: 5 }
    }
}, { timestamps: true });

export default mongoose.model('Rating', ratingSchema);