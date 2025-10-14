import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { globalErrorHandler, requestLogger } from './middleware/errorHandler.js';
import config from './config/environment.js';
import User from './models/User.js';
import { validateConfig } from './config/validation.js';
import supportRoutes from './routes/support.js';

const app = express();
const PORT = config.PORT;

// ✅ Allowed CORS origins
const allowedOrigins = [
  'https://www.epilux.com.ng',
  'https://epilux48.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV === 'development' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV === 'production' && /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    console.log('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
      codeName: error.codeName,
      errorResponse: error.errorResponse,
      stack: error.stack
    });
    // Don't exit in production to allow for auto-recovery
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// Initialize database connection
connectDB();

// Reconnect on connection loss
setInterval(async () => {
  if (!isConnected) {
    console.log('Attempting to reconnect to MongoDB...');
    await connectDB();
  }
}, 10000); // Try to reconnect every 10 seconds

// ✅ Routes
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import affiliateRoutes from './routes/affiliate.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';
import messageRoutes from './routes/messages.js';

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// ✅ Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Epilux API Server is running' });
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ✅ Global error handler
app.use(globalErrorHandler);

// ✅ Helper: Get local IP for logs
async function getLocalIP() {
  const { networkInterfaces } = await import('os');
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

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



app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ✅ Export handler for Vercel
const handler = async (req, res) => {
  try {
    // Ensure database is connected
    if (!isConnected) {
      await connectDB();
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return res.status(204).end();
    }
    
    // Handle the request with Express
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

// Export for Vercel
export default handler;
