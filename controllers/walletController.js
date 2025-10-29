import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { v4 as uuidv4 } from 'uuid';

// Get wallet balance
export const getWalletBalance = async (req, res) => {
    try {
        const wallet = await Wallet.findOne({ userId: req.user.id });
        
        if (!wallet) {
            return res.status(404).json({
                success: false,
                message: 'Wallet not found'
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

// Request withdrawal
export const requestWithdrawal = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { amount, bankDetails } = req.body;
        
        if (amount <= 0) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Invalid withdrawal amount'
            });
        }

        // Get wallet with lock to prevent race conditions
        const wallet = await Wallet.findOne({ userId: req.user.id })
            .session(session);

        if (!wallet) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Wallet not found'
            });
        }

        if (wallet.availableBalance < amount) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

        // Lock the amount
        wallet.availableBalance -= amount;
        wallet.lockedAmount += amount;
        await wallet.save({ session });

        // Create withdrawal transaction
        const transaction = new WalletTransaction({
            walletId: wallet._id,
            userId: req.user.id,
            amount: -amount, // Negative for withdrawal
            type: 'withdrawal',
            status: 'pending',
            reference: `WDR-${uuidv4()}`,
            description: 'Withdrawal request',
            metadata: {
                bankDetails,
                adminApprovalRequired: true
            },
            availableBalance: wallet.availableBalance,
            lockedAmount: wallet.lockedAmount
        });

        await transaction.save({ session });

        await session.commitTransaction();
        
        res.json({
            success: true,
            message: 'Withdrawal request submitted for approval',
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
        await session.abortTransaction();
        console.error('Error processing withdrawal request:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing withdrawal request'
        });
    } finally {
        session.endSession();
    }
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
export const processWithdrawal = async (withdrawalId, status, adminId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transaction = await WalletTransaction.findOne({
            _id: withdrawalId,
            type: 'withdrawal',
            status: 'pending'
        }).session(session);

        if (!transaction) {
            throw new Error('Pending withdrawal not found');
        }

        const wallet = await Wallet.findById(transaction.walletId).session(session);
        
        if (status === 'completed') {
            // Deduct from locked amount and update withdrawn total
            wallet.lockedAmount += transaction.amount; // amount is negative
            wallet.totalWithdrawn -= transaction.amount; // subtract negative to add
            
            transaction.status = 'completed';
            transaction.metadata.processedBy = adminId;
            transaction.metadata.processedAt = new Date();
        } else {
            // Refund the locked amount
            wallet.availableBalance -= transaction.amount; // subtract negative to add
            wallet.lockedAmount += transaction.amount; // add negative to subtract
            
            transaction.status = status;
            transaction.metadata.cancelledBy = adminId;
            transaction.metadata.cancelledAt = new Date();
        }

        await Promise.all([
            wallet.save({ session }),
            transaction.save({ session })
        ]);

        await session.commitTransaction();
        
        return {
            success: true,
            wallet,
            transaction
        };
    } catch (error) {
        await session.abortTransaction();
        console.error('Error processing withdrawal:', error);
        throw error;
    } finally {
        session.endSession();
    }
};
