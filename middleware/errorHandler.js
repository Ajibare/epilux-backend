// Custom error classes
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(errors) {
        super('Validation failed', 400);
        this.errors = errors;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401);
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'You do not have permission to perform this action') {
        super(message, 403);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

class DatabaseError extends AppError {
    constructor(message = 'Database operation failed') {
        super(message, 500);
    }
}

// Mongoose error handler
const handleMongooseError = (error) => {
    if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => ({
            field: err.path,
            message: err.message
        }));
        return new ValidationError(errors);
    }
    
    if (error.name === 'CastError') {
        return new AppError(`Invalid ${error.path}: ${error.value}`, 400);
    }
    
    if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        const value = Object.values(error.keyValue)[0];
        return new AppError(`Duplicate field value: ${field} with value: ${value}. Please use another value.`, 400);
    }
    
    return new DatabaseError(error.message);
};

// JWT error handler
const handleJWTError = () => {
    return new AuthenticationError('Invalid token. Please log in again.');
};

const handleJWTExpiredError = () => {
    return new AuthenticationError('Your token has expired. Please log in again.');
};

// Development error response
const sendErrorDev = (err, res) => {
    res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        stack: err.stack,
        errors: err.errors || undefined,
        isOperational: err.isOperational
    });
};

// Production error response
const sendErrorProd = (err, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode).json({
            success: false,
            status: err.status,
            message: err.message,
            errors: err.errors || undefined
        });
    } 
    // Programming or other unknown error: don't leak error details
    else {
        // Log error for debugging
        console.error('ERROR 💥', err);
        
        res.status(500).json({
            success: false,
            status: 'error',
            message: 'Something went wrong!'
        });
    }
};

// Global error handling middleware
const globalErrorHandler = (err, req, res) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
    
    // Handle specific error types
    let error = { ...err };
    error.message = err.message;
    
    if (error.name === 'ValidationError' || error.name === 'CastError' || error.code === 11000) {
        error = handleMongooseError(error);
    }
    
    if (error.name === 'JsonWebTokenError') {
        error = handleJWTError();
    }
    
    if (error.name === 'TokenExpiredError') {
        error = handleJWTExpiredError();
    }
    
    // Send error response based on environment
    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(error, res);
    } else if (process.env.NODE_ENV === 'production') {
        sendErrorProd(error, res);
    } else {
        // Default to development behavior
        sendErrorDev(error, res);
    }
};

// Async error wrapper for route handlers
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// Request logging middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const { method, originalUrl } = req;
        const { statusCode } = res;
        
        console.log(`${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    });
    
    next();
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
    const error = new NotFoundError(`Route ${req.originalUrl} not found`);
    next(error);
};

export {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    DatabaseError,
    handleMongooseError,
    handleJWTError,
    handleJWTExpiredError,
    globalErrorHandler,
    catchAsync,
    requestLogger,
    notFoundHandler
};
