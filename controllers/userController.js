// server/controllers/userController.js
import User from '../models/User.js';
import { generateJsonExport } from '../utils/dataExport.js';

export const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findByIdAndDelete(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Optional: Add cleanup for related data (posts, comments, etc.)
        // await Post.deleteMany({ user: req.user.id });
        // await Comment.deleteMany({ user: req.user.id });
        
        // Logout the user
        res.clearCookie('token');
        
        return res.status(200).json({
            success: true,
            message: 'Your account has been permanently deleted'
        });
    } catch (error) {
        next(error);
    }
};

export const exportUserData = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get all user-related data
        // const posts = await Post.find({ user: user._id });
        // const comments = await Comment.find({ user: user._id });
        
        const userData = {
            profile: user,
            // posts,
            // comments,
            // Add other related data as needed
            exportedAt: new Date().toISOString()
        };

        // Generate JSON file
        const fileName = `user-data-${user._id}-${Date.now()}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        
        return res.send(generateJsonExport(userData));
    } catch (error) {
        next(error);
    }
};



// Update user address
// @desc    Update user address
// @route   PUT /api/users/me/address
// @access  Private
export const updateAddress = async (req, res, next) => {
    try {
        const { street, city, state, zipCode, country } = req.body;
        
        // Basic validation
        if (!street || !city || !state || !zipCode || !country) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required address fields: street, city, state, zipCode, country'
            });
        }
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { 
                'profile.address': { 
                    street, 
                    city, 
                    state, 
                    zipCode, 
                    country 
                },
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            data: user.profile.address || {}
        });
    } catch (error) {
        next(error);
    }
};




// @desc    Get logged in user profile
// @route   GET /api/users/me
// @access  Private
export const getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update user profile
// @route   PUT /api/users/me
// @access  Private
export const updateProfile = async (req, res, next) => {
    try {
        const { firstName, lastName, phone } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { 
                firstName,
                lastName,
                phone,
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};



// @desc    Get user address
// @route   GET /api/users/me/address
// @access  Private
// @desc    Get user address
// @route   GET /api/users/me/address
// @access  Private
export const getAddress = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('profile.address');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.status(200).json({
            success: true,
            data: user.profile?.address || {}
        });
    } catch (error) {
        next(error);
    }
};