import express from 'express';
import { body, param } from 'express-validator';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { generateToken, verifyToken } from '../middleware/auth.js';
import emailService from '../services/emailService.js';
import { 
    validateRegistration, 
    validateLogin, 
    validatePasswordUpdate,
    validateProfileUpdate,
    validateForgotPassword,
    validateResetPassword,
    handleValidationErrors,
    validatePasswordChange
} from '../config/validation.js';
import { authenticate, ROLES } from '../middleware/auth.js';
import { changePassword, updateProfile } from '../controllers/authController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Register new user
router.post('/register', validateRegistration, handleValidationErrors, async (req, res) => {
    console.log('=== NEW REGISTRATION REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

     const session = await User.startSession();
    session.startTransaction();
    
    try {
        const { email, password, firstName, lastName, phone, role = 'user', referralCode } = req.body;
        
        console.log('Validating request data...');
        if (!email || !password || !firstName || !lastName || !phone) {
            console.error('Missing required fields:', { 
                email: !!email, 
                password: !!password, 
                firstName: !!firstName, 
                lastName: !!lastName,
                phone: !!phone
            });
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
                required: { 
                    email: true, 
                    password: true, 
                    firstName: true, 
                    lastName: true,
                    phone: true 
                },
                received: { 
                    email: !!email, 
                    password: !!password, 
                    firstName: !!firstName, 
                    lastName: !!lastName,
                    phone: !!phone
                }
            });
        }

        // Check if user already exists
        console.log('Checking for existing user with email:', email);
        try {
            const existingUser = await User.findOne({ email }).exec();
            if (existingUser) {
                console.log('❌ Registration failed: User already exists', { 
                    email,
                    userId: existingUser._id,
                    createdAt: existingUser.createdAt 
                });
                return res.status(409).json({
                    success: false,
                    message: 'User with this email already exists',
                    error: 'EMAIL_EXISTS'
                });
            }
        } catch (dbError) {
            console.error('❌ Database error while checking for existing user:', {
                name: dbError.name,
                message: dbError.message,
                code: dbError.code,
                codeName: dbError.codeName,
                stack: dbError.stack
            });
            throw dbError;
        }


        // Find referring user if referral code is provided
        let referringUser = null;
        if (referralCode) {
            referringUser = await User.findOne({ 'affiliateInfo.affiliateCode': referralCode }).session(session);
            if (!referringUser) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    success: false,
                    message: 'Invalid referral code'
                });
            }
        }

        // Find an available marketer (affiliate with the least number of assigned users)
        const marketer = await User.findOne({ role: 'affiliate' })
            .sort({ 'affiliateInfo.assignedUsersCount': 1 })
            .select('_id')
            .session(session);

        // Create user data
        const userData = {
            email,
            password, // This will be hashed by the pre-save hook
            firstName,
            lastName,
            role,
            emailVerified: true,
            assignedMarketer: marketer?._id || null,
            profile: {
                phone: phone.trim()
            }
        };

        // Add referral info if applicable
        if (referringUser) {
            userData.referredBy = referringUser._id;
        }

        console.log('Creating new user:', { 
            email, 
            firstName, 
            lastName, 
            role,
            phone: phone.trim(),
            marketerAssigned: !!marketer,
            referredBy: referringUser?._id
        });

        const user = new User(userData);
        await user.save({ session });
        console.log('✅ User saved successfully:', { 
            userId: user._id,
            email: user.email,
            role: user.role
        });

        // Update marketer's assigned users count if a marketer was assigned
        if (marketer) {
            await User.updateOne(
                { _id: marketer._id },
                { $inc: { 'affiliateInfo.assignedUsersCount': 1 } },
                { session }
            );
        }

        // Update referring user's stats if applicable
        if (referringUser) {
            await User.findByIdAndUpdate(
                referringUser._id,
                { $inc: { 'stats.totalReferredUsers': 1 } },
                { session }
            );
        }

        await session.commitTransaction();
        session.endSession();

        // Generate JWT token
        console.log('Generating JWT token...');
        const token = generateToken(user._id, user.role);
        
        console.log('✅ Registration successful, sending response...');
        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role
                },
                token
            }
        });
    } catch (saveError) {
        console.error('❌ Error saving user:', {
            name: saveError.name,
            message: saveError.message,
            code: saveError.code,
            keyPattern: saveError.keyPattern,
            stack: saveError.stack
        });

        // Handle duplicate key error (unique constraint violation)
        if (saveError.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'A user with this email already exists',
                error: 'DUPLICATE_EMAIL',
                field: Object.keys(saveError.keyPattern)[0],
                value: saveError.keyValue.email
            });
        }

        // Handle validation errors
        if (saveError.name === 'ValidationError') {
            const errors = {};
            Object.keys(saveError.errors).forEach(key => {
                errors[key] = saveError.errors[key].message;
            });
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                error: 'VALIDATION_ERROR',
                errors
            });
        }

        // Default error response
        console.error('❌ Unhandled error in registration route:', {
            name: saveError.name,
            message: saveError.message,
            code: saveError.code,
            codeName: saveError.codeName,
            stack: saveError.stack,
            ...(saveError.keyPattern && { keyPattern: saveError.keyPattern }),
            ...(saveError.keyValue && { keyValue: saveError.keyValue }),
            ...(saveError.errors && { errors: saveError.errors })
        });
        
        // Prepare error response
        const errorResponse = {
            success: false,
            message: 'Internal server error during registration',
            error: 'INTERNAL_SERVER_ERROR'
        };
        
        // Add debug info in development
        if (process.env.NODE_ENV === 'development') {
            errorResponse.debug = {
                name: saveError.name,
                message: saveError.message,
                ...(saveError.code && { code: saveError.code }),
                ...(saveError.keyPattern && { keyPattern: saveError.keyPattern })
            };
        }
        
        res.status(500).json(errorResponse);
    } finally {
        console.log('=== REGISTRATION REQUEST COMPLETED ===\n');
    }
});

// User login - Only email login is allowed
router.post('/login', [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
], handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email only (phone login not allowed)
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id, user.role);

        // Generate referral link
        const baseUrl = process.env.FRONTEND_URL || 'https://epilux48.vercel.app';
        const referralLink = `${baseUrl}/register?ref=${user.referralCode}`;

        // Return user data without password
        const userResponse = {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            referralCode: user.referralCode,
            referralLink: referralLink,
            role: user.role,
            emailVerified: user.emailVerified,
            profile: user.profile,
            affiliateInfo: user.affiliateInfo,
            createdAt: user.createdAt
        };

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: userResponse
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during login'
        });
    }
});

// Admin login endpoint
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check for admin credentials in environment variables first
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        // If environment variables are set, use them for admin authentication
        if (adminEmail && adminPassword) {
            if (email === adminEmail && password === adminPassword) {
                // Create or find admin user
                let adminUser = await User.findOne({ email: adminEmail, role: 'admin' });
                
                if (!adminUser) {
                    // Create admin user if doesn't exist
                    adminUser = new User({
                        email: adminEmail,
                        password: adminPassword,
                        firstName: 'Admin',
                        lastName: 'User',
                        role: 'admin',
                        emailVerified: true
                    });
                    await adminUser.save();
                }

                // Update last login
                adminUser.lastLogin = new Date();
                await adminUser.save();

                // Generate token
                const token = generateToken(adminUser._id, adminUser.role);

                // Return admin user data without password
                const adminResponse = {
                    id: adminUser._id,
                    email: adminUser.email,
                    firstName: adminUser.firstName,
                    lastName: adminUser.lastName,
                    role: adminUser.role,
                    emailVerified: adminUser.emailVerified,
                    createdAt: adminUser.createdAt
                };

                return res.json({
                    success: true,
                    message: 'Admin login successful',
                    token,
                    user: adminResponse
                });
            }
        }

        // Fallback to database admin user if environment variables not set
        const adminUser = await User.findOne({ email, role: 'admin' });
        if (!adminUser) {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }

        // Check password
        const isPasswordValid = await adminUser.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }

        // Update last login
        adminUser.lastLogin = new Date();
        await adminUser.save();

        // Generate token
        const token = generateToken(adminUser._id, adminUser.role);

        // Return admin user data without password
        const adminResponse = {
            id: adminUser._id,
            email: adminUser.email,
            firstName: adminUser.firstName,
            lastName: adminUser.lastName,
            role: adminUser.role,
            emailVerified: adminUser.emailVerified,
            createdAt: adminUser.createdAt
        };

        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            user: adminResponse
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during admin login'
        });
    }
});

// Get current user profile
router.get('/profile', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = verifyToken(token);
        
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Convert user to object and add referral link
        const userObj = user.toObject();
        const baseUrl = process.env.FRONTEND_URL || 'https://epilux48.vercel.app';
        userObj.referralLink = `${baseUrl}/register?ref=${user.referralCode}`;
        
        res.json({
            success: true,
            data: {
                ...userObj,
                referralLink: userObj.referralLink
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
});

// Update user profile
router.put('/api/auth/profile', validateProfileUpdate, handleValidationErrors, async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = verifyToken(token);
        
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update user fields
        const allowedUpdates = ['firstName', 'lastName', 'phone', 'profile'];
        const updates = {};

        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key) || key.startsWith('profile.')) {
                updates[key] = req.body[key];
            }
        });

        Object.assign(user, updates);
        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                emailVerified: user.emailVerified,
                profile: user.profile,
                affiliateInfo: user.affiliateInfo,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during profile update'
        });
    }
});

// Change password
router.put('/api/auth/password', validatePasswordUpdate, handleValidationErrors, async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = verifyToken(token);
        
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const { currentPassword, newPassword } = req.body;

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during password change',
            error: error.message
        });
    }
});

// Logout (client-side token invalidation)
router.post('/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logout successful'
    });
});

// Verify email (placeholder - implement email verification logic)
router.post('/verify-email', async (req, res) => {
    try {
        // const { token } = req.body; // Token is not used in this placeholder implementation
        
        // This is a placeholder implementation
        // In a real application, you would:
        // 1. Verify the email verification token
        // 2. Update the user's emailVerified status
        // 3. Send a success response
        
        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during email verification'
        });
    }
});

// Forgot password - send reset email
router.post('/forgot-password', validateForgotPassword, handleValidationErrors, async (req, res) => {
    try {
        const { email } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal that user doesn't exist for security reasons
            return res.json({
                success: true,
                message: 'If an account with that email exists, we sent a password reset link.'
            });
        }

        // Create password reset token
        const resetToken = await PasswordResetToken.createToken(user._id);

        // Send password reset email
        try {
            await emailService.sendPasswordResetEmail(user, resetToken);
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            return res.status(500).json({
                success: false,
                message: 'Failed to send password reset email. Please try again.'
            });
        }

        res.json({
            success: true,
            message: 'If an account with that email exists, we sent a password reset link.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during password reset request'
        });
    }
});

// Reset password - verify token and update password
router.post('/reset-password', validateResetPassword, handleValidationErrors, async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        // Find valid reset token
        const resetToken = await PasswordResetToken.findValidToken(token);
        if (!resetToken) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token. Please request a new password reset.'
            });
        }

        const user = resetToken.userId;

        // Update user password
        user.password = newPassword;
        await user.save();

        // Mark token as used
        await PasswordResetToken.markAsUsed(token);

        res.json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during password reset'
        });
    }
});


// Admin create user
router.post('/admin/users', authenticate, [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('firstName')
        .notEmpty().withMessage('First name is required')
        .trim()
        .isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    body('lastName')
        .notEmpty().withMessage('Last name is required')
        .trim()
        .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    body('phone')
        .notEmpty().withMessage('Phone number is required')
        .trim()
        .matches(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/)
        .withMessage('Please provide a valid phone number'),
    body('role')
        .optional()
        .isIn(['user', 'admin', 'affiliate', 'marketer'])
        .withMessage('Invalid role specified')
], handleValidationErrors, async (req, res) => {
    // Check if user is admin
    if (req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.'
        });
    }

    const session = await User.startSession();
    session.startTransaction();
    
    try {
        const { email, password, firstName, lastName, phone, role = 'user' } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email }).session(session);
        if (existingUser) {
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({
                success: false,
                message: 'A user with this email already exists',
                error: 'DUPLICATE_EMAIL'
            });
        }

        // Create new user
        const user = new User({
            email,
            password,
            firstName,
            lastName,
            role,
            emailVerified: true,
            profile: {
                phone: phone.trim()
            }
        });

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        // Don't include sensitive data in response
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.__v;

        return res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: userResponse
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('❌ Error in admin user creation:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });

        const statusCode = error.name === 'ValidationError' ? 400 : 500;
        const response = {
            success: false,
            message: error.message || 'Error creating user',
            error: error.name || 'INTERNAL_SERVER_ERROR'
        };

        if (process.env.NODE_ENV === 'development') {
            response.debug = {
                name: error.name,
                message: error.message,
                ...(error.code && { code: error.code })
            };
        }

        return res.status(statusCode).json(response);
    }
});

// Admin update user role
router.patch('/admin/users/:userId/role', authenticate, [
    param('userId')
        .notEmpty().withMessage('User ID is required')
        .isMongoId().withMessage('Invalid user ID format'),
    body('role')
        .notEmpty().withMessage('Role is required')
        .isIn(['user', 'admin', 'affiliate', 'marketer'])
        .withMessage('Invalid role. Must be one of: user, admin, affiliate, marketer')
], handleValidationErrors, async (req, res) => {
    // Check if user is admin
    if (req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.'
        });
    }

    const session = await User.startSession();
    session.startTransaction();
    
    try {
        const { userId } = req.params;
        const { role } = req.body;
        
        // Check if user exists
        const user = await User.findById(userId).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'User not found',
                error: 'USER_NOT_FOUND'
            });
        }

        // Prevent admin from changing their own role
        if (user._id.toString() === req.user._id.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own role',
                error: 'SELF_ROLE_CHANGE_NOT_ALLOWED'
            });
        }

        // Update user role
        user.role = role;
        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        // Prepare response without sensitive data
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.__v;

        return res.json({
            success: true,
            message: 'User role updated successfully',
            data: userResponse
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('❌ Error updating user role:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });

        const statusCode = error.name === 'ValidationError' ? 400 : 500;
        const response = {
            success: false,
            message: error.message || 'Error updating user role',
            error: error.name || 'INTERNAL_SERVER_ERROR'
        };

        if (process.env.NODE_ENV === 'development') {
            response.debug = {
                name: error.name,
                message: error.message,
                ...(error.code && { code: error.code })
            };
        }

        return res.status(statusCode).json(response);
    }
});

// User routes
router.put('/change-password', authenticate, validatePasswordChange, handleValidationErrors, changePassword);
router.put('/profile', authenticate, upload.single('avatar'), validateProfileUpdate, handleValidationErrors, updateProfile);

// Export the router as default
export default router;
