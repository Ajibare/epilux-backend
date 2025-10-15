// server/routes/users.js
import express from 'express';
import { authenticate as protect } from '../middleware/auth.js';
import { deleteUser, exportUserData, updateAddress } from '../controllers/userController.js';

const router = express.Router();

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

export default router;


