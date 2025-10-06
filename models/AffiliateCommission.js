import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const AffiliateCommissionSchema = new Schema({
    affiliate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referredUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    commissionRate: {
        type: Number,
        required: true,
        default: 0.1 // 10% default commission rate
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'paid', 'cancelled'],
        default: 'pending'
    },
    notes: {
        type: String,
        trim: true
    },
    paidAt: {
        type: Date
    },
    paymentMethod: {
        type: String
    },
    paymentReference: {
        type: String
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for better query performance
AffiliateCommissionSchema.index({ affiliate: 1, status: 1 });
AffiliateCommissionSchema.index({ referredUser: 1 });
AffiliateCommissionSchema.index({ order: 1 }, { unique: true });

// Pre-save hook to ensure commission is calculated correctly
AffiliateCommissionSchema.pre('save', async function(next) {
    if (this.isNew) {
        // Round to 2 decimal places
        this.amount = Math.round(this.amount * 100) / 100;
    }
    next();
});

// Static method to get total earned by affiliate
AffiliateCommissionSchema.statics.getTotalEarned = async function(affiliateId) {
    const result = await this.aggregate([
        {
            $match: { 
                affiliate: affiliateId,
                status: { $in: ['approved', 'paid'] }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);

    return result.length > 0 ? result[0].total : 0;
};

// Static method to get pending commissions
AffiliateCommissionSchema.statics.getPendingCommissions = async function(affiliateId) {
    const result = await this.aggregate([
        {
            $match: { 
                affiliate: affiliateId,
                status: 'pending'
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    return {
        total: result.length > 0 ? result[0].total : 0,
        count: result.length > 0 ? result[0].count : 0
    };
};

// Virtual for formatted amount
AffiliateCommissionSchema.virtual('formattedAmount').get(function() {
    return `$${this.amount.toFixed(2)}`;
});

// Virtual for status badge class
AffiliateCommissionSchema.virtual('statusBadgeClass').get(function() {
    const statusClasses = {
        pending: 'bg-yellow-100 text-yellow-800',
        approved: 'bg-blue-100 text-blue-800',
        cancelled: 'bg-red-100 text-red-800'
    };
    return statusClasses[this.status] || 'bg-gray-100 text-gray-800';
});

export default model('AffiliateCommission', AffiliateCommissionSchema);
