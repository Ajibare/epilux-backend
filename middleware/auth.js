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
        console.log('Auth middleware - Full Authorization header:', authHeader ? authHeader.substring(0, 50) + '...' : 'undefined');
        console.log('Auth middleware - Token received:', token ? token.substring(0, 20) + '...' : 'undefined');                                                             
        console.log('Auth middleware - JWT_SECRET length:', JWT_SECRET ? JWT_SECRET.length : 'undefined');    
        
        if (!token) {
            console.log('Auth middleware - No token provided');
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'                                                              });
        }

        const decoded = verifyToken(token);
        console.log('Auth middleware - Decoded token:', decoded);                                             
        console.log('Auth middleware - Looking for user with ID:', decoded.userId);                                             
        
        const user = await User.findById(decoded.userId).select('-password');                                        
        console.log('Auth middleware - Found user:', user ? { id: user._id, email: user.email, role: user.role } : 'not found');                        
        
        if (!user) {
            console.log('Auth middleware - User not found in database');
            return res.status(401).json({
                success: false,
                message: 'Invalid token. User not found.'                                                                 });
        }

        console.log('Auth middleware - Authentication successful, setting req.user');
        req.user = user;
        next();
    } catch (error) {
        console.log('Auth middleware - Error:', error.message);                                                      
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
            const user = await User.findById(decoded.userId).select('-password');
            
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
