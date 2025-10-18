import mongoose from 'mongoose';
const { Schema, model } = mongoose;

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
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'bank_transfer', 'paystack'],
        required: true
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
    marketer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
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
    commissionRate: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'],
        default: 'pending'
    },
    deliveryProof: {
        type: String, // URL to delivery proof image
        default: null
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
 { timestamps: true });


// Update timestamp on update
orderSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

export default model('Order', orderSchema);
