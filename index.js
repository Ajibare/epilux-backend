import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { globalErrorHandler, requestLogger } from './middleware/errorHandler.js';
import config from './config/environment.js';
import User from './models/User.js';
import { validateConfig } from './config/validation.js';
import supportRoutes from './routes/support.js';
import commissionRoutes from './routes/commission.js';
import deliveryRoutes from './routes/delivery.js';
import commissionAdminRoutes from './routes/commissionAdmin.js';
import marketerRoutes from './routes/marketer.js';
import withdrawalRoutes from './routes/withdrawals.js';
import uploadRoutes from './routes/uploads.js';
import setupScheduledTasks from './services/scheduler.js'

const app = express();
const PORT = config.PORT;

// ✅ Allowed CORS origins
const allowedOrigins = [
  'https://www.epilux.com.ng',
  'https://epilux.com.ng', // Added non-www version
  'https://epilux48.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

// ✅ Safe CORS middleware with error handling
const corsOptions = {
  origin: function (origin, callback) {
    try {
      // Allow requests with no origin (like mobile apps, curl requests)
      if (!origin) return callback(null, true);
      
      // Check exact matches
      if (allowedOrigins.includes(origin)) return callback(null, true);
      
      // Development flexibility
      if (process.env.NODE_ENV === 'development') {
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin) ||
            /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
      }
      
      // Production - allow your main domain and subdomains
      if (process.env.NODE_ENV === 'production') {
        if (/^https?:\/\/([a-zA-Z0-9-]+\.)*epilux\.com\.ng$/.test(origin)) {
          return callback(null, true);
        }
        // Keep Vercel for any remaining deployments
        if (/^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) {
          return callback(null, true);
        }
      }
      
      console.log('CORS blocked origin:', origin);
      return callback(null, false); // Use false instead of Error to prevent crashes
      
    } catch (error) {
      console.error('CORS error:', error);
      return callback(null, false); // Fail safely
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 204,
  maxAge: 86400 // Cache preflight for 24 hours
};

// ✅ Apply middleware - ORDER MATTERS!
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors(corsOptions)); // Use the safe CORS options

// Handle pre-flight requests for all API routes
app.options('/api/:any', cors(corsOptions)); // Use a parameter instead of wildcard

// ✅ Security headers middleware (prevents crashes from missing headers)
app.use((req, res, next) => {
  // Remove sensitive headers safely
  if (res.removeHeader) {
    res.removeHeader('X-Powered-By');
  }
  
  // Set security headers safely
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
  } catch (error) {
    console.error('Header setting error:', error);
    // Continue anyway - don't crash the server
  }
  
  next();
});

app.use(requestLogger);

// ✅ Validate environment
const configErrors = validateConfig();
if (configErrors.length > 0) {
  console.error('Configuration errors:');
  configErrors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

// ✅ MongoDB connection
let isConnected = false;
const connectDB = async () => {
  if (isConnected) {
    console.log('Using existing database connection');
    return;
  }
  
  console.log('Connecting to MongoDB...');
  console.log('MongoDB URI:', config.MONGODB_URI ? 'Present' : 'Missing!');
  
  try {
    const options = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    };
    
    await mongoose.connect(config.MONGODB_URI, options);
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    
    // Connection events for better debugging
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to DB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
      isConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected');
      isConnected = false;
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', {
      name: error.name,
      message: error.message,
      code: error.code,
      codeName: error.codeName
    });
    // Don't exit in production to allow for auto-recovery
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// Initialize database connection
connectDB();

// Serve static files from the uploads directory
const __dirname = path.resolve();
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
}
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Reconnect on connection loss
setInterval(async () => {
  if (!isConnected) {
    console.log('Attempting to reconnect to MongoDB...');
    await connectDB();
  }
}, 10000); // Try to reconnect every 10 seconds

// ✅ Routes
import authRoutes from './routes/auth.js';

// Upload routes
app.use('/api/uploads', uploadRoutes);
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import affiliateRoutes from './routes/affiliate.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';
import messageRoutes from './routes/messages.js';
import cartRoutes from './routes/cart.js';
import walletRoutes from './routes/wallet.js';

app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/commission', commissionRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/commission/admin', commissionAdminRoutes);
app.use('/api/marketer', marketerRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
// Removed duplicate delivery route

setupScheduledTasks();

// ✅ Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Epilux API Server is running' });
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ✅ Global error handler
app.use(globalErrorHandler);

// ✅ Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ✅ Export handler for Vercel
const handler = async (req, res) => {
  try {
    // Ensure database is connected
    if (!isConnected) {
      await connectDB();
    }
    
    // Handle preflight requests - the CORS middleware will handle this
    return app(req, res);
  } catch (error) {
    console.error('Error in Vercel handler:', error);
    
    if (res && typeof res.status === 'function') {
      return res.status(500).json({
        success: false,
        status: 'error',
        message: 'Internal server error'
      });
    }
    
    // Fallback for Vercel's response format
    if (res && typeof res.send === 'function') {
      return res.send({
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          status: 'error',
          message: 'Internal server error'
        })
      });
    }
    
    // Last resort
    console.error('Could not send error response - invalid response object');
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};

// Start server if not in Vercel
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ Health check: http://localhost:${PORT}/health`);
  });
}

// Export for Vercel
export default handler;
























