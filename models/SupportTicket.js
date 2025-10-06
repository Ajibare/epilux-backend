import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    category: {
        type: String,
        enum: ['billing', 'technical', 'account', 'general', 'feature_request', 'bug_report'],
        required: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    messages: [{
        sender: {
            type: String, // 'user' or 'support'
            required: true
        },
        message: {
            type: String,
            required: true
        },
        attachments: [{
            url: String,
            name: String,
            type: String
        }],
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    attachments: [{
        url: String,
        name: String,
        type: String
    }],
    resolvedAt: Date,
    closedAt: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for better query performance
supportTicketSchema.index({ user: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: -1, createdAt: 1 });

// Virtual for ticket URL
supportTicketSchema.virtual('url').get(function() {
    return `/support/tickets/${this._id}`;
});

// Pre-save hook to update timestamps
supportTicketSchema.pre('save', function(next) {
    if (this.isModified('status')) {
        if (this.status === 'resolved' && !this.resolvedAt) {
            this.resolvedAt = new Date();
        } else if (this.status === 'closed' && !this.closedAt) {
            this.closedAt = new Date();
        }
    }
    next();
});

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
