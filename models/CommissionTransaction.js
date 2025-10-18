import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const commissionTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  type: {
    type: String,
    enum: ['direct', 'indirect'],
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
commissionTransactionSchema.index({ userId: 1, status: 1 });
commissionTransactionSchema.index({ orderId: 1 });
commissionTransactionSchema.index({ fromUser: 1 });
commissionTransactionSchema.index({ processedAt: -1 });

// Virtual for formatted amount
commissionTransactionSchema.virtual('formattedAmount').get(function() {
  return `₦${this.amount.toFixed(2)}`;
});

// Virtual for formatted rate
commissionTransactionSchema.virtual('formattedRate').get(function() {
  return `${this.rate}%`;
});

// Pre-save hook to validate data
commissionTransactionSchema.pre('save', function(next) {
  if (this.amount < 0) {
    throw new Error('Commission amount cannot be negative');
  }
  next();
});

// Static method to get total commissions by status for a user
commissionTransactionSchema.statics.getUserCommissionsSummary = async function(userId) {
  const result = await this.aggregate([
    {
      $match: { userId: mongoose.Types.ObjectId(userId) }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $project: {
        _id: 0,
        status: '$_id',
        count: 1,
        totalAmount: { $round: ['$totalAmount', 2] }
      }
    }
  ]);

  // Initialize with default values
  const summary = {
    pending: { count: 0, totalAmount: 0 },
    completed: { count: 0, totalAmount: 0 },
    cancelled: { count: 0, totalAmount: 0 },
    total: { count: 0, totalAmount: 0 }
  };

  // Update with actual values
  result.forEach(item => {
    summary[item.status] = {
      count: item.count,
      totalAmount: item.totalAmount
    };
    summary.total.count += item.count;
    summary.total.totalAmount += item.totalAmount;
  });

  return summary;
};

export default model('CommissionTransaction', commissionTransactionSchema);
