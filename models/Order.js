import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Define status history schema
const statusHistorySchema = new Schema({
    status: {
        type: String,
        required: true,
        enum: ['pending', 'processing', 'assigned', 'in_transit', 'delivered', 'completed', 'cancelled', 'rejected']
    },
    changedAt: {
        type: Date,
        default: Date.now
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    note: {
        type: String,
        trim: true
    }
});

const orderSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    items: [{
        productId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        subtotal: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    tax: {
        type: Number,
        required: true,
        min: 0
    },
    shipping: {
        type: Number,
        required: true,
        min: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'assigned', 'in_transit', 'delivered', 'completed', 'cancelled', 'rejected'],
        default: 'pending'
    },
    statusHistory: [statusHistorySchema],
    cancellationReason: {
        type: String,
        trim: true
    },
    rejectionReason: {
        type: String,
        trim: true
    },
    marketer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedAt: {
        type: Date
    },
    assignmentExpiresAt: {
        type: Date
    },
    inTransitAt: {
        type: Date
    },
    deliveredAt: {
        type: Date
    },
    completedAt: {
        type: Date
    },
    cancelledAt: {
        type: Date
    },
    rejectedAt: {
        type: Date
    },
    commissionRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    commissionAmount: {
        type: Number,
        default: 0
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    paidAt: {
        type: Date
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'bank_transfer', 'cash_on_delivery', 'wallet'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'],
        default: 'pending'
    },
    referralInfo: {
        referredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        referralCommissionRate: {
            type: Number,
            default: 0
        },
        referrerShare: {
            type: Number,
            default: 0
        },
        userShare: {
            type: Number,
            default: 0
        }
    },
    trackingNumber: {
        type: String,
        trim: true
    },
    deliveryProof: {
        type: String,
        trim: true
    },
    shippingAddress: {
        street: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true
        },
        zipCode: {
            type: String,
            required: true
        }
    },
    billingAddress: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
    },
    notes: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    previousMarketers: [{
        marketerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        assignedAt: Date,
        unassignedAt: Date,
        reason: String
    }],
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true
        }
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    isSeasonalPromo: {
        type: Boolean,
        default: false
    },
    seasonalPromoRate: {
        type: Number,
        default: 0
    },
    customerConfirmed: {
        type: Boolean,
        default: false
    },
    commissionReleased: {
        type: Boolean,
        default: false
    },
    withdrawalEligible: {
        type: Boolean,
        default: false
    },
    withdrawalAvailableFrom: {
        type: Date,
        default: null
    },
    withdrawalAvailableUntil: {
        type: Date,
        default: null
    },
    withdrawalRequested: {
        type: Boolean,
        default: false
    },
    withdrawalProcessed: {
        type: Boolean,
        default: false
    },
    markedDeliveredAt: {
        type: Date,
        default: null
    },
    confirmedAt: {
        type: Date,
        default: null
    },
    commissionProcessed: {
        type: Boolean,
        default: false
    },
    tracking: {
        statusUpdates: [{
            status: String,
            location: String,
            timestamp: { type: Date, default: Date.now },
            notes: String
        }],
        currentLocation: {
            type: { type: String, default: 'Point' },
            coordinates: [Number], // [longitude, latitude]
            address: String,
            lastUpdated: Date
        },
        estimatedDelivery: Date,
        deliveryAgent: {
            name: String,
            contact: String,
            company: String
        }
    },
},
{
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Update timestamp on update
orderSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

// Add pre-save hook to calculate order totals
orderSchema.pre('save', async function(next) {
    if (this.isModified('items') || this.isNew) {
        // Calculate item totals
        this.items = this.items.map(item => {
            item.total = item.price * item.quantity;
            return item;
        });

        // Calculate order total
        this.totalAmount = this.items.reduce((sum, item) => sum + item.total, 0);
        
        // Calculate commission amount
        this.commissionAmount = (this.totalAmount * this.commissionRate) / 100;
        
        // Update referral shares if applicable
        if (this.referralInfo?.referredBy && this.referralInfo.referralCommissionRate > 0) {
            const totalReferralCommission = (this.totalAmount * this.referralInfo.referralCommissionRate) / 100;
            this.referralInfo.referrerShare = totalReferralCommission * 0.5; // 50% to referrer
            this.referralInfo.userShare = totalReferralCommission * 0.5; // 50% to user
        }
    }
    
    // Update status history if status changed
    if (this.isModified('status')) {
        if (!this.statusHistory) {
            this.statusHistory = [];
        }
        this.statusHistory.push({
            status: this.status,
            changedBy: this.updatedBy || this.user,
            note: this.status === 'cancelled' ? this.cancellationReason : 
                  (this.status === 'rejected' ? this.rejectionReason : '')
        });
    }
    
    next();
});

// Add text index for search
orderSchema.index({
    'orderNumber': 'text',
    'customerInfo.name': 'text',
    'customerInfo.phone': 'text',
    'customerInfo.email': 'text',
    'shippingAddress.address': 'text',
    'shippingAddress.city': 'text',
    'shippingAddress.state': 'text'
});

// Add method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
    return ['pending', 'processing', 'assigned'].includes(this.status);
};

// Add method to check if order can be rejected
orderSchema.methods.canBeRejected = function() {
    return ['pending', 'processing', 'assigned', 'in_transit'].includes(this.status);
};

const Order = mongoose.model('Order', orderSchema);

export default Order;
