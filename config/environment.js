// import dotenv from 'dotenv';

// // Load environment variables
// dotenv.config();

// // Environment configuration
// const config = {
//     // Server configuration
//     PORT: process.env.PORT || 5000,
//     NODE_ENV: process.env.NODE_ENV || 'production',
    
//     // Database configuration
//     MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://ajibarebabajide1_db_user:epilux@epilux.qrmkv4r.mongodb.net/',
    
//     // JWT configuration
//     JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
//     JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
//     JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',
    
//     // Admin configuration
//     ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'epiluxcompany@gmail.com',
//     ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'De-asa-7470',
    
//     // CORS configuration
//     // CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000' || ''
//     CORS_ORIGIN: process.env.CORS_ORIGIN || 'https://epilux48.vercel.app',
    
//     // Frontend URL for password reset links
//     // FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
//     FRONTEND_URL: process.env.FRONTEND_URL || 'https://epilux48.vercel.app',

    
//     // App configuration
//     APP_NAME: process.env.APP_NAME || 'Epilux',
//     LOGO_URL: process.env.LOGO_URL || '',
    
//     // Email configuration
//     SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
//     SMTP_PORT: process.env.SMTP_PORT || 587,
//     SMTP_SECURE: process.env.SMTP_SECURE || 'false',
//     SMTP_USER: process.env.SMTP_USER || '',
//     SMTP_PASS: process.env.SMTP_PASS || '',
//     EMAIL_FROM: process.env.EMAIL_FROM || '',
    
//     // Legacy email configuration (for backward compatibility)
//     EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'gmail',
//     EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
//     EMAIL_PORT: process.env.EMAIL_PORT || 587,
//     EMAIL_USER: process.env.EMAIL_USER || '',
//     EMAIL_PASS: process.env.EMAIL_PASS || '',
    
//     // File upload configuration
//     MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || 5 * 1024 * 1024, // 5MB
//     UPLOAD_PATH: process.env.UPLOAD_PATH || 'uploads/',
    
//     // Payment configuration (for future payment integration)
//     PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
//     PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
    
//     // Logging configuration
//     LOG_LEVEL: process.env.LOG_LEVEL || 'info',
//     LOG_FILE: process.env.LOG_FILE || 'logs/app.log',
    
//     // Rate limiting configuration
//     RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
//     RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
    
//     // Pagination defaults
//     DEFAULT_PAGE_LIMIT: process.env.DEFAULT_PAGE_LIMIT || 10,
//     MAX_PAGE_LIMIT: process.env.MAX_PAGE_LIMIT || 100,
    
//     // Cache configuration
//     REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
//     CACHE_TTL: process.env.CACHE_TTL || 3600, // 1 hour
// };

// // Validate required environment variables
// const requiredEnvVars = [
//     'MONGODB_URI',
//     'JWT_SECRET'
// ];

// if (config.NODE_ENV === 'production') {
//     requiredEnvVars.forEach(envVar => {
//         if (!process.env[envVar]) {
//             throw new Error(`Environment variable ${envVar} is required in production`);
//         }
//     });
// }

// // Development-specific configurations
// if (config.NODE_ENV === 'development') {
//     console.log('Running in development mode');
//     console.log('MongoDB URI:', config.MONGODB_URI);
//     console.log('Server Port:', config.PORT);
// }

// // Production-specific configurations
// if (config.NODE_ENV === 'production') {
//     console.log('Running in production mode');
// }

// export default config;




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
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'https://www.epilux.com.ng' || 'https://epilux48.vercel.app')
    .split(',')
    .map(origin => origin.trim()),
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://www.epilux.com.ng' || 'https://epilux48.vercel.app',

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
