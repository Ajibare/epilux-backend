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
  'https://epilux48.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

// ✅ Middleware
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
  if (isConnected) return;
  try {
    await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    isConnected = true;
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};
connectDB();

// ✅ Routes
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import affiliateRoutes from './routes/affiliate.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/users', userRoutes);

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
