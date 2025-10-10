import Message from '../models/Message.js';
import User from '../models/User.js';
import { sendNotificationEmail } from '../services/emailService.js';

// Send a message to admin
const sendMessage = async (req, res) => {
  try {
    const { subject, content } = req.body;
    const userId = req.user.id;

    // Find an admin to receive the message
    const admin = await User.findOne({ role: 'admin' });
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'No admin found to receive the message'
      });
    }

    const message = new Message({
      sender: userId,
      recipient: admin._id,
      subject,
      content,
      isAdminReply: false
    });

    await message.save();

    // Send email notification to admin
    try {
      await sendNotificationEmail({
        to: admin.email,
        subject: `New Message: ${subject}`,
        text: `You have received a new message from a user.\n\n${content}`
      });
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Continue even if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin replies to a message
const replyToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const adminId = req.user.id;

    // Find the original message
    const originalMessage = await Message.findById(messageId);
    
    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Original message not found'
      });
    }

    // Create reply
    const reply = new Message({
      sender: adminId,
      recipient: originalMessage.sender,
      subject: `Re: ${originalMessage.subject}`,
      content,
      isAdminReply: true,
      originalMessage: messageId
    });

    await reply.save();

    // Mark original message as read
    originalMessage.isRead = true;
    await originalMessage.save();

    // Send email notification to the original sender
    try {
      const user = await User.findById(originalMessage.sender);
      if (user && user.email) {
        await sendNotificationEmail({
          to: user.email,
          subject: `Re: ${originalMessage.subject}`,
          text: `You have received a reply to your message.\n\n${content}`
        });
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Continue even if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Reply sent successfully',
      data: reply
    });
  } catch (error) {
    console.error('Error replying to message:', error);
    res.status(500).json({
      success: false,
      message: 'Error replying to message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get messages for the current user
const getUserMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, page = 1 } = req.query;

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { createdAt: -1 },
      populate: [
        { path: 'sender', select: 'firstName lastName email' },
        { path: 'recipient', select: 'firstName lastName email' }
      ]
    };

    const query = {
      $or: [
        { sender: userId },
        { recipient: userId }
      ]
    };

    const messages = await Message.paginate(query, options);

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get unread message count for the current user
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await Message.countDocuments({
      recipient: userId,
      isRead: false
    });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting unread count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Mark message as read
const markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findOneAndUpdate(
      { _id: messageId, recipient: userId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or not authorized'
      });
    }

    res.json({
      success: true,
      message: 'Message marked as read',
      data: message
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking message as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export {
  sendMessage,
  replyToMessage,
  getUserMessages,
  getUnreadCount,
  markAsRead
};
