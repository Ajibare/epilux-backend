// server/controllers/userController.js
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';
import { generateJsonExport } from '../utils/dataExport.js';

// @desc    Reviews written by the logged in user (approved and pending)
// @route   GET /api/users/me/reviews
// @access  Private
export const getMyReviews = async (req, res, next) => {
    try {
        const reviews = await Review.find({ user: req.user.id })
            .populate('product', 'name images price slug')
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, count: reviews.length, data: reviews });
    } catch (error) {
        next(error);
    }
};

export const deleteUser = async (req, res, next) => {
    try {
        // Don't let an account disappear while money or deliveries are outstanding
        const [wallet, openOrders] = await Promise.all([
            Wallet.findOne({ userId: req.user.id }).lean(),
            Order.countDocuments({
                $or: [{ userId: req.user.id }, { buyer: req.user.id }, { marketer: req.user.id }],
                status: { $in: ['pending', 'processing', 'assigned', 'in_transit', 'delivered'] },
                isPaid: true
            })
        ]);
        if ((wallet?.availableBalance || 0) > 0 || (wallet?.lockedAmount || 0) > 0) {
            return res.status(400).json({ success: false, message: 'Please withdraw your wallet balance (and wait for pending withdrawals) before deleting your account.' });
        }
        if (openOrders > 0) {
            return res.status(400).json({ success: false, message: 'You have orders in progress. You can delete your account once they are completed.' });
        }
        if (req.user.role === 'admin') {
            return res.status(400).json({ success: false, message: 'Admin accounts cannot be deleted from here.' });
        }

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
        const { firstName, lastName } = req.body;
        const phone = req.body.phone ?? req.body.profile?.phone;

        // Only these fields are user-editable; everything else (role, balances,
        // email) is ignored. Missing fields are left unchanged.
        const updates = { updatedAt: Date.now() };
        if (typeof firstName === 'string' && firstName.trim()) updates.firstName = firstName.trim();
        if (typeof lastName === 'string' && lastName.trim()) updates.lastName = lastName.trim();
        if (typeof phone === 'string') updates['profile.phone'] = phone.trim();

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates },
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



// @desc    Remove user address
// @route   DELETE /api/users/me/address
// @access  Private
export const deleteAddress = async (req, res, next) => {
    try {
        await User.updateOne({ _id: req.user.id }, { $unset: { 'profile.address': 1 } });
        res.status(200).json({ success: true, message: 'Address removed', data: {} });
    } catch (error) {
        next(error);
    }
};

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