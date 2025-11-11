import express from 'express';
import { check } from 'express-validator';
import * as commissionController from '../controllers/commissionController.js';
import { authenticate as auth } from '../middleware/auth.js';
import { admin } from '../middleware/auth.js';
import { addCommission } from '../controllers/commissionController.js';


const router = express.Router();

// @route   GET api/commission/history
// @desc    Get user's commission history
// @access  Private
router.get('/history', auth, (req, res) => commissionController.getCommissionHistory(req, res));

// @route   GET api/commission/summary
// @desc    Get user's commission summary
// @access  Private
router.get('/summary', auth, (req, res) => commissionController.getCommissionSummary(req, res));

// @route   POST api/commission/process
// @desc    Process commission for a sale (Admin only)
// @access  Private/Admin
router.post(
  '/process',
  [
    auth,
    admin,
    [
      check('saleId', 'Sale ID is required').not().isEmpty(),
      check('amount', 'Amount must be a positive number').isFloat({ min: 0 }),
      check('userId', 'User ID is required').not().isEmpty()
    ]
  ],
  (req, res) => commissionController.processSaleCommission(req, res)
);

// @route   PUT api/commission/:id/status
// @desc    Update commission status (Admin only)
// @access  Private/Admin
router.put(
  '/:id/status',
  [
    auth,
    admin,
    [
      check('status', 'Status is required')
        .isIn(['pending', 'completed', 'cancelled'])
    ]
  ],
  (req, res) => commissionController.updateCommissionStatus(req, res)
);


// Protected admin routes
router.use(verifyToken);
router.use(authorize('admin'));

// Add commission to user
router.post('/', addCommission);


export default router;
