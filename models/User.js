import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const { Schema, model } = mongoose;

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'affiliate', 'marketer'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    assignedOrdersCount: {
        type: Number,
        default: 0
    },
    completedOrdersCount: {
        type: Number,
        default: 0
    },
    suspended: {
        type: Boolean,
        default: false
    },
    suspensionReason: {
        type: String,
        default: ''
    },
    emailVerified: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date
    },
    profile: {
        phone: {
            type: String,
            trim: true
        },
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            zipCode: String
        },
        avatar: String,
        dateOfBirth: Date
    },
    assignedMarketer: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Referral relationships
    referredBy: {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        date: {
            type: Date,
            default: null
        }
    },
    referrals: [{
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        date: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['pending', 'active', 'inactive'],
            default: 'pending'
        }
    }],
    // Affiliate information
    affiliateInfo: {
        affiliateCode: String,
        referredBy: String,
        commissionRate: {
            type: Number,
            default: 0
        },
        totalEarnings: {
            type: Number,
            default: 0
        },
        availableBalance: {
            type: Number,
            default: 0
        }
    },
    // Commission tracking
    commissionBalance: {
        pending: {
            type: Number,
            default: 0,
            min: 0
        },
        available: {
            type: Number,
            default: 0,
            min: 0
        },
        lifetime: {
            type: Number,
            default: 0,
            min: 0
        },
        pendingWithdrawal: {
            type: Number,
            default: 0,
            min: 0
        },
        totalWithdrawn: {
            type: Number,
            default: 0,
            min: 0
        },
        lastWithdrawalDate: Date
    },
    // Stats and metrics
    stats: {
        totalReferrals: {
            type: Number,
            default: 0
        },
        activeReferrals: {
            type: Number,
            default: 0
        },
        totalCommissionEarned: {
            type: Number,
            default: 0
        },
        totalWithdrawn: {
            type: Number,
            default: 0
        },
        commissionShareActive: {
            type: Boolean,
            default: false
        }
    },
    rating: {
        type: Number,
        default: 0
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
},
{ timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Update timestamp on update
userSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

userSchema.methods.comparePassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};


// Generate affiliate code if user is an affiliate
userSchema.pre('save', function(next) {
    if (this.role === 'affiliate' && !this.affiliateInfo.affiliateCode) {
        this.affiliateInfo.affiliateCode = `AFF${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    }
    next();
});


export default model('User', userSchema);
