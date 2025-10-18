// models/Dispute.js
import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    raisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'in_review', 'resolved', 'rejected'],
        default: 'open'
    },
    resolution: String,
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolvedAt: Date,
    evidence: [String] // URLs to images or other evidence
}, { timestamps: true });

export default mongoose.model('Dispute', disputeSchema);