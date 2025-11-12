import mongoose from 'mongoose';

const commissionRateSchema = new mongoose.Schema({
    // Global commission rate (e.g., 10 for 10%)
    commissionRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 10
    },
    // Roles that are excluded from earning commissions
    excludedRoles: {
        type: [String],
        default: ['admin', 'marketer'],
        enum: ['admin', 'marketer', 'user'] // Add other roles as needed
    },
    // Withdrawal settings
    withdrawalWindow: {
        startDay: {
            type: Number,
            min: 1,
            max: 31,
            default: 26
        },
        endDay: {
            type: Number,
            min: 1,
            max: 31,
            default: 30
        }
    },
    // Last updated by (optional)
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    }
}, {
    timestamps: true
});

// Get effective commission rate for a user
commissionRateSchema.statics.getUserRate = async function(userId) {
    const rateDoc = await this.findOne();
    if (!rateDoc) return 10; // Default fallback
    
    // Check if user has a special rate
    const userRate = rateDoc.userRates.find(ur => ur.user.toString() === userId.toString());
    return userRate ? userRate.rate : rateDoc.defaultRate;
};

// Check if withdrawal window is open
commissionRateSchema.statics.isWithdrawalWindowOpen = function() {
    const rateDoc = this;
    const now = new Date();
    const currentDay = now.getDate();
    
    return currentDay >= rateDoc.withdrawalWindow.startDay && 
           currentDay <= rateDoc.withdrawalWindow.endDay;
};

// Get withdrawal window info
commissionRateSchema.statics.getWithdrawalWindow = function() {
    const rateDoc = this;
    return {
        startDay: rateDoc.withdrawalWindow.startDay,
        endDay: rateDoc.withdrawalWindow.endDay,
        isOpen: this.isWithdrawalWindowOpen()
    };
};

export default mongoose.models.CommissionRate || 
       mongoose.model('CommissionRate', commissionRateSchema);
