import { body, validationResult, param, query } from 'express-validator';

// Validation rules for user registration
const validateRegistration = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

    body('firstName')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('First name can only contain letters and spaces'),

    body('lastName')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Last name can only contain letters and spaces'),

    body('role')
        .optional()
        .isIn(['user', 'admin', 'affiliate'])
        .withMessage('Role must be one of: user, admin, affiliate')
];

// Validation rules for user login
const validateLogin = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Validation rules for forgot password
const validateForgotPassword = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail()
];

// Validation rules for reset password
const validateResetPassword = [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required'),
    
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
    body('confirmPassword')
        .notEmpty()
        .withMessage('Please confirm your password')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
];


// Validation rules for password update
const validatePasswordUpdate = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
        .custom((value, { req }) => {
            if (value === req.body.currentPassword) {
                throw new Error('New password must be different from current password');
            }
            return true;
        })
];

// Validation rules for profile update
const validateProfileUpdate = [
    body('firstName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('First name can only contain letters and spaces'),
    
    body('lastName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Last name can only contain letters and spaces'),
    
    body('phone')
        .optional()
        .isMobilePhone()
        .withMessage('Please provide a valid phone number'),
    
    body('profile.address.street')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Street address must be between 1 and 100 characters'),
    
    body('profile.address.city')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('City must be between 1 and 50 characters'),
    
    body('profile.address.state')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('State must be between 1 and 50 characters'),
    
    body('profile.address.country')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Country must be between 1 and 50 characters'),
    
    body('profile.address.zipCode')
        .optional()
        .trim()
        .isPostalCode('any')
        .withMessage('Please provide a valid zip code')
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(error => ({
            field: error.path,
            message: error.msg
        }));
        
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: formattedErrors
        });
    }
    
    next();
};

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
    
    body('stock')
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    
    body('images')
        .optional()
        .isArray()
        .withMessage('Images must be an array'),
    
    body('images.*')
        .optional()
        .isURL()
        .withMessage('Each image must be a valid URL'),
    
    body('attributes')
        .optional()
        .isObject()
        .withMessage('Attributes must be an object')
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
        .isURL()
        .withMessage('Each image must be a valid URL'),
    
    body('attributes')
        .optional()
        .isObject()
        .withMessage('Attributes must be an object')
];

// Validation rules for order creation
const validateOrderCreation = [
    body('items')
        .isArray({ min: 1 })
        .withMessage('Order must contain at least one item'),
    
    body('items.*.product')
        .isMongoId()
        .withMessage('Each item must have a valid product ID'),
    
    body('items.*.quantity')
        .isInt({ min: 1 })
        .withMessage('Quantity must be at least 1'),
    
    body('shippingAddress')
        .isObject()
        .withMessage('Shipping address is required'),
    
    body('shippingAddress.street')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Street address must be between 1 and 100 characters'),
    
    body('shippingAddress.city')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('City must be between 1 and 50 characters'),
    
    body('shippingAddress.state')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('State must be between 1 and 50 characters'),
    
    body('shippingAddress.country')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Country must be between 1 and 50 characters'),
    
    body('shippingAddress.zipCode')
        .trim()
        .isLength({ min: 1, max: 20 })
        .withMessage('Zip code must be between 1 and 20 characters'),
    
    body('paymentMethod')
        .trim()
        .isIn(['credit_card', 'debit_card', 'paypal', 'bank_transfer'])
        .withMessage('Invalid payment method')
];

// Validation rules for payment status update
const validatePaymentStatusUpdate = [
    param('id')
        .isMongoId()
        .withMessage('Invalid order ID'),
    
    body('paymentStatus')
        .trim()
        .isIn(['pending', 'paid', 'failed', 'refunded'])
        .withMessage('Invalid payment status')
];

// Validation rules for order status update
const validateIdParam = [
    param('id')
        .isMongoId()
        .withMessage('Invalid ID format')
];

const validateMongoId = [
    param('id')
        .isMongoId()
        .withMessage('Invalid ID format')
];

const validateOrderStatusUpdate = [
    param('id')
        .isMongoId()
        .withMessage('Invalid order ID'),
    
    body('status')
        .trim()
        .isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
        .withMessage('Invalid order status')
];


// Validation for pagination query parameters
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    
    query('sortBy')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Sort field must be between 1 and 50 characters'),
    
    query('order')
        .optional()
        .trim()
        .isIn(['asc', 'desc'])
        .withMessage('Order must be either "asc" or "desc"')
];

export {
    validateRegistration,
    validateLogin,
    validateForgotPassword,
    validateResetPassword,
    validatePasswordUpdate,
    validateProfileUpdate,
    validateProductCreation,
    validateProductUpdate,
    validateOrderCreation,
    validateOrderStatusUpdate,
    validatePaymentStatusUpdate,
    validateIdParam,
    validateMongoId,
    validatePagination,
    handleValidationErrors
};
