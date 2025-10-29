import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    availableBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    lockedAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    totalEarned: {
        type: Number,
        default: 0,
        min: 0
    },
    totalWithdrawn: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Virtual for total balance (available + locked)
walletSchema.virtual('totalBalance').get(function() {
    return this.availableBalance + this.lockedAmount;
});

// Pre-save hook to update lastUpdated
walletSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;
