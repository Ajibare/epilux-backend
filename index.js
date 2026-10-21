import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
// import commissionRoutes from './routes/commission.js';

const app = express();
const PORT = config.PORT;

// ✅ Allowed CORS origins
const allowedOrigins = [
  'https://www.epilux.com.ng',
  'https://epilux.com.ng', // Added non-www version
  'https://epilux48.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
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
// The driver reconnects by itself after a connection has been established;
// we only need to retry the *initial* connect. Listeners are registered once.
const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 20000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
  retryWrites: true,
  w: 'majority',
  // Optional override (e.g. 'primaryPreferred' locally so reads keep working
  // when the primary is briefly unreachable). Unset in production.
  ...(process.env.MONGO_READ_PREFERENCE && { readPreference: process.env.MONGO_READ_PREFERENCE })
};

mongoose.connection.on('connected', () => console.log('✅ MongoDB connected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected; the driver will keep retrying'));
mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err.message));

let connectPromise = null;
let retryDelayMs = 2000;

const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (connectPromise) return connectPromise;

  connectPromise = mongoose.connect(config.MONGODB_URI, MONGO_OPTIONS)
    .then(() => {
      retryDelayMs = 2000;
    })
    .catch((error) => {
      // Never exit: keep the API up and retry with backoff
      console.error(`❌ MongoDB connection failed (${error.name}: ${error.message}). Retrying in ${Math.round(retryDelayMs / 1000)}s`);
      setTimeout(() => connectDB(), retryDelayMs).unref?.();
      retryDelayMs = Math.min(retryDelayMs * 2, 30000);
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
};

// Initialize database connection
connectDB();

// Requests wait briefly for the database during a (re)connect instead of
// failing; if it is still unavailable they get a clear 503.
const waitForDatabase = async (req, res, next) => {
  if (mongoose.connection.readyState === 1 || req.path === '/health') return next();
  connectDB();
  const deadline = Date.now() + 8000;
  while (mongoose.connection.readyState !== 1 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (mongoose.connection.readyState === 1) return next();
  res.status(503).json({
    success: false,
    message: 'We are having trouble reaching our servers. Please try again in a moment.'
  });
};

// Configure and initialize uploads directory
const isVercel = process.env.VERCEL === '1';
const uploadsDir = (() => {
    const dir = isVercel 
        ? '/tmp/uploads'  // Vercel's writable directory
        : path.join(process.cwd(), 'public', 'uploads');
    
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
            console.log(`Created uploads directory at: ${dir}`);
        } else if (process.env.NODE_ENV !== 'production') {
            console.log(`Using existing uploads directory: ${dir}`);
        }
        return dir;
    } catch (error) {
        console.error('Error creating uploads directory:', error);
        // Fallback to current directory if temp directory is not writable
        const fallbackDir = path.join(process.cwd(), 'temp-uploads');
        if (!fs.existsSync(fallbackDir)) {
            fs.mkdirSync(fallbackDir, { recursive: true, mode: 0o777 });
        }
        console.warn(`Falling back to temporary directory: ${fallbackDir}`);
        return fallbackDir;
    }
})();

// Serve static files from the uploads directory with proper headers
app.use('/uploads', express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
        // Set proper cache headers for better performance
        res.set('Cache-Control', 'public, max-age=31536000');
        // Allow CORS for images
        res.set('Access-Control-Allow-Origin', '*');
        
        // Set content type based on file extension
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.jpg':
            case '.jpeg':
                res.set('Content-Type', 'image/jpeg');
                break;
            case '.png':
                res.set('Content-Type', 'image/png');
                break;
            case '.webp':
                res.set('Content-Type', 'image/webp');
                break;
            case '.gif':
                res.set('Content-Type', 'image/gif');
                break;
            default:
                // For unknown types, let Express handle it
                break;
        }
    }
}));

console.log(`Serving static files from: ${uploadsDir}`);

// ✅ Routes
import authRoutes from './routes/auth.js';

// Every API route needs the database; wait out short reconnects first
app.use('/api', waitForDatabase);

// Upload routes
app.use('/api/uploads', uploadRoutes);
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import affiliateRoutes from './routes/affiliate.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';
import messageRoutes from './routes/messages.js';
import cartRoutes from './routes/cart.js';
import testAuthRoutes from './routes/testAuth.js';
import walletRoutes from './routes/wallet.js';
import paymentRoutes from './routes/payment.js';
import flutterwaveRoutes from './routes/flutterwave.js';
import ratingRoutes from './routes/ratingRoutes.js';
import contactRoutes from './routes/contact.js';

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/flutterwave', flutterwaveRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/test-auth', testAuthRoutes);
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
app.use('/api/contact', contactRoutes);
// Ratings span several prefixes (/api/products/:id/ratings, /api/users/me/ratings,
// /api/orders/:orderId/products/:productId/rate), so mount it last at /api.
app.use('/api', ratingRoutes);

if (process.env.DISABLE_SCHEDULER !== 'true') {
  setupScheduledTasks();
}

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

// Unknown API routes return JSON instead of Express's default HTML page
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
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
    // Ensure database is connected (cold starts); waitForDatabase covers the rest
    if (mongoose.connection.readyState !== 1) {
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
























