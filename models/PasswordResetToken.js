import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const passwordResetTokenSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 3600000) // 1 hour from now
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for automatic cleanup of expired tokens
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to create a new reset token
passwordResetTokenSchema.statics.createToken = async function(userId) {
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    // Delete any existing tokens for this user
    await this.deleteMany({ userId });
    
    // Create new token
    const resetToken = new this({
        userId,
        token
    });
    
    await resetToken.save();
    return resetToken;
};

// Static method to find valid token
passwordResetTokenSchema.statics.findValidToken = async function(token) {
    const resetToken = await this.findOne({
        token,
        isUsed: false,
        expiresAt: { $gt: new Date() }
    }).populate('userId');
    
    return resetToken;
};

// Static method to mark token as used
passwordResetTokenSchema.statics.markAsUsed = async function(token) {
    await this.findOneAndUpdate(
        { token },
        { isUsed: true }
    );
};

export default model('PasswordResetToken', passwordResetTokenSchema);
