import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/environment.js';

// JWT configuration
const JWT_SECRET = config.JWT_SECRET;
const JWT_EXPIRES_IN = config.JWT_EXPIRE;

// Available roles
export const ROLES = {
    ADMIN: 'admin',
    MARKETER: 'marketer',
    CUSTOMER: 'customer',
    USER: 'user'
};

// Generate JWT token
const generateToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token
const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

// Authentication middleware
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (tokenError) {
            if (tokenError.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token.'
                });
            }
            if (tokenError.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired.'
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Token verification failed.'
            });
        }

        // Support different field names for user ID
        const userId = decoded.userId || decoded.id || decoded.sub;
        const user = await User.findById(userId).select('-password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. User not found.'
            });
        }

        if (user.suspended === true) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been suspended. Please contact support.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error.message);
        if (error.name === 'JsonWebTokenError') {      
            return res.status(401).json({
                success: false,
                message: 'Invalid token.'
            });
        }
        if (error.name === 'TokenExpiredError') {      
            return res.status(401).json({
                success: false,
                message: 'Token expired.'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Internal server error.'
        });
    }
};

// Role-based authorization middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. User not authenticated.' 
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }

        next();
    };
};


// Admin-specific middleware
const admin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. User not authenticated.' 
        });
    }

    if (req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Admin access required.' 
        });
    }

    next();
};

// Marketer-specific middleware
const marketer = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. User not authenticated.' 
        });
    }

    if (req.user.role !== ROLES.MARKETER && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Marketer or admin access required.' 
        });
    }

    next();
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (token) {
            const decoded = verifyToken(token);
            const user = await User.findById(decoded.userId || decoded.id || decoded.sub).select('-password');
            
            if (user) {
                req.user = user;
            }
        }
        
    } catch (error) {
        // Continue without authentication if there's an error with the token
        console.error('Optional auth error:', error.message);
    }
    next();
};

export {
    generateToken,
    verifyToken,
    authenticate,
    authorize,
    optionalAuth,
    marketer,
    admin
};
