import express from 'express';
import ContactMessage from '../models/ContactMessage.js';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendNotificationEmail } from '../services/emailService.js';

const router = express.Router();

// Soft per-IP limit for the public form. In-memory, so on serverless it is per
// instance, which is enough to stop casual spam without extra infrastructure.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recentSubmissions = new Map();

const isRateLimited = (ip) => {
    const now = Date.now();
    const timestamps = (recentSubmissions.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    if (timestamps.length >= MAX_PER_WINDOW) {
        recentSubmissions.set(ip, timestamps);
        return true;
    }
    timestamps.push(now);
    recentSubmissions.set(ip, timestamps);
    return false;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// @desc    Submit the public contact form
// @route   POST /api/contact
// @access  Public
router.post('/', async (req, res) => {
    try {
        const { name, email, phone, subject, message, inquiryType } = req.body || {};

        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Please tell us your name' });
        }
        if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
        }
        if (typeof message !== 'string' || message.trim().length < 5) {
            return res.status(400).json({ success: false, message: 'Please write a short message' });
        }

        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
        if (isRateLimited(ip)) {
            return res.status(429).json({ success: false, message: 'Too many messages. Please try again later.' });
        }

        const contact = await ContactMessage.create({
            name: name.trim(),
            email: email.trim(),
            phone: typeof phone === 'string' ? phone.trim() : undefined,
            subject: typeof subject === 'string' ? subject.trim() : undefined,
            message: message.trim(),
            inquiryType: typeof inquiryType === 'string' ? inquiryType.trim() : undefined,
            ip
        });

        // Notify admins; the message is already stored, so email failure is non-fatal
        try {
            const admins = await User.find({ role: 'admin' }).select('email').lean();
            await Promise.all(admins.map((admin) => sendNotificationEmail({
                to: admin.email,
                subject: `New contact message: ${contact.subject || contact.inquiryType}`,
                context: {
                    message: `<p><strong>${escapeHtml(contact.name)}</strong> (${escapeHtml(contact.email)}${contact.phone ? `, ${escapeHtml(contact.phone)}` : ''}) wrote:</p><p>${escapeHtml(contact.message).replace(/\n/g, '<br>')}</p>`
                }
            })));
        } catch (emailError) {
            console.error('Failed to send contact notification:', emailError.message);
        }

        res.status(201).json({
            success: true,
            message: 'Thanks for reaching out. We will get back to you shortly.'
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Some details are too long. Please shorten your message and try again.' });
        }
        console.error('Contact form error:', error);
        res.status(500).json({ success: false, message: 'Could not send your message. Please try again.' });
    }
});

// @desc    List contact form messages
// @route   GET /api/contact
// @access  Private/Admin
router.get('/', authenticate, authorize('admin'), async (req, res) => {
    try {
        const filter = {};
        if (['new', 'read', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
        const messages = await ContactMessage.find(filter).sort({ createdAt: -1 }).limit(200).lean();
        res.json({ success: true, count: messages.length, data: messages });
    } catch (error) {
        console.error('List contact messages error:', error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

// @desc    Update a contact message status
// @route   PUT /api/contact/:id/status
// @access  Private/Admin
router.put('/:id/status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!['new', 'read', 'resolved'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Status must be new, read or resolved' });
        }
        const updated = await ContactMessage.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: 'Message not found' });
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Could not update message' });
    }
});

export default router;
