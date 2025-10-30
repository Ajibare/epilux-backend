import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { 
    getAffiliateProfile, 
    getAffiliateDashboard,
    getAffiliateCommissions,
    requestWithdrawal,
    getWithdrawals,
    getReferralNetwork,
    getAffiliateSales,
    getAffiliateReferrals,
    recordSale
} from '../controllers/affiliateController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Dashboard and Profile
router.get('/dashboard', getAffiliateDashboard);
router.get('/profile', getAffiliateProfile);

// Commissions and Withdrawals
router.get('/commissions', getAffiliateCommissions);
router.get('/withdrawals', getWithdrawals);
router.post('/withdrawals', requestWithdrawal);

// Referrals and Network
router.get('/referral-network', getReferralNetwork);
router.get('/referrals', getAffiliateReferrals);

// Sales
router.get('/sales', getAffiliateSales);
router.post('/record-sale', recordSale);

export default router;