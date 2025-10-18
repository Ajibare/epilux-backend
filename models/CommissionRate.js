import mongoose from 'mongoose';

const commissionRateSchema = new mongoose.Schema({
    // Default commission rate (10%)
    defaultRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 10
    },
    // Special rates for specific users (overrides default)
    userRates: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        rate: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }],
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
    // Last updated by
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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
