// import express from 'express';
// import mongoose from 'mongoose';
// import cors from 'cors';
// import { globalErrorHandler } from './middleware/errorHandler.js';
// import config from './config/environment.js';
// import User from './models/User.js';
// import { validateConfig, getConfigStatus } from './config/validation.js';
// import { requestLogger } from './middleware/errorHandler.js';
// import supportRoutes from './routes/support.js';



// const app = express();
// // File URL to path conversion available via import.meta.url if needed

// // Enable JSON parsing
// app.use(express.urlencoded({ extended: true }));
// const PORT = config.PORT;

// const allowedOrigins = [
//     'https://epilux48.vercel.app',
//     'http://localhost:3000',
//   ];

// // Middleware - Dynamic CORS handling
// app.use(cors({
//     origin: function (origin, callback) {
//         // Allow requests with no origin (like mobile apps, curl, etc)
//         if (!origin) return callback(null, true);
        
//         // Check if the origin is in the allowed list
//         if (allowedOrigins.includes(origin)) {
//             return callback(null, true);
//         }
        
//         // For development, allow any localhost with any port
//         if (process.env.NODE_ENV === 'development' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
//             return callback(null, true);
//         }
        
//         // For production, allow any subdomain of vercel.app
//         if (process.env.NODE_ENV === 'production' && /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) {
//             return callback(null, true);
//         }
        
//         console.log('CORS blocked origin:', origin);
//         return callback(new Error('Not allowed by CORS'));
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'Accept', 'Accept-Version', 'Content-Length', 'X-Api-Version', 'X-Response-Time'],
//     exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar', 'X-Request-Id'],
//     maxAge: 86400, // 24 hours
//     preflightContinue: false,
//     optionsSuccessStatus: 204
// }));

// // Log all incoming requests for debugging
// app.use((req, res, next) => {
//     console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
//     next();
// });

// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(requestLogger);
// // Validate configuration
// const configErrors = validateConfig();
// if (configErrors.length > 0) {
//     console.error('Configuration errors:');
//     configErrors.forEach(error => console.error(`  - ${error}`));
//     process.exit(1);
// }

// let isConnected = false;

// const connectDB = async () => {
//   if (isConnected) return; // prevent reconnecting
//   try {
//     const conn = await mongoose.connect(config.MONGODB_URI, {
//       serverSelectionTimeoutMS: 10000,
//     });
//     isConnected = true;
//     console.log('MongoDB connected');
//   } catch (error) {
//     console.error('MongoDB connection error:', error);
//   }
// };

// connectDB();

// // Import routes
// import authRoutes from './routes/auth.js';
// import productRoutes from './routes/products.js';
// import orderRoutes from './routes/orders.js';
// import affiliateRoutes from './routes/affiliate.js';
// import adminRoutes from './routes/admin.js';
// import userRoutes from './routes/user.js';

// // Use routes
// app.use('/api/auth', authRoutes);
// app.use('/api/products', productRoutes);
// app.use('/api/orders', orderRoutes);
// app.use('/api/affiliate', affiliateRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/support', supportRoutes);
// app.use('/api/users', userRoutes);

// // Temporary admin route to list all users (remove in production)
// app.get('/api/admin/users', async (req, res) => {
//     try {
//         const users = await User.find({}).select('-password -__v');
//         res.json(users);
//     } catch (error) {
//         console.error('Error fetching users:', error);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });

// // Temporary admin route to delete a user by email (remove in production)
// app.delete('/api/admin/users/:email', async (req, res) => {
//     try {
//         const { email } = req.params;
//         const result = await User.deleteOne({ email });
        
//         if (result.deletedCount === 0) {
//             return res.status(404).json({ error: 'User not found' });
//         }
        
//         res.json({ message: 'User deleted successfully' });
//     } catch (error) {
//         console.error('Error deleting user:', error);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });

// // Basic route for testing
// app.get('/', (req, res) => {
//     res.json({ message: 'Epilux API Server is running' });
// });

// // Health check endpoint
// app.get('/health', (req, res) => {
//     res.json({ 
//         status: 'OK', 
//         timestamp: new Date().toISOString(),
//         uptime: process.uptime()
//     });
// });

// // 404 handler for undefined routes


// const handler = async (req, res) => {
//     await connectDB(); // connect only when function is called
//     return app(req, res);
//   };
  
//   handler();

// // Global error handling middleware
// app.use(globalErrorHandler);

// const vercelHandler = (req, res) => {
//     try {
//       if (req.method === 'OPTIONS') {
//         res.status(200).end();
//         return;
//       }
//       return app(req, res);
//     } catch (err) {
//       console.error('❌ Serverless function crashed:', err);
//       res.status(500).json({ error: 'Internal server error' });
//     }
//   };


//   export default vercelHandler

// // Start the server only when not in Vercel environment and not in test environment
// if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
//   const server = app.listen(PORT, async () => {
//     const localIP = await getLocalIP();
//     console.log(`\n🚀 Server is running in ${config.NODE_ENV || 'development'} mode on port ${PORT}`);
//     console.log(`Local: http://localhost:${PORT}`);
//     console.log(`Network: http://${localIP}:${PORT}`);
//   });

//   // Handle unhandled promise rejections
//   process.on('unhandledRejection', (err) => {
//     console.error('UNHANDLED REJECTION! 💥 Shutting down...');
//     console.error(err);
//     server.close(() => {
//       process.exit(1);
//     });
//   });
// }

// // Helper function to get local IP address
// async function getLocalIP() {
//     const { networkInterfaces } = await import('os');
//     const interfaces = networkInterfaces();
//     for (const name of Object.keys(interfaces)) {
//         for (const iface of interfaces[name]) {
//             const { address, family, internal } = iface;
//             if (family === 'IPv4' && !internal) {
//                 return address;
//             }
//         }
//     }
//     return 'localhost';
// }

// // Graceful shutdown
// const shutdown = async () => {
//     console.log('Shutting down gracefully...');
//     try {
//         await mongoose.connection.close();
//         console.log('MongoDB connection closed');
//         process.exit(0);
//     } catch (err) {
//         console.error('Error during shutdown:', err);
//         process.exit(1);
//     }
// };

// process.on('SIGTERM', shutdown);
// process.on('SIGINT', shutdown);

// // Export the Express app for testing and local development
// export { app };




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

// ✅ Export handler for Vercel (no immediate call!)
export default async function handler(req, res) {
  await connectDB();
  return app(req, res);
}

// ✅ Run locally if not in Vercel
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, async () => {
    const localIP = await getLocalIP();
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: http://${localIP}:${PORT}`);
  });

  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err);
    server.close(() => process.exit(1));
  });
}
