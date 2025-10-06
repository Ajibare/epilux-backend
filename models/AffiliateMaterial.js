import mongoose from 'mongoose';

const affiliateMaterialSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: false,
        trim: true
    },
    type: {
        type: String,
        required: true,
        enum: ['banner', 'email', 'social', 'video', 'document', 'other'],
        default: 'other'
    },
    content: {
        type: String,
        required: false
    },
    link: {
        type: String,
        required: false
    },
    imageUrl: {
        type: String,
        required: false
    },
    tags: [{
        type: String,
        trim: true
    }],
    isActive: {
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
    }
});

// Update the updatedAt field on save
affiliateMaterialSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Create text index for search
affiliateMaterialSchema.index({
    title: 'text',
    description: 'text',
    tags: 'text'
});

const AffiliateMaterial = mongoose.model('AffiliateMaterial', affiliateMaterialSchema);

export default AffiliateMaterial;
