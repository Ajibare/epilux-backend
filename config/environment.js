import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Base configuration
const config = {
  // Server
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  APP_NAME: process.env.APP_NAME || 'Epilux',

  // Database
  MONGODB_URI: process.env.MONGODB_URI,

  // JWT Authentication
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',

  // Admin credentials (loaded securely from .env)
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,

  // CORS & Frontend URLs
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'https://www.epilux.com.ng' || 'https://epilux48.vercel.app' || 'https://epilux.com.ng')
    .split(',')
    .map(origin => origin.trim()),
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://www.epilux.com.ng' || 'https://epilux48.vercel.app' || 'https://epilux.com.ng',

  // Email configuration (merged legacy + new)
  EMAIL_CONFIG: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    },
  },
  EMAIL_FROM: process.env.EMAIL_FROM || process.env.SMTP_USER,

  // File uploads
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  UPLOAD_PATH: process.env.UPLOAD_PATH || 'uploads/',

  // Payment configuration (future integration)
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'logs/app.log',

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 mins
  RATE_LIMIT_MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

  // Pagination
  DEFAULT_PAGE_LIMIT: Number(process.env.DEFAULT_PAGE_LIMIT) || 10,
  MAX_PAGE_LIMIT: Number(process.env.MAX_PAGE_LIMIT) || 100,

  // Cache (Redis)
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  CACHE_TTL: Number(process.env.CACHE_TTL) || 3600, // 1 hour
};

// Validate critical variables in production
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
if (config.NODE_ENV === 'production') {
  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      throw new Error(`❌ Missing required environment variable: ${envVar}`);
    }
  });
}

// Logging mode info
if (config.NODE_ENV === 'development') {
  console.log('🧩 Running in development mode');
  console.log('MongoDB URI:', config.MONGODB_URI);
  console.log('Server Port:', config.PORT);
} else if (config.NODE_ENV === 'production') {
  console.log(`🚀 ${config.APP_NAME} running in production mode`);
}

export default config;
