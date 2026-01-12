import CommissionTransaction from '../models/CommissionTransaction.js';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import { calculateCommissions } from '../config/commissionConfig.js';

class CommissionService {
  /**
   * Process commission for a sale
   * @param {Object} sale - The sale object
   * @param {string} sale.buyerId - ID of the user making the purchase
   * @param {number} sale.amount - Total sale amount
   * @param {string} sale.productId - ID of the product sold
   * @param {string} sale.orderId - ID of the order
   * @returns {Promise<Object>} - Object containing commission details
   */
  // static async processSaleCommission(sale) {
  //   try {
  //     const { buyerId, amount, productId, orderId } = sale;
      
  //     // Get buyer and their referrer information
  //     const buyer = await User.findById(buyerId).populate('referredBy');
  //     if (!buyer) {
  //       throw new Error('Buyer not found');
  //     }

  //     // Get direct referrer (level 1)
  //     const directReferrer = buyer.referredBy;
  //     let directCommission = null;
  //     let indirectCommission = null;

  //     // Calculate and process direct commission if referrer exists
  //     if (directReferrer) {
  //       const directSales = await this.getUserTotalSales(directReferrer._id);
  //       directCommission = calculateCommissions(amount, directSales, true);
        
  //       // Save direct commission transaction
  //       await this.createCommissionTransaction({
  //         userId: directReferrer._id,
  //         amount: directCommission.amount,
  //         rate: directCommission.rate,
  //         type: 'direct',
  //         orderId,
  //         productId,
  //         fromUser: buyerId,
  //         status: 'pending' // Will be marked as 'completed' after payment processing
  //       });

  //       // Update referrer's balance
  //       await User.findByIdAndUpdate(directReferrer._id, {
  //         $inc: { 
  //           'commissionBalance.pending': directCommission.amount,
  //           'stats.totalReferralEarnings': directCommission.amount
  //         }
  //       });

  //       // Get indirect referrer (level 2)
  //       const indirectReferrer = await User.findById(directReferrer.referredBy);
  //       if (indirectReferrer) {
  //         const indirectSales = await this.getUserTotalSales(indirectReferrer._id);
  //         indirectCommission = calculateCommissions(amount, indirectSales, false);
          
  //         // Save indirect commission transaction
  //         await this.createCommissionTransaction({
  //           userId: indirectReferrer._id,
  //           amount: indirectCommission.amount,
  //           rate: indirectCommission.rate,
  //           type: 'indirect',
  //           orderId,
  //           productId,
  //           fromUser: buyerId,
  //           status: 'pending'
  //         });

  //         // Update indirect referrer's balance
  //         await User.findByIdAndUpdate(indirectReferrer._id, {
  //           $inc: { 
  //             'commissionBalance.pending': indirectCommission.amount,
  //             'stats.totalReferralEarnings': indirectCommission.amount
  //           }
  //         });
  //       }
  //     }

  //     return {
  //       success: true,
  //       directCommission: directCommission ? {
  //         userId: directReferrer._id,
  //         amount: directCommission.amount,
  //         rate: directCommission.rate
  //       } : null,
  //       indirectCommission: indirectCommission ? {
  //         userId: indirectCommission.userId,
  //         amount: indirectCommission.amount,
  //         rate: indirectCommission.rate
  //       } : null
  //     };
  //   } catch (error) {
  //     console.error('Error processing commission:', error);
  //     throw new Error(`Commission processing failed: ${error.message}`);
  //   }
  // }


  // In commissionService.js, update the processSaleCommission method:

static async processSaleCommission(sale) {
    try {
        const { buyerId, amount, productId, orderId } = sale;
        
        // Get buyer and their referrer information
        const buyer = await User.findById(buyerId).populate('referredBy.user');
        if (!buyer) {
            throw new Error('Buyer not found');
        }

        // Get direct referrer (level 1)
        const directReferrer = buyer.referredBy?.user;
        let directCommission = null;
        let indirectCommission = null;

        // Calculate and process direct commission if referrer exists
        if (directReferrer) {
            const directSales = await this.getUserTotalSales(directReferrer._id);
            
            // Check if commission sharing is active (within 6 months of referral)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const isSharingPeriod = buyer.referredBy.date && 
                                  buyer.referredBy.date > sixMonthsAgo;

            // Calculate commission based on sharing period
            let commissionRate;
            if (isSharingPeriod) {
                // During sharing period: 5% for buyer, 5% for referrer
                commissionRate = 0.05; // 5% each
                
                // Process buyer's commission (5%)
                const buyerCommission = {
                    amount: amount * commissionRate,
                    rate: commissionRate * 100,
                    type: 'self_commission',
                    orderId,
                    productId,
                    status: 'pending'
                };
                
                await this.createCommissionTransaction({
                    ...buyerCommission,
                    userId: buyerId
                });
                
                // Update buyer's balance
                await User.findByIdAndUpdate(buyerId, {
                    $inc: { 
                        'commissionBalance.pending': buyerCommission.amount,
                        'stats.totalReferralEarnings': buyerCommission.amount
                    }
                });
            } else {
                // After sharing period: 10% for buyer
                commissionRate = 0.10; // 10% for buyer
            }

            // Process direct referrer's commission (5% during sharing period)
            directCommission = {
                amount: amount * 0.05, // 5% for referrer
                rate: 5,
                type: 'direct',
                orderId,
                productId,
                fromUser: buyerId,
                status: 'pending'
            };

            await this.createCommissionTransaction({
                ...directCommission,
                userId: directReferrer._id
            });

            // Update referrer's balance
            await User.findByIdAndUpdate(directReferrer._id, {
                $inc: { 
                    'commissionBalance.pending': directCommission.amount,
                    'stats.totalReferralEarnings': directCommission.amount
                }
            });

            // Get indirect referrer (level 2) - 5% of direct commission
            const indirectReferrer = await User.findById(directReferrer.referredBy?.user);
            if (indirectReferrer) {
                indirectCommission = {
                    amount: amount * 0.05, // 5% of sale amount
                    rate: 5,
                    type: 'indirect',
                    orderId,
                    productId,
                    fromUser: buyerId,
                    status: 'pending'
                };

                await this.createCommissionTransaction({
                    ...indirectCommission,
                    userId: indirectReferrer._id
                });

                // Update indirect referrer's balance
                await User.findByIdAndUpdate(indirectReferrer._id, {
                    $inc: { 
                        'commissionBalance.pending': indirectCommission.amount,
                        'stats.totalReferralEarnings': indirectCommission.amount
                    }
                });
            }
        }

        return {
            success: true,
            directCommission,
            indirectCommission,
            isSharingPeriod: buyer.referredBy?.date && 
                           (new Date() - buyer.referredBy.date) < (6 * 30 * 24 * 60 * 60 * 1000)
        };
    } catch (error) {
        console.error('Error processing commission:', error);
        throw new Error(`Commission processing failed: ${error.message}`);
    }
}

  /**
   * Get total sales amount for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Total sales amount
   */
  static async getUserTotalSales(userId) {
    const result = await CommissionTransaction.aggregate([
      {
        $match: { 
          userId: mongoose.Types.ObjectId(userId),
          type: 'direct',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Create a new commission transaction
   * @param {Object} transactionData - Transaction data
   * @returns {Promise<Object>} Created transaction
   */
  static async createCommissionTransaction(transactionData) {
    const transaction = new CommissionTransaction({
      ...transactionData,
      processedAt: new Date()
    });
    return await transaction.save();
  }

  /**
   * Get commission history for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of commission transactions
   */
  static async getCommissionHistory(userId, options = {}) {
    const { page = 1, limit = 10, type, status } = options;
    const skip = (page - 1) * limit;
    
    const query = { userId };
    if (type) query.type = type;
    if (status) query.status = status;
    
    return await CommissionTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('fromUser', 'name email')
      .populate('productId', 'name');
  }

  /**
   * Process marketer commission for completed order
   * @param {Object} data - Commission data
   * @returns {Promise<Object>} Processed commission result
   */
  static async processMarketerCommission(data) {
    try {
      const { orderId, marketerId, amount } = data;
      
      // Create commission transaction for marketer
      const commission = await this.createCommissionTransaction({
        userId: marketerId,
        amount,
        rate: 10, // Default marketer commission rate
        type: 'marketer',
        orderId,
        productId: null, // Marketer commission is on total order
        fromUser: null,
        status: 'completed'
      });

      // Update marketer's commission balance
      await User.findByIdAndUpdate(marketerId, {
        $inc: { 
          'commissionBalance.pending': amount,
          'stats.totalCommissionEarned': amount
        }
      });

      // Transfer to wallet immediately for marketers
      await Wallet.findOneAndUpdate(
        { userId: marketerId },
        {
          $inc: {
            availableBalance: amount,
            totalEarned: amount
          },
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );

      return {
        success: true,
        commission,
        amount
      };
    } catch (error) {
      console.error('Error processing marketer commission:', error);
      throw new Error(`Marketer commission processing failed: ${error.message}`);
    }
  }

  /**
   * Release commission to wallet when order is completed
   * @param {string} userId - User ID
   * @param {number} amount - Commission amount
   * @returns {Promise<Object>} Transfer result
   */
  static async releaseCommissionToWallet(userId, amount) {
    try {
      // Move from pending to available commission balance
      await User.findByIdAndUpdate(userId, {
        $inc: { 
          'commissionBalance.pending': -amount,
          'commissionBalance.available': amount
        }
      });

      // Transfer to wallet
      await Wallet.findOneAndUpdate(
        { userId },
        {
          $inc: {
            availableBalance: amount,
            totalEarned: amount
          },
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );

      return {
        success: true,
        amount,
        message: 'Commission released to wallet'
      };
    } catch (error) {
      console.error('Error releasing commission to wallet:', error);
      throw new Error(`Commission release failed: ${error.message}`);
    }
  }
}




export default CommissionService;
