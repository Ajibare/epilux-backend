// models/Commission.js
import mongoose from 'mongoose';

const commissionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    type: {
        type: String,
        enum: ['referral', 'sale', 'bonus', 'other'],
        default: 'referral'
    },
    description: String,
    reference: String,
    status: {
        type: String,
        enum: ['pending', 'approved', 'reversed'],
        default: 'pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    metadata: mongoose.Schema.Types.Mixed
}, {
    timestamps: true
});

export default mongoose.model('Commission', commissionSchema);