import mongoose from 'mongoose';
import Wallet from '../models/Wallet.js';
import { getWithdrawalWindowStatus } from '../services/earningsService.js';
import { namesMatch, resolveAccount } from '../services/bankService.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { v4 as uuidv4 } from 'uuid';

// Get wallet balance
export const getWalletBalance = async (req, res) => {
    try {

        const wallet = await Wallet.findOne({ userId: req.user.id });
        
        if (!wallet) {
            // Create a new wallet if not found
            const newWallet = new Wallet({
                userId: req.user.id,
                availableBalance: 0,
                lockedAmount: 0,
                totalBalance: 0,
                totalEarned: 0,
                totalWithdrawn: 0,
                currency: 'NGN'
            });
            await newWallet.save();
            
            return res.json({
                success: true,
                data: {
                    availableBalance: 0,
                    lockedAmount: 0,
                    totalBalance: 0,
                    totalEarned: 0,
                    totalWithdrawn: 0,
                    currency: 'NGN',
                    lastUpdated: new Date()
                }
            });
        }

        res.json({
            success: true,
            data: {
                availableBalance: wallet.availableBalance,
                lockedAmount: wallet.lockedAmount,
                totalBalance: wallet.totalBalance,
                totalEarned: wallet.totalEarned,
                totalWithdrawn: wallet.totalWithdrawn,
                currency: wallet.currency,
                lastUpdated: wallet.lastUpdated
            }
        });
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching wallet balance'
        });
    }
};

// Get wallet transactions
export const getWalletTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 10, type } = req.query;
        const skip = (page - 1) * limit;
        
        const query = { userId: req.user.id };
        if (type) {
            query.type = type;
        }

        const transactions = await WalletTransaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await WalletTransaction.countDocuments(query);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching wallet transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching wallet transactions'
        });
    }
};

// Minimum withdrawal in naira (optional, set MIN_WITHDRAWAL to enforce one)
const MIN_WITHDRAWAL = Number(process.env.MIN_WITHDRAWAL) || 0;

// Request withdrawal
// Funds move from available to locked until an admin pays or rejects the request.
export const requestWithdrawal = async (req, res) => {
    const amount = Math.round((Number(req.body?.amount) || 0) * 100) / 100;
    // Accept { bankDetails: {...} } or flat fields from the app
    const bankDetails = req.body?.bankDetails || {
        bankName: req.body?.bankName,
        bankCode: req.body?.bankCode,
        accountNumber: req.body?.accountNumber,
        accountName: req.body?.accountName
    };

    const window = await getWithdrawalWindowStatus();
    if (!window.isOpen) {
        return res.status(403).json({
            success: false,
            message: `Withdrawals are only open from the ${window.startDay}th to the ${window.endDay}th of each month.`,
            nextWindow: { opensAt: window.nextOpensAt, startDay: window.startDay, endDay: window.endDay }
        });
    }

    if (!(amount > 0)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid amount to withdraw' });
    }
    if (MIN_WITHDRAWAL && amount < MIN_WITHDRAWAL) {
        return res.status(400).json({ success: false, message: `The minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}` });
    }
    const accountNumber = String(bankDetails.accountNumber || '').replace(/\s/g, '');
    if (!bankDetails.bankName || !/^\d{10}$/.test(accountNumber) || !String(bankDetails.accountName || '').trim()) {
        return res.status(400).json({ success: false, message: 'Please provide your bank name, 10-digit account number and account name' });
    }

    // Check the account name with the bank for the admin's benefit. This is
    // advisory: whatever the result (including a timeout), the request goes ahead.
    const lookup = bankDetails.bankCode ? await resolveAccount(accountNumber, bankDetails.bankCode) : { verified: false, reason: 'no_bank_code' };
    const verification = {
        verified: lookup.verified,
        resolvedName: lookup.accountName,
        nameMatches: lookup.verified ? namesMatch(bankDetails.accountName, lookup.accountName) : undefined,
        reason: lookup.verified ? undefined : lookup.reason,
        checkedAt: new Date()
    };

    const session = await mongoose.startSession();
    try {
        let transaction;
        let wallet;
        await session.withTransaction(async () => {
            // Atomic check-and-lock so two requests can't spend the same balance
            wallet = await Wallet.findOneAndUpdate(
                { userId: req.user.id, availableBalance: { $gte: amount } },
                { $inc: { availableBalance: -amount, lockedAmount: amount }, $set: { lastUpdated: new Date() } },
                { new: true, session }
            );

            if (!wallet) {
                const error = new Error('Insufficient balance');
                error.statusCode = 400;
                throw error;
            }

            [transaction] = await WalletTransaction.create([{
                walletId: wallet._id,
                userId: req.user.id,
                amount: -amount, // Negative for withdrawal
                type: 'withdrawal',
                status: 'pending',
                reference: `WDR-${uuidv4()}`,
                description: `Withdrawal to ${bankDetails.bankName} ••••${accountNumber.slice(-4)}`,
                metadata: {
                    bankDetails: {
                        bankName: String(bankDetails.bankName).trim(),
                        bankCode: bankDetails.bankCode,
                        accountNumber,
                        accountName: String(bankDetails.accountName).trim(),
                        verification
                    },
                    adminApprovalRequired: true
                },
                availableBalance: wallet.availableBalance,
                lockedAmount: wallet.lockedAmount
            }], { session });
        });

        res.json({
            success: true,
            message: 'Withdrawal request submitted. You will be paid once it is approved.',
            withdrawal: {
                id: transaction._id,
                reference: transaction.reference,
                amount,
                status: transaction.status,
                bankName: transaction.metadata.bankDetails.bankName,
                accountNumber: transaction.metadata.bankDetails.accountNumber,
                accountName: transaction.metadata.bankDetails.accountName,
                requestedAt: transaction.createdAt
            },
            data: {
                transactionId: transaction._id,
                reference: transaction.reference,
                amount,
                status: transaction.status,
                availableBalance: wallet.availableBalance,
                lockedAmount: wallet.lockedAmount
            }
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) console.error('Error processing withdrawal request:', error);
        res.status(statusCode).json({
            success: false,
            message: statusCode >= 500 ? 'Error processing withdrawal request' : error.message
        });
    } finally {
        await session.endSession();
    }
};

// Withdrawal window info for the wallet screen
export const getWithdrawalWindow = async (req, res) => {
    const window = await getWithdrawalWindowStatus();
    res.json({ success: true, data: window });
};

// Add funds to wallet (for admin or system use)
export const addFunds = async (userId, amount, type = 'credit', description = 'Funds added', metadata = {}) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const wallet = await Wallet.findOneAndUpdate(
            { userId },
            {
                $inc: {
                    availableBalance: amount,
                    totalEarned: amount
                },
                lastUpdated: new Date()
            },
            { new: true, upsert: true, session }
        );

        const transaction = new WalletTransaction({
            walletId: wallet._id,
            userId,
            amount,
            type,
            status: 'completed',
            reference: `CR-${uuidv4()}`,
            description,
            metadata,
            availableBalance: wallet.availableBalance,
            lockedAmount: wallet.lockedAmount
        });

        await transaction.save({ session });
        await session.commitTransaction();
        
        return {
            success: true,
            wallet,
            transaction
        };
    } catch (error) {
        await session.abortTransaction();
        console.error('Error adding funds to wallet:', error);
        throw error;
    } finally {
        session.endSession();
    }
};

// Process withdrawal (for admin)
// `decision` is 'approve'/'completed'/'paid' (money sent to the bank) or
// 'reject'/'rejected'/'cancelled' (funds returned to the user's wallet).
export const processWithdrawal = async (withdrawalId, decision, adminId, note = '') => {
    const approve = ['approve', 'approved', 'completed', 'paid'].includes(decision);
    const reject = ['reject', 'rejected', 'cancelled', 'failed'].includes(decision);
    if (!approve && !reject) {
        const error = new Error('Decision must be approve or reject');
        error.statusCode = 400;
        throw error;
    }

    if (!mongoose.Types.ObjectId.isValid(String(withdrawalId))) {
        const error = new Error('Invalid withdrawal ID');
        error.statusCode = 400;
        throw error;
    }

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            // Claim the pending request atomically so it is processed once
            const transaction = await WalletTransaction.findOneAndUpdate(
                { _id: withdrawalId, type: 'withdrawal', status: 'pending' },
                {
                    $set: {
                        status: approve ? 'completed' : 'cancelled',
                        'metadata.processedBy': adminId,
                        'metadata.processedAt': new Date(),
                        'metadata.adminNote': note || undefined
                    }
                },
                { new: true, session }
            );

            if (!transaction) {
                const error = new Error('This withdrawal has already been processed or does not exist');
                error.statusCode = 404;
                throw error;
            }

            const amount = Math.abs(transaction.amount);
            const wallet = await Wallet.findOneAndUpdate(
                { _id: transaction.walletId, lockedAmount: { $gte: amount } },
                approve
                    ? { $inc: { lockedAmount: -amount, totalWithdrawn: amount }, $set: { lastUpdated: new Date() } }
                    : { $inc: { lockedAmount: -amount, availableBalance: amount }, $set: { lastUpdated: new Date() } },
                { new: true, session }
            );

            if (!wallet) {
                throw new Error('Wallet balance does not cover this withdrawal');
            }

            result = { success: true, wallet, transaction };
        });
        return result;
    } finally {
        await session.endSession();
    }
};
