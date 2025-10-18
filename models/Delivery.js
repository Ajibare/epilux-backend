import mongoose from 'mongoose';

const deliverySchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    marketer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'in_transit', 'delivered', 'confirmed', 'disputed'],
        default: 'pending'
    },
    deliveryProof: {
        type: String, // URL to delivery proof image
        required: false
    },
    deliveryDate: {
        type: Date
    },
    confirmationDate: {
        type: Date
    },
    notes: {
        type: String,
        trim: true
    },
    commissionStatus: {
        type: String,
        enum: ['pending', 'active', 'paid'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Indexes for faster queries
deliverySchema.index({ order: 1, marketer: 1, customer: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ commissionStatus: 1 });

// Pre-save hook to set delivery date
deliverySchema.pre('save', function(next) {
    if (this.isModified('status') && this.status === 'delivered' && !this.deliveryDate) {
        this.deliveryDate = new Date();
    }
    
    if (this.isModified('status') && this.status === 'confirmed' && !this.confirmationDate) {
        this.confirmationDate = new Date();
        this.commissionStatus = 'active';
    }
    
    next();
});

// Method to check if delivery is eligible for commission
deliverySchema.methods.isCommissionEligible = function() {
    return this.status === 'confirmed' && this.commissionStatus === 'active';
};

export default mongoose.model('Delivery', deliverySchema);
