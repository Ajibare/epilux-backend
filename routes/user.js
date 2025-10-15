// server/routes/users.js
import express from 'express';
import { authenticate as protect } from '../middleware/auth.js';
import { deleteUser, exportUserData, updateAddress, getProfile,   updateProfile,
    getAddress, } from '../controllers/userController.js';

const router = express.Router();


// All routes are protected
router.use(protect);

// @route   DELETE /api/users/me
// @desc    Delete user account
// @access  Private
router.delete('/me', protect, deleteUser);

// @route   GET /api/users/me/export
// @desc    Export user data
// @access  Private
router.get('/me/export', protect, exportUserData);

// @route   PUT /api/users/me/address
// @desc    Update user address
// @access  Private
router.put('/me/address', protect, updateAddress);



// @route   GET /api/users/me
// @desc    Get logged in user profile
// @access  Private
router.get('/me', protect, getProfile);

// @route   PUT /api/users/me
// @desc    Update logged in user profile
// @access  Private
router.put('/me', protect, updateProfile);

// @route   GET /api/users/me/address
// @desc    Get logged in user address
// @access  Private
router.get('/me/address', protect, getAddress);



export default router;
