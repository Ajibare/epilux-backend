import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';

export const createTicket = async (req, res) => {
    try {
        const { subject, description, category, priority } = req.body;
        const userId = req.user._id;

        const ticket = new SupportTicket({
            user: userId,
            subject,
            description,
            category,
            priority: priority || 'medium',
            messages: [{
                sender: 'user',
                message: description,
                attachments: req.files?.map(file => ({
                    url: file.path,
                    name: file.originalname,
                    type: file.mimetype
                })) || []
            }]
        });

        await ticket.save();
        
        // Populate user details in the response
        await ticket.populate('user', 'firstName lastName email');

        res.status(201).json({
            success: true,
            data: ticket
        });
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create support ticket',
            error: error.message
        });
    }
};

export const getTickets = async (req, res) => {
    try {
        const { status, category, sortBy } = req.query;
        const userId = req.user._id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'support';

        const query = isAdmin ? {} : { user: userId };
        
        if (status) query.status = status;
        if (category) query.category = category;

        const sortOptions = {};
        if (sortBy === 'newest') {
            sortOptions.createdAt = -1;
        } else if (sortBy === 'oldest') {
            sortOptions.createdAt = 1;
        } else if (sortBy === 'priority') {
            sortOptions.priority = -1;
            sortOptions.createdAt = -1;
        }

        const tickets = await SupportTicket.find(query)
            .sort(sortOptions)
            .populate('user', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName');

        res.json({
            success: true,
            count: tickets.length,
            data: tickets
        });
    } catch (error) {
        console.error('Error fetching support tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch support tickets',
            error: error.message
        });
    }
};

export const getTicketById = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id)
            .populate('user', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check if user has permission to view this ticket
        if (req.user.role !== 'admin' && 
            req.user.role !== 'support' && 
            ticket.user._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this ticket'
            });
        }

        res.json({
            success: true,
            data: ticket
        });
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket',
            error: error.message
        });
    }
};

export const addMessage = async (req, res) => {
    try {
        const { message } = req.body;
        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check if user has permission to add message to this ticket
        if (req.user.role !== 'admin' && 
            req.user.role !== 'support' && 
            ticket.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to add message to this ticket'
            });
        }

        const sender = (req.user.role === 'admin' || req.user.role === 'support') ? 'support' : 'user';
        
        ticket.messages.push({
            sender,
            message,
            attachments: req.files?.map(file => ({
                url: file.path,
                name: file.originalname,
                type: file.mimetype
            })) || []
        });

        // If support is responding, update status to in_progress if it was open
        if (sender === 'support' && ticket.status === 'open') {
            ticket.status = 'in_progress';
        }

        await ticket.save();

        res.status(201).json({
            success: true,
            data: ticket
        });
    } catch (error) {
        console.error('Error adding message to ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add message to ticket',
            error: error.message
        });
    }
};

export const updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Only admin/support can update ticket status
        if (req.user.role !== 'admin' && req.user.role !== 'support') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update ticket status'
            });
        }

        ticket.status = status;
        await ticket.save();

        res.json({
            success: true,
            data: ticket
        });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update ticket status',
            error: error.message
        });
    }
};

export const assignTicket = async (req, res) => {
    try {
        const { assignedTo } = req.body;
        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Only admin can assign tickets
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to assign tickets'
            });
        }

        // Verify the assigned user exists and is a support/admin
        const assignedUser = await User.findOne({
            _id: assignedTo,
            role: { $in: ['admin', 'support'] }
        });

        if (!assignedUser) {
            return res.status(400).json({
                success: false,
                message: 'Invalid support staff member'
            });
        }

        ticket.assignedTo = assignedTo;
        if (ticket.status === 'open') {
            ticket.status = 'in_progress';
        }
        
        await ticket.save();

        res.json({
            success: true,
            data: ticket
        });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign ticket',
            error: error.message
        });
    }
};
