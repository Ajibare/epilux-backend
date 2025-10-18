import config from './environment.js';
import { body, validationResult } from 'express-validator';

// Configuration validation utilities
const validateConfig = () => {
    const errors = [];
    
    // Validate port
    if (config.PORT < 1 || config.PORT > 65535) {
        errors.push('PORT must be between 1 and 65535');
    }
    
    // Validate MongoDB URI
    if (!config.MONGODB_URI || !config.MONGODB_URI.startsWith('mongodb')) {
        errors.push('MONGODB_URI must be a valid MongoDB connection string');
    }
    
    // Validate JWT secret
    if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters long');
    }
    
    // Validate JWT expiration
    const jwtExpireRegex = /^\d+[smhd]$/;
    if (!jwtExpireRegex.test(config.JWT_EXPIRE)) {
        errors.push('JWT_EXPIRE must be in format like "7d", "1h", "30m", etc.');
    }
    
    // Validate CORS origin
    if (config.CORS_ORIGIN && typeof config.CORS_ORIGIN === 'string' && !config.CORS_ORIGIN.startsWith('http')) {
        errors.push('CORS_ORIGIN must be a valid URL starting with http');
    }
        
    // Validate file size
    if (config.MAX_FILE_SIZE < 1024 || config.MAX_FILE_SIZE > 50 * 1024 * 1024) {
        errors.push('MAX_FILE_SIZE must be between 1KB and 50MB');
    }
    
    // Validate rate limiting
    if (config.RATE_LIMIT_WINDOW_MS < 1000 || config.RATE_LIMIT_WINDOW_MS > 3600000) {
        errors.push('RATE_LIMIT_WINDOW_MS must be between 1000ms and 3600000ms (1 hour)');
    }
    
    if (config.RATE_LIMIT_MAX_REQUESTS < 1 || config.RATE_LIMIT_MAX_REQUESTS > 10000) {
        errors.push('RATE_LIMIT_MAX_REQUESTS must be between 1 and 10000');
    }
    
    // Validate pagination limits
    if (config.DEFAULT_PAGE_LIMIT < 1 || config.DEFAULT_PAGE_LIMIT > 100) {
        errors.push('DEFAULT_PAGE_LIMIT must be between 1 and 100');
    }
    
    if (config.MAX_PAGE_LIMIT < config.DEFAULT_PAGE_LIMIT || config.MAX_PAGE_LIMIT > 1000) {
        errors.push('MAX_PAGE_LIMIT must be greater than DEFAULT_PAGE_LIMIT and less than 1000');
    }
    
    // Validate cache TTL
    if (config.CACHE_TTL < 60 || config.CACHE_TTL > 86400) {
        errors.push('CACHE_TTL must be between 60 seconds and 86400 seconds (24 hours)');
    }
    
    return errors;
};

// Get configuration status
const getConfigStatus = () => {
    const status = {
        environment: config.NODE_ENV,
        port: config.PORT,
        database: {
            connected: false,
            uri: config.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') // Hide credentials
        },
        jwt: {
            secret: config.JWT_SECRET ? 'Set' : 'Not set',
            expiresIn: config.JWT_EXPIRE
        },
        cors: {
            origin: config.CORS_ORIGIN
        },
        features: {
            email: !!config.EMAIL_USER && !!config.EMAIL_PASS,
            payments: !!config.PAYSTACK_SECRET_KEY,
            redis: !!config.REDIS_URL
        }
    };
    
    return status;
};

// Sanitize configuration for logging
const sanitizeConfig = () => {
    const sanitized = { ...config };
    
    // Hide sensitive information
    if (sanitized.JWT_SECRET) {
        sanitized.JWT_SECRET = '***HIDDEN***';
    }
    
    if (sanitized.EMAIL_PASS) {
        sanitized.EMAIL_PASS = '***HIDDEN***';
    }
    
    if (sanitized.PAYSTACK_SECRET_KEY) {
        sanitized.PAYSTACK_SECRET_KEY = '***HIDDEN***';
    }
    
    return sanitized;
};

const validatePasswordChange = [
    body('currentPassword')
        .notEmpty().withMessage('Current password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .custom((value, { req }) => {
            if (value === req.body.currentPassword) {
                throw new Error('New password must be different from current password');
            }
            return true;
        })
];

const validateProfileUpdate = [
    body('firstName')
        .optional()
        .trim()
        .isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    body('lastName')
        .optional()
        .trim()
        .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    body('phone')
        .optional()
        .trim()
        .isMobilePhone('any').withMessage('Invalid phone number'),
    body('address')
        .optional()
        .trim()
        .isLength({ min: 5 }).withMessage('Address must be at least 5 characters')
];

// Handle validation errors middleware
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg
            }))
        });
    }
    next();
};

// Registration validation
const validateRegistration = [
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
    body('referralCode')
        .optional()
        .isString()
        .trim()
        .escape(),
];

// Login validation
const validateLogin = [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required')
];

// Forgot password validation
const validateForgotPassword = [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail()
];

// Reset password validation
const validateResetPassword = [
    body('token')
        .notEmpty().withMessage('Token is required'),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
];

// Password update validation
const validatePasswordUpdate = [
    body('currentPassword')
        .notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
        .custom((value, { req }) => {
            if (value === req.body.currentPassword) {
                throw new Error('New password must be different from current password');
            }
            return true;
        })
];


// Validation rules for product creation
const validateProductCreation = [
    body('name')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Product name must be between 1 and 100 characters'),
    
    body('description')
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Product description must be between 1 and 1000 characters'),
    
    body('price')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
    
    body('category')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Category must be between 1 and 50 characters'),
    
    body('brand')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Brand is required and must be between 1 and 50 characters'),
    
    body('stock')
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    
    body('images')
        .optional()
        .isArray()
        .withMessage('Images must be an array'),
    
    body('images.*')
        .optional()
        .isString()
        .withMessage('Each image must be a string (URL or base64)'),
    
    body('isFeatured')
        .optional()
        .isBoolean()
        .withMessage('isFeatured must be a boolean')
];

// Validation rules for product update
const validateProductUpdate = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Product name must be between 1 and 100 characters'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Product description must be between 1 and 1000 characters'),
    
    body('price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
    
    body('category')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Category must be between 1 and 50 characters'),
    
    body('brand')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Brand must be between 1 and 50 characters'),
    
    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    
    body('images')
        .optional()
        .isArray()
        .withMessage('Images must be an array'),
    
    body('images.*')
        .optional()
        .isString()
        .withMessage('Each image must be a string (URL or base64)'),
    
    body('isFeatured')
        .optional()
        .isBoolean()
        .withMessage('isFeatured must be a boolean'),
    
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean')
];

// Export all functions
export {
    validateConfig,
    getConfigStatus,
    sanitizeConfig,
    handleValidationErrors,
    validateRegistration,
    validateLogin,
    validatePasswordUpdate,
    validateProfileUpdate,
    validateForgotPassword,
    validateResetPassword,
    validatePasswordChange,
    validateProductUpdate,
    validateProductCreation
};
