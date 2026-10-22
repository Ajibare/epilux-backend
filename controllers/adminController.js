
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import AffiliateCommission from '../models/AffiliateCommission.js';
import CommissionRate from '../models/CommissionRate.js';
import AffiliateWithdrawal from '../models/AffiliateWithdrawal.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Wallet from '../models/Wallet.js';

// Roles an admin may give from the panel. Everyone who shops is a customer
// ('user'); customers who refer friends earn from them without a separate role.
// New admins are never created or promoted through the API.
const ASSIGNABLE_ROLES = ['user', 'marketer'];

// A "referrer" (affiliate) is any customer who has brought in at least one friend
const REFERRER_QUERY = { 'referrals.0': { $exists: true }, role: { $in: ['user', 'affiliate'] } };
import SeasonalPromoService from '../services/seasonalPromoService.js';
import MarketerService from '../services/marketerService.js';
import { processWithdrawal } from './walletController.js';

/**
 * Assign (or reassign) a paid order to a marketer.
 * Body: { marketerId } — omit it to pick the least busy marketer automatically.
 * @route PUT /api/admin/orders/:id/assign
 */
export const assignOrderToMarketer = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (!order.isPaid) {
      return res.status(400).json({ success: false, message: 'Only paid orders can be assigned for delivery' });
    }
    if (!['pending', 'processing', 'assigned', 'in_transit'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `A ${order.status} order cannot be reassigned` });
    }

    const { marketerId } = req.body || {};
    if (marketerId) {
      const marketer = await User.findOne({ _id: marketerId, role: 'marketer', suspended: { $ne: true } });
      if (!marketer) {
        return res.status(404).json({ success: false, message: 'Marketer not found or unavailable' });
      }
      if (order.marketer && String(order.marketer) === String(marketerId)) {
        return res.json({ success: true, message: 'Order is already assigned to this marketer', data: order });
      }
    }

    if (order.marketer) {
      await MarketerService.unassignOrder(order, 'Reassigned by admin');
    }

    const updated = marketerId
      ? await MarketerService.assignOrderTo(order._id, marketerId, 'Assigned by admin')
      : await MarketerService.assignOrder(order._id);

    if (!updated) {
      return res.status(409).json({ success: false, message: 'Order could not be assigned. Please refresh and try again.' });
    }

    const populated = await Order.findById(updated._id).populate('marketer', 'firstName lastName email profile.phone');
    res.json({ success: true, message: 'Order assigned', data: populated });
  } catch (error) {
    console.error('Assign order error:', error);
    res.status(error.message === 'No available marketers to assign' ? 409 : 500).json({
      success: false,
      message: error.message === 'No available marketers to assign' ? 'No marketers are available right now' : 'Error assigning order'
    });
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Calculate customer retention rate
 */
const calculateCustomerRetention = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const [returningCustomers, totalCustomers] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo },
            status: 'completed'
          }
        },
        {
          $lookup: {
            from: 'orders',
            let: { customerId: '$userId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$userId', '$$customerId'] },
                      { $lt: ['$createdAt', thirtyDaysAgo] },
                      { $gte: ['$createdAt', sixtyDaysAgo] },
                      { $eq: ['$status', 'completed'] }
                    ]
                  }
                }
              }
            ],
            as: 'previousOrders'
          }
        },
        {
          $match: {
            'previousOrders.0': { $exists: true }
          }
        },
        {
          $group: {
            _id: '$userId'
          }
        },
        {
          $count: 'count'
        }
      ]),
      Order.distinct('userId', {
        createdAt: { $lt: thirtyDaysAgo, $gte: sixtyDaysAgo },
        status: 'completed'
      }).then(users => users.length)
    ]);

    const retentionRate = totalCustomers > 0 
      ? ((returningCustomers[0]?.count || 0) / totalCustomers * 100).toFixed(2)
      : 0;

    return {
      rate: parseFloat(retentionRate),
      returningCustomers: returningCustomers[0]?.count || 0,
      totalCustomers
    };
  } catch (error) {
    console.error('Error calculating customer retention:', error);
    return { rate: 0, returningCustomers: 0, totalCustomers: 0 };
  }
};

/**
 * Get top selling products
 */
const getTopSellingProducts = async (limit = 5) => {
  try {
    return await Order.aggregate([
      { $unwind: '$items' },
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          totalSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          name: 1,
          totalSold: 1,
          totalRevenue: 1,
          image: '$product.images[0]',
          category: '$product.category',
          stock: '$product.stock'
        }
      }
    ]);
  } catch (error) {
    console.error('Error getting top selling products:', error);
    return [];
  }
};

/**
 * Get sales trend data
 */
const getSalesTrend = async (days = 30) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
  } catch (error) {
    console.error('Error getting sales trend:', error);
    return [];
  }
};

/**
 * Get user acquisition data
 */
const getUserAcquisition = async (days = 90) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
  } catch (error) {
    console.error('Error getting user acquisition data:', error);
    return [];
  }
};

/**
 * Get recent orders for activity feed
 */
const getRecentOrders = async (limit = 5) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'firstName lastName email')
      .populate('buyer', 'firstName lastName email')
      .lean();
      
    return orders.map(order => ({
      type: 'order',
      id: order._id,
      status: order.status,
      amount: order.totalAmount,
      customer: order.userId || order.buyer,
      timestamp: order.createdAt,
      message: `New ${order.status} order for $${order.totalAmount.toFixed(2)}`
    }));
  } catch (error) {
    console.error('Error getting recent orders:', error);
    return [];
  }
};

/**
 * Get recent user signups
 */
const getRecentSignups = async (limit = 5) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('firstName lastName email createdAt')
      .lean();
      
    return users.map(user => ({
      type: 'signup',
      id: user._id,
      user: {
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email
      },
      timestamp: user.createdAt,
      message: `New user signup: ${user.firstName} ${user.lastName}`
    }));
  } catch (error) {
    console.error('Error getting recent signups:', error);
    return [];
  }
};

// ===== SEASONAL PROMOTION FUNCTIONS =====

/**
 * Create or update a seasonal promotion
 */
const createUpdateSeasonalPromo = async (req, res) => {
    try {
        const { name, startDate, endDate, commissionRate, isActive } = req.body;
        
        // Validate dates
        if (new Date(startDate) >= new Date(endDate)) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Check for date conflicts
        const existingPromo = SeasonalPromoService.seasonalPromotions.find(promo => 
            (new Date(startDate) <= new Date(promo.endDate) && 
             new Date(endDate) >= new Date(promo.startDate) &&
             promo.name !== name) // Allow updating same promotion
        );

        if (existingPromo) {
            return res.status(400).json({
                success: false,
                message: `Date range conflicts with existing promotion: ${existingPromo.name}`
            });
        }

        // Update or add promotion
        const promoIndex = SeasonalPromoService.seasonalPromotions.findIndex(p => p.name === name);
        
        const promoData = {
            name,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            commissionRate: Number(commissionRate),
            isActive: Boolean(isActive)
        };

        if (promoIndex >= 0) {
            SeasonalPromoService.seasonalPromotions[promoIndex] = promoData;
        } else {
            SeasonalPromoService.seasonalPromotions.push(promoData);
        }

        res.status(200).json({
            success: true,
            data: promoData
        });
    } catch (error) {
        console.error('Error creating/updating seasonal promo:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating/updating seasonal promotion'
        });
    }
};

/**
 * Get all seasonal promotions
 */
const getSeasonalPromos = (req, res) => {
    try {
        res.status(200).json({
            success: true,
            data: SeasonalPromoService.seasonalPromotions
        });
    } catch (error) {
        console.error('Error getting seasonal promos:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching seasonal promotions'
        });
    }
};

/**
 * Delete a seasonal promotion
 */
const deleteSeasonalPromo = (req, res) => {
    try {
        const { name } = req.params;
        const initialLength = SeasonalPromoService.seasonalPromotions.length;
        
        SeasonalPromoService.seasonalPromotions = 
            SeasonalPromoService.seasonalPromotions.filter(promo => promo.name !== name);
        
        if (SeasonalPromoService.seasonalPromotions.length === initialLength) {
            return res.status(404).json({
                success: false,
                message: 'Promotion not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Promotion deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting seasonal promo:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting seasonal promotion'
        });
    }
};


const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Current period data
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      monthlyRevenue,
      pendingOrders,
      completedOrders,
      lowStockProducts,
      activeAffiliates,
      // Previous period data for comparison
      lastMonthOrders,
      lastMonthRevenue,
      lastMonthAffiliates,
      lastMonthPendingOrders
    ] = await Promise.all([
      // Current period
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: currentMonthStart }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'completed' }),
      // Updated to use the new stock field
      Product.countDocuments({ stock: { $lt: 10 } }),
      User.countDocuments(REFERRER_QUERY),
      
      // Previous period data
      Order.countDocuments({ 
        createdAt: { 
          $gte: lastMonthStart,
          $lt: currentMonthStart
        }
      }),
      Order.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { 
              $gte: lastMonthStart,
              $lt: currentMonthStart
            }
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      User.countDocuments({ ...REFERRER_QUERY, 'referrals.date': { $lt: currentMonthStart } }),
      Order.countDocuments({ 
        status: 'pending',
        createdAt: { 
          $gte: lastMonthStart,
          $lt: currentMonthStart
        }
      })
    ]);

    // Calculate percentage changes
    const calculateChange = (current, previous) => {
      if (!previous || previous === 0) return 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // What needs the admin's attention right now
    const [paidRevenueAgg, unassignedPaidOrders, inDelivery, awaitingConfirmation, pendingWithdrawalAgg, roleCounts] = await Promise.all([
      Order.aggregate([
        { $match: { isPaid: true, status: { $nin: ['cancelled', 'rejected'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Order.countDocuments({ isPaid: true, marketer: null, status: { $in: ['pending', 'processing'] } }),
      Order.countDocuments({ status: { $in: ['assigned', 'in_transit'] } }),
      Order.countDocuments({ status: 'delivered' }),
      WalletTransaction.aggregate([
        { $match: { type: 'withdrawal', status: 'pending' } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $abs: '$amount' } } } }
      ]),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }])
    ]);

    // Get additional data in parallel
    const [recentUsers, recentActivities] = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('-password')
        .lean(),
      // Simplified to just get recent orders
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'firstName lastName email')
        .populate('buyer', 'firstName lastName email')
        .lean()
    ]);

    // Extract values from aggregations
    const currentRevenue = totalRevenue[0]?.total || 0;
    const currentMonthlyRevenue = monthlyRevenue[0]?.total || 0;
    const lastMonthRev = lastMonthRevenue[0]?.total || 0;

    // Prepare response
    const stats = {
      overview: {
        // Main metrics
        totalOrders,
        totalRevenue: currentRevenue,
        monthlyRevenue: currentMonthlyRevenue,
        pendingOrders,
        completedOrders,
        totalUsers,
        totalProducts,
        lowStockProducts,
        activeAffiliates,

        // Money actually received (paid orders that weren't cancelled)
        paidRevenue: paidRevenueAgg[0]?.total || 0,
        paidOrders: paidRevenueAgg[0]?.count || 0,
        unassignedPaidOrders,
        inDelivery,
        awaitingConfirmation,
        pendingWithdrawals: {
          count: pendingWithdrawalAgg[0]?.count || 0,
          amount: pendingWithdrawalAgg[0]?.amount || 0
        },
        usersByRole: Object.fromEntries(roleCounts.map((r) => [r._id || 'user', r.count])),

        // Percentage changes
        changes: {
          totalOrders: calculateChange(totalOrders, lastMonthOrders),
          totalRevenue: calculateChange(currentRevenue, lastMonthRev),
          pendingOrders: calculateChange(pendingOrders, lastMonthPendingOrders),
          activeAffiliates: calculateChange(activeAffiliates, lastMonthAffiliates)
        }
      },
      recent: {
        users: recentUsers,
        activity: recentActivities
      }
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

/**
 * Get a single user by ID
 */
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

/**
 * Get all users with pagination and filters
 */
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '' } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

/**
 * Update user details
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, role, isActive } = req.body;

    // Check if user is trying to update their own role
    if (id === req.user._id.toString() && role && role !== req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Cannot change your own role',
        error: 'SELF_ROLE_CHANGE_NOT_ALLOWED'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent non-admins from changing roles
    if (role && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required to change roles.',
        error: 'ROLE_CHANGE_ADMIN_ONLY'
      });
    }

    // Prevent admins from changing other admins' roles
    if (role && user.role === 'admin' && req.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot change another admin user\'s role',
        error: 'ADMIN_ROLE_CHANGE_NOT_ALLOWED'
      });
    }

    // Update user fields
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    if (email && email.toLowerCase().trim() !== user.email) {
      const taken = await User.exists({ email: email.toLowerCase().trim(), _id: { $ne: user._id } });
      if (taken) {
        return res.status(409).json({ success: false, message: 'Another account already uses this email' });
      }
      user.email = email.toLowerCase().trim();
    }
    if (role && role !== user.role) {
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`
        });
      }
      user.role = role;
      user.$locals.allowRoleChange = true; // admin-only endpoint, checks above
    }
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      data: userResponse
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

/**
 * Delete user
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deletion of admin users
    const user = await User.findById(id);
    if (user && user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin users'
      });
    }

    // Don't delete an account that still has money or deliveries attached
    if (user) {
      const [wallet, openOrders] = await Promise.all([
        Wallet.findOne({ userId: user._id }).lean(),
        Order.countDocuments({
          $or: [{ userId: user._id }, { buyer: user._id }, { marketer: user._id }],
          isPaid: true,
          status: { $in: ['pending', 'processing', 'assigned', 'in_transit', 'delivered'] }
        })
      ]);
      if ((wallet?.availableBalance || 0) > 0 || (wallet?.lockedAmount || 0) > 0) {
        return res.status(400).json({ success: false, message: 'This account still has a wallet balance or a pending withdrawal. Settle it first, or suspend the account instead.' });
      }
      if (openOrders > 0) {
        return res.status(400).json({ success: false, message: `This account has ${openOrders} paid order${openOrders === 1 ? '' : 's'} in progress. Finish or reassign them first, or suspend the account instead.` });
      }
    }

    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

/**
 * Get recent affiliate activity
 */
const getRecentAffiliateActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const [commissions, withdrawals] = await Promise.all([
      AffiliateCommission.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('affiliate', 'firstName lastName email')
        .populate('order', 'totalAmount'),
      AffiliateWithdrawal.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('affiliate', 'firstName lastName email')
    ]);

    const activities = [
      ...commissions.map(commission => ({
        type: 'commission',
        id: commission._id,
        amount: commission.amount,
        status: commission.status,
        createdAt: commission.createdAt,
        affiliate: commission.affiliate,
        order: commission.order
      })),
      ...withdrawals.map(withdrawal => ({
        type: 'withdrawal',
        id: withdrawal._id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        paymentMethod: withdrawal.paymentMethod,
        createdAt: withdrawal.createdAt,
        affiliate: withdrawal.affiliate
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

    res.status(200).json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error getting recent affiliate activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent affiliate activity',
      error: error.message
    });
  }
};

// Referrers ("affiliates"): customers who have referred at least one friend
const getAffiliates = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const query = { ...REFERRER_QUERY };

    const [affiliates, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: affiliates,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page)
    });
  } catch (error) {
    console.error('Error fetching affiliates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching affiliates'
    });
  }
};

const getAffiliate = async (req, res) => {
  try {
    const affiliate = await User.findById(req.params.id).select('-password');

    if (!affiliate || !['user', 'affiliate'].includes(affiliate.role)) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    res.json({
      success: true,
      data: affiliate
    });
  } catch (error) {
    console.error('Error fetching affiliate:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching affiliate'
    });
  }
};

const updateAffiliateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['active', 'suspended', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: active, suspended, pending'
      });
    }

    const affiliate = await User.findByIdAndUpdate(
      req.params.id,
      { affiliateStatus: status },
      { new: true }
    ).select('-password');

    if (!affiliate || !['user', 'affiliate'].includes(affiliate.role)) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    res.json({
      success: true,
      data: affiliate
    });
  } catch (error) {
    console.error('Error updating affiliate status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating affiliate status'
    });
  }
};

const getAffiliateCommissions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { affiliate: req.params.id };
    
    if (status) {
      query.status = status;
    }

    const [commissions, total] = await Promise.all([
      AffiliateCommission.find(query)
        .populate('order', 'orderNumber totalAmount')
        .populate('referredUser', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      AffiliateCommission.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: commissions,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page)
    });
  } catch (error) {
    console.error('Error fetching affiliate commissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching affiliate commissions'
    });
  }
};

const createCommission = async (req, res) => {
  try {
    const { order, referredUser, amount, note } = req.body;
    
    const commission = new AffiliateCommission({
      affiliate: req.params.id,
      order,
      referredUser,
      amount,
      status: 'pending',
      note
    });

    await commission.save();

    res.status(201).json({
      success: true,
      data: commission
    });
  } catch (error) {
    console.error('Error creating commission:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating commission'
    });
  }
};

const updateCommissionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, approved, rejected, paid'
      });
    }

    const commission = await AffiliateCommission.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
    .populate('affiliate', 'firstName lastName email')
    .populate('order', 'orderNumber totalAmount');

    if (!commission) {
      return res.status(404).json({
        success: false,
        message: 'Commission not found'
      });
    }

    res.json({
      success: true,
      data: commission
    });
  } catch (error) {
    console.error('Error updating commission status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating commission status'
    });
  }
};

// Withdrawals are wallet ledger entries (type 'withdrawal'); this is the same
// data customers create through POST /api/wallet/withdraw.
const WITHDRAWAL_STATUS_LABELS = { pending: 'pending', completed: 'paid', cancelled: 'rejected', failed: 'rejected' };

const formatWithdrawal = (tx) => ({
  _id: tx._id,
  id: tx._id,
  reference: tx.reference,
  amount: Math.abs(tx.amount),
  status: WITHDRAWAL_STATUS_LABELS[tx.status] || tx.status,
  user: tx.userId && typeof tx.userId === 'object' ? {
    _id: tx.userId._id,
    firstName: tx.userId.firstName,
    lastName: tx.userId.lastName,
    email: tx.userId.email,
    phone: tx.userId.profile?.phone
  } : null,
  bankName: tx.metadata?.bankDetails?.bankName,
  accountNumber: tx.metadata?.bankDetails?.accountNumber,
  accountName: tx.metadata?.bankDetails?.accountName,
  adminNote: tx.metadata?.adminNote,
  requestedAt: tx.createdAt,
  processedAt: tx.metadata?.processedAt,
  createdAt: tx.createdAt
});

const getWithdrawals = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const query = { type: 'withdrawal' };

    const statusMap = { pending: 'pending', paid: 'completed', completed: 'completed', approved: 'completed', rejected: 'cancelled', cancelled: 'cancelled' };
    if (req.query.status && statusMap[req.query.status]) {
      query.status = statusMap[req.query.status];
    }

    const [withdrawals, total, totals] = await Promise.all([
      WalletTransaction.find(query)
        .populate('userId', 'firstName lastName email profile.phone')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit),
      WalletTransaction.countDocuments(query),
      WalletTransaction.aggregate([
        { $match: { type: 'withdrawal' } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: { $abs: '$amount' } } } }
      ])
    ]);

    const summary = Object.fromEntries(
      ['pending', 'completed', 'cancelled'].map((s) => {
        const row = totals.find((t) => t._id === s);
        return [WITHDRAWAL_STATUS_LABELS[s], { count: row?.count || 0, amount: row?.amount || 0 }];
      })
    );

    res.json({
      success: true,
      data: withdrawals.map(formatWithdrawal),
      summary,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching withdrawals'
    });
  }
};

// Mark a withdrawal as paid (funds sent to the bank) or reject it (funds
// return to the customer's wallet)
const updateWithdrawalStatus = async (req, res) => {
  try {
    const { status, note } = req.body;

    if (!['approved', 'paid', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be paid or rejected'
      });
    }

    const { transaction } = await processWithdrawal(req.params.id, status, req.user.id, note);
    await transaction.populate('userId', 'firstName lastName email profile.phone');

    res.json({
      success: true,
      message: transaction.status === 'completed' ? 'Withdrawal marked as paid' : 'Withdrawal rejected and refunded to the wallet',
      data: formatWithdrawal(transaction)
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error('Error updating withdrawal status:', error);
    res.status(statusCode).json({
      success: false,
      message: statusCode >= 500 ? 'Error updating withdrawal status' : error.message
    });
  }
};

const getSettings = async (req, res) => {
  try {
    // In a real app, you would get these from a settings model or config
    const settings = {
      commissionRate: 0.1, // 10% default commission
      minWithdrawal: 50,
      paymentMethods: ['bank_transfer', 'paypal', 'crypto'],
      currency: 'USD',
      // Add more settings as needed
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings'
    });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { commissionRate, minWithdrawal, paymentMethods, currency } = req.body;
    
    // In a real app, you would save these to a settings model or config
    const updatedSettings = {
      commissionRate: commissionRate || 0.1,
      minWithdrawal: minWithdrawal || 50,
      paymentMethods: paymentMethods || ['bank_transfer', 'paypal', 'crypto'],
      currency: currency || 'USD',
      updatedAt: new Date()
    };

    // Here you would typically save to database
    // await Settings.findOneAndUpdate({}, updatedSettings, { upsert: true, new: true });

    res.json({
      success: true,
      data: updatedSettings,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
      error: error.message
    });
  }
};

// Suspend/Unsuspend a user
const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { suspended, reason = '' } = req.body;

    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Suspended status is required and must be a boolean' });
    }
    if (id === String(req.user._id || req.user.id)) {
      return res.status(400).json({ success: false, message: "You can't suspend your own account" });
    }
    const target = await User.findById(id).select('role');
    if (target?.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin accounts cannot be suspended' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { 
        suspended,
        suspensionReason: suspended ? reason : undefined
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: `User has been ${suspended ? 'suspended' : 'unsuspended'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Error updating user suspension status:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Create a new user (admin only)
const createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role = 'user', phone, address } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        required: { email: true, password: true, firstName: true, lastName: true },
        received: { email: !!email, password: !!password, firstName: !!firstName, lastName: !!lastName }
      });
    }

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
        error: 'EMAIL_EXISTS'
      });
    }

    // The User model's pre-save hook hashes the password; hashing it here as
    // well would make the account impossible to log in to.
    const newUser = new User({
      email: String(email).toLowerCase().trim(),
      password,
      firstName,
      lastName,
      role,
      emailVerified: true, // Admin-created users are auto-verified
      profile: {
        phone,
        address
      }
    });

    if (role !== 'user') newUser.$locals.allowRoleChange = true; // admin-only endpoint, role checked above
    await newUser.save();

    // Return user data without password
    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update user role (admin only)
 */
export const updateUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        const { id } = req.params;
        
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required to change roles.',
                error: 'ROLE_CHANGE_ADMIN_ONLY'
            });
        }

        // Prevent admin from changing their own role
        if (id === req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Cannot change your own role',
                error: 'SELF_ROLE_CHANGE_NOT_ALLOWED'
            });
        }
        
        if (!ASSIGNABLE_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent admins from changing other admins' roles
        if (user.role === 'admin' && req.user.role === 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot change another admin user\'s role',
                error: 'ADMIN_ROLE_CHANGE_NOT_ALLOWED'
            });
        }

        user.role = role;
        user.$locals.allowRoleChange = true; // admin-only endpoint, checks above
        await user.save();

        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.__v;

        res.status(200).json({
            success: true,
            message: 'User role updated successfully',
            data: userResponse
        });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user role',
            error: error.message
        });
    }
};

// Commission Rate Management
const getCommissionRates = async (req, res) => {
  try {
    const rates = await CommissionRate.findOne({}).populate('userRates.user', 'name email');
    res.json({
      success: true,
      data: rates || { defaultRate: 10, userRates: [] }
    });
  } catch (error) {
    console.error('Error fetching commission rates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching commission rates'
    });
  }
};

const createUpdateCommissionRate = async (req, res) => {
  try {
    const { rate, excludedRoles, startDay, endDay } = req.body;
    
    const numericRate = Number(rate);
    if (rate === undefined || !Number.isFinite(numericRate) || numericRate < 0 || numericRate > 100) {
      return res.status(400).json({
        success: false,
        message: 'Commission rate must be a number between 0 and 100'
      });
    }
    const isDay = (d) => d === undefined || (Number.isInteger(Number(d)) && Number(d) >= 1 && Number(d) <= 31);
    if (!isDay(startDay) || !isDay(endDay) || (startDay !== undefined && endDay !== undefined && Number(startDay) > Number(endDay))) {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal days must be between 1 and 31, and the start day cannot be after the end day'
      });
    }

    // Update or create commission rate document
    const updateData = {
      commissionRate: numericRate,
      updatedBy: req.user.id
    };

    // Add optional fields if provided
    if (excludedRoles && Array.isArray(excludedRoles)) {
      updateData.excludedRoles = excludedRoles;
    }

    if (startDay !== undefined || endDay !== undefined) {
      updateData.withdrawalWindow = {
        startDay: startDay !== undefined ? Number(startDay) : 26, // Default start day
        endDay: endDay !== undefined ? Number(endDay) : 30       // Default end day
      };
    }

    const updated = await CommissionRate.findOneAndUpdate(
      {},
      updateData,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating commission rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating commission rate',
      error: error.message
    });
  }
}



export {
    // Seasonal Promotions
    createUpdateSeasonalPromo,
    getSeasonalPromos,
    deleteSeasonalPromo,
    
    // Existing exports
    getDashboardStats,
    getUser,
    getUsers,
    updateUser,
    deleteUser,
    suspendUser,
    createUser,
    getRecentAffiliateActivity,
    getAffiliates,
    getAffiliate,
    updateAffiliateStatus,
    getAffiliateCommissions,
    createCommission,
    updateCommissionStatus,
    getWithdrawals,
    updateWithdrawalStatus,
    getSettings,
    updateSettings,
    
    // Commission Rates
    getCommissionRates,
    createUpdateCommissionRate
};