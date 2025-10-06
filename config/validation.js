import config from './environment.js';

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
    if (config.CORS_ORIGIN && !config.CORS_ORIGIN.startsWith('http')) {
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

export {
    validateConfig,
    getConfigStatus,
    sanitizeConfig
};
