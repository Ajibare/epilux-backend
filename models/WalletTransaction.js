import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema({
    walletId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit', 'withdrawal', 'refund', 'commission'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed'
    },
    reference: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    availableBalance: {
        type: Number,
        required: true
    },
    lockedAmount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes for faster queries
walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ reference: 1 }, { unique: true });
walletTransactionSchema.index({ userId: 1, type: 1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

export default WalletTransaction;
