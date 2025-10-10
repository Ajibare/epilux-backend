import express from 'express';
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
import { authenticate } from '../middleware/auth.js';
import { changePassword, updateProfile } from '../controllers/authController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Register new user
router.post('/register', validateRegistration, handleValidationErrors, async (req, res) => {
    console.log('=== NEW REGISTRATION REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { email, password, firstName, lastName, role = 'user' } = req.body;
        
        console.log('Validating request data...');
        if (!email || !password || !firstName || !lastName) {
            console.error('Missing required fields:', { email: !!email, password: !!password, firstName: !!firstName, lastName: !!lastName });
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
                required: { email: true, password: true, firstName: true, lastName: true },
                received: { email: !!email, password: !!password, firstName: !!firstName, lastName: !!lastName }
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

        // Create new user
        console.log('Creating new user:', { 
            email, 
            firstName, 
            lastName, 
            role,
            emailVerified: true
        });
        
        const user = new User({
            email,
            password, // This will be hashed by the pre-save hook
            firstName,
            lastName,
            role,
            emailVerified: true
        });
        
        console.log('User object created, attempting to save...');

        try {
            console.log('Saving user to database...');
            await user.save();
            console.log('✅ User saved successfully:', { 
                userId: user._id,
                email: user.email,
                role: user.role
            });

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
                codeName: saveError.codeName,
                keyPattern: saveError.keyPattern,
                keyValue: saveError.keyValue,
                errors: saveError.errors,
                stack: saveError.stack
            });
            
            if (saveError.name === 'ValidationError') {
                const errors = Object.values(saveError.errors).map(err => ({
                    field: err.path,
                    message: err.message,
                    type: err.kind
                }));
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    error: 'VALIDATION_ERROR',
                    errors
                });
            }
            
            if (saveError.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: 'A user with this email already exists',
                    error: 'DUPLICATE_EMAIL',
                    field: Object.keys(saveError.keyPattern)[0],
                    value: saveError.keyValue.email
                });
            }
            
            throw saveError; // Let the global error handler catch this
        }
    } catch (error) {
        console.error('❌ Unhandled error in registration route:', {
            name: error.name,
            message: error.message,
            code: error.code,
            codeName: error.codeName,
            stack: error.stack,
            ...(error.keyPattern && { keyPattern: error.keyPattern }),
            ...(error.keyValue && { keyValue: error.keyValue }),
            ...(error.errors && { errors: error.errors })
        });
        
        // Default error response
        const errorResponse = {
            success: false,
            message: 'Internal server error during registration',
            error: 'INTERNAL_SERVER_ERROR'
        };
        
        // Add more details in development
        if (process.env.NODE_ENV === 'development') {
            errorResponse.debug = {
                name: error.name,
                message: error.message,
                ...(error.code && { code: error.code }),
                ...(error.keyPattern && { keyPattern: error.keyPattern })
            };
        }
        
        res.status(500).json(errorResponse);
    } finally {
        console.log('=== REGISTRATION REQUEST COMPLETED ===\n');
    }
});

// User login
router.post('/login', validateLogin, handleValidationErrors, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
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

        // Return user data without password
        const userResponse = {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
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
        
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
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
            message: 'Internal server error during password change'
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


// In auth.js (routes)
router.put('/change-password', authenticate, validatePasswordChange, handleValidationErrors, changePassword);
router.put('/profile', authenticate, upload.single('avatar'), validateProfileUpdate, handleValidationErrors, updateProfile);
// Export the router as default
export default router;
