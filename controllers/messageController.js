import Message from '../models/Message.js';
import User from '../models/User.js';
import { sendNotificationEmail } from '../services/emailService.js';

// Send a message to admin
const sendMessage = async (req, res) => {
  try {
    const { subject, content, message, name, email } = req.body;
    const userId = req.user.id;

    // Choose whichever message field is sent from frontend
    const messageContent = content || message;

    // Validate
    if (!messageContent) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required',
      });
    }

    // Find admin recipient
    const admin = await User.findOne({ role: 'admin' });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'No admin found to receive the message',
      });
    }

    // Create and save new message
    const newMessage = new Message({
      sender: userId,
      recipient: admin._id,
      subject,
      content: messageContent,
      isAdminReply: false,
    });

    await newMessage.save();

    // Send email notification to admin
    try {
      await sendNotificationEmail({
        to: admin.email,
        subject: `New Message: ${subject}`,
        text: `You have received a new message from a user.\n\n${messageContent}`,
      });
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Admin replies to a message
const replyToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content, message } = req.body;
    const adminId = req.user.id;

    const replyContent = content || message;
    if (!replyContent) {
      return res.status(400).json({
        success: false,
        message: 'Reply content is required',
      });
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Original message not found',
      });
    }

    const reply = new Message({
      sender: adminId,
      recipient: originalMessage.sender,
      subject: `Re: ${originalMessage.subject}`,
      content: replyContent,
      isAdminReply: true,
      originalMessage: messageId,
    });

    await reply.save();

    // Mark original as read
    originalMessage.isRead = true;
    await originalMessage.save();

    // Notify user
    try {
      const user = await User.findById(originalMessage.sender);
      if (user && user.email) {
        await sendNotificationEmail({
          to: user.email,
          subject: `Re: ${originalMessage.subject}`,
          text: `You have received a reply to your message.\n\n${replyContent}`,
        });
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Reply sent successfully',
      data: reply,
    });
  } catch (error) {
    console.error('Error replying to message:', error);
    res.status(500).json({
      success: false,
      message: 'Error replying to message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Get user messages (no pagination plugin)
const getUserMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, page = 1 } = req.query;

    const perPage = parseInt(limit, 10);
    const currentPage = parseInt(page, 10);
    const skip = (currentPage - 1) * perPage;

    const query = {
      $or: [{ sender: userId }, { recipient: userId }],
    };

    const messages = await Message.find(query)
      .populate('sender', 'firstName lastName email')
      .populate('recipient', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage);

    const totalMessages = await Message.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        messages,
        totalMessages,
        totalPages: Math.ceil(totalMessages / perPage),
        currentPage,
      },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Get unread message count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await Message.countDocuments({
      recipient: userId,
      isRead: false,
    });

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting unread count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
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
        message: 'Message not found or not authorized',
      });
    }

    res.json({
      success: true,
      message: 'Message marked as read',
      data: message,
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking message as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export {
  sendMessage,
  replyToMessage,
  getUserMessages,
  getUnreadCount,
  markAsRead,
};
