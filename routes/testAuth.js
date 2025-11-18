import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Test authentication endpoint
router.get('/test-auth', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication working',
    user: req.user ? {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role
    } : null,
    headers: {
      authorization: req.headers.authorization ? 'Present' : 'Missing'
    }
  });
});

export default router;
