import mongoose from 'mongoose';

const affiliateSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true
    },
    registrationDate: {
        type: Date,
        default: Date.now
    },
    totalSales: {
        type: Number,
        default: 0
    },
    currentCommission: {
        type: Number,
        default: 0
    },
    referralCode: {
        type: String,
        required: true,
        unique: true
    },
    referredBy: {
        type: String,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    commissionRate: {
        type: Number,
        default: 0.10 // 10% commission rate
    },
    totalCommissionEarned: {
        type: Number,
        default: 0
    },
    totalReferrals: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Generate referral code before saving
affiliateSchema.pre('save', function(next) {
    if (!this.referralCode) {
        this.referralCode = generateReferralCode();
    }
    next();
});

// Helper function to generate referral code
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const Affiliate = mongoose.model('Affiliate', affiliateSchema);

export default Affiliate;