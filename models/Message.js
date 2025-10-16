// import mongoose from 'mongoose';

// const messageSchema = new mongoose.Schema({
//   sender: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   recipient: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   subject: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   content: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   isRead: {
//     type: Boolean,
//     default: false
//   },
//   isAdminReply: {
//     type: Boolean,
//     default: false
//   },
//   originalMessage: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Message'
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// });

// // Create a text index for search functionality
// messageSchema.index({
//   subject: 'text',
//   content: 'text'
// });

// // Static method to get unread message count for a user
// messageSchema.statics.getUnreadCount = async function(userId) {
//   return this.countDocuments({
//     recipient: userId,
//     isRead: false
//   });
// };

// const Message = mongoose.model('Message', messageSchema);

// export default Message;


import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false
    },
    isAdminReply: {
      type: Boolean,
      default: false
    },
    originalMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    }
  },
  {
    timestamps: true // ✅ Automatically adds createdAt & updatedAt
  }
);

// ✅ Create text index for faster search by subject/content
messageSchema.index({ subject: 'text', content: 'text' });

// ✅ Helper to count unread messages for a user
messageSchema.statics.getUnreadCount = async function (userId) {
  return this.countDocuments({
    recipient: userId,
    isRead: false
  });
};

// ✅ Optional: Pre-delete hook to remove replies when a message is deleted
messageSchema.pre('remove', async function (next) {
  await this.model('Message').deleteMany({ originalMessage: this._id });
  next();
});

const Message = mongoose.model('Message', messageSchema);

export default Message;


