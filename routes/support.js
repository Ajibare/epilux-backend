import express from 'express';
import { authenticate as protect, authorize } from '../middleware/auth.js';
import {
    createTicket,
    getTickets,
    getTicketById,
    addMessage,
    updateTicketStatus,
    assignTicket
} from '../controllers/supportController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// File upload configuration for support tickets
const supportUpload = upload.fields([
    { name: 'attachments', maxCount: 5 },
    { name: 'messageAttachments', maxCount: 5 }
]);

// All routes are protected
router.use(protect);

// Create a new support ticket
router.post('/', supportUpload, createTicket);

// Get all tickets (filterable by status and category)
router.get('/', getTickets);

// Get single ticket by ID
router.get('/:id', getTicketById);

// Add message to ticket
router.post('/:id/messages', supportUpload, addMessage);

// Update ticket status (admin/support only)
router.put('/:id/status', authorize(['admin', 'support']), updateTicketStatus);

// Assign ticket to support staff (admin only)
router.put('/:id/assign', authorize(['admin']), assignTicket);

export default router;
