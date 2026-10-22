import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
const { Schema, model } = mongoose;

// Helper function to generate a random referral code
const generateReferralCode = () => {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
};

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
    // 'user' = customer. Customers who refer friends earn from them without a
    // separate role; 'affiliate' is kept only so old records still validate.
    role: {
        type: String,
        enum: ['user', 'admin', 'affiliate', 'marketer'],
        default: 'user'
    },
    // Unique referral code for the user
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    // User status and activity
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
    }
},
{ timestamps: true });

// Role changes are only allowed from the admin role endpoints, which opt in
// explicitly. Any other code path that tries to change a role is rejected, so a
// bug elsewhere can never escalate (or demote) an account.
//   document: user.$locals.allowRoleChange = true; await user.save();
//   query:    User.updateOne(filter, { role }, { allowRoleChange: true })
const roleChangeError = () => {
    const error = new Error('Role changes are only allowed through the admin role management endpoints');
    error.statusCode = 403;
    error.isOperational = true;
    return error;
};

userSchema.pre('save', function(next) {
    if (!this.isNew && this.isModified('role') && this.$locals.allowRoleChange !== true) {
        return next(roleChangeError());
    }
    next();
});

const updateTouchesRole = (update) => {
    if (!update) return false;
    if (Array.isArray(update)) return true; // aggregation pipelines can set anything
    return Object.entries(update).some(([key, value]) =>
        key === 'role' ||
        (key.startsWith('$') && value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'role'))
    );
};

['findOneAndUpdate', 'updateOne', 'updateMany', 'replaceOne', 'findOneAndReplace'].forEach((op) => {
    userSchema.pre(op, function(next) {
        if (updateTouchesRole(this.getUpdate()) && this.getOptions().allowRoleChange !== true) {
            return next(roleChangeError());
        }
        next();
    });
});

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


// Generate referral code if it doesn't exist
userSchema.pre('save', function(next) {
    // If user doesn't have a referral code, generate one
    if (!this.referralCode) {
        this.referralCode = generateReferralCode();
    }
    
    next();
});


export default model('User', userSchema);
