import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referrerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    affiliateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Affiliate',
        default: null
    },
    bagsSold: {
        type: Number,
        required: true,
        min: 1
    },
    amount: {
        type: Number,
        required: true
    },
    commissionEarned: {
        type: Number,
        default: 0
    },
    commissionRate: {
        type: Number,
        default: 0.10
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'cancelled'],
        default: 'completed'
    },
    type: {
        type: String,
        enum: ['sales', 'referral'],
        default: 'sales'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    description: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Calculate commission before saving
transactionSchema.pre('save', function(next) {
    if (this.commissionEarned === 0 && this.amount > 0) {
        this.commissionEarned = this.amount * this.commissionRate;
    }
    next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;