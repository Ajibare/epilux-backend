#!/usr/bin/env node

// Core Node.js modules
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Third-party modules
import crypto from 'crypto';

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m'
};

// Helper function to log colored messages
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Helper function to generate random strings
function generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex');
}


// Environment template
const envTemplate = `# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb+srv://ajibarebabajide1_db_user:epilux@epilux.qrmkv4r.mongodb.net/
# JWT Configuration
JWT_SECRET=${generateRandomString(64)}
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Email Configuration (optional)
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER= 
EMAIL_PASS=

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=uploads/

# Payment Configuration (optional)
PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Pagination Defaults
DEFAULT_PAGE_LIMIT=10
MAX_PAGE_LIMIT=100

# Cache Configuration
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600
`;

// Production environment template
const productionTemplate = `# Production Configuration
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://ajibarebabajide1_db_user:epilux@epilux.qrmkv4r.mongodb.net/
JWT_SECRET=${generateRandomString(64)}
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d
CORS_ORIGIN= https://www.epilux.com.ng

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=epiluxcompany@gmail.com
EMAIL_PASS=De-asa-7470

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=uploads/

# Payment Configuration
PAYSTACK_PUBLIC_KEY=your-production-paystack-public-key
PAYSTACK_SECRET_KEY=your-production-paystack-secret-key

# Logging Configuration
LOG_LEVEL=warn
LOG_FILE=logs/app.log

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Pagination Defaults
DEFAULT_PAGE_LIMIT=10
MAX_PAGE_LIMIT=100

# Cache Configuration
REDIS_URL=redis://your-production-redis:6379
CACHE_TTL=3600
`;

// Test environment template
const testTemplate = `# Test Configuration
NODE_ENV=test
PORT=5001
MONGODB_URI=mongodb+srv://ajibarebabajide1_db_user:epilux@epilux.qrmkv4r.mongodb.net/
JWT_SECRET=${generateRandomString(32)}
JWT_EXPIRE=1h
JWT_REFRESH_EXPIRE=1h
CORS_ORIGIN=http://localhost:3000

# Email Configuration (optional)
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=uploads/test/

# Payment Configuration (optional)
PAYSTACK_PUBLIC_KEY=test-paystack-public-key
PAYSTACK_SECRET_KEY=test-paystack-secret-key

# Logging Configuration
LOG_LEVEL=error
LOG_FILE=logs/test.log

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Pagination Defaults
DEFAULT_PAGE_LIMIT=10
MAX_PAGE_LIMIT=100

# Cache Configuration
REDIS_URL=redis://localhost:6379/1
CACHE_TTL=60
`;

// Create directories if they don't exist
function createDirectories() {
    const dirs = ['logs', 'uploads', 'uploads/test'];
    
    dirs.forEach(dir => {
        const dirPath = join(__dirname, '..', dir);
        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
            log(`Created directory: ${dir}`, 'green');
        }
    });
}

// Create environment files
function createEnvironmentFiles() {
    const envFiles = [
        { name: '.env', content: envTemplate },
        { name: '.env.production', content: productionTemplate },
        { name: '.env.test', content: testTemplate }
    ];

    envFiles.forEach(({ name, content }) => {
        const filePath = join(__dirname, '..', name);
        if (!existsSync(filePath)) {
            writeFileSync(filePath, content);
            log(`Created environment file: ${name}`, 'green');
        } else {
            log(`Environment file already exists: ${name}`, 'yellow');
        }
    });
}

// Create .gitignore
function createGitignore() {
    const gitignoreContent = `# Environment variables
.env
.env.local
.env.production
.env.test

# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Grunt intermediate storage
.grunt

# Bower dependency directory
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons
build/Release

# Dependency directories
jspm_packages/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test

# parcel-bundler cache
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Logs
logs/
*.log

# Uploads
uploads/
!uploads/.gitkeep

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Database
*.db
*.sqlite

# Cache
.cache/
.parcel-cache/

# Testing
.coverage/
.nyc_output/
junit.xml

# Deployment
deploy/
`;

    const gitignorePath = join(__dirname, '..', '.gitignore');
    
    if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, gitignoreContent);
        log('Created .gitignore file', 'green');
    } else {
        log('.gitignore file already exists', 'yellow');
    }
}

// Create .gitkeep files for empty directories
function createGitkeepFiles() {
    const dirs = ['logs', 'uploads', 'uploads/test'];
    
    dirs.forEach(dir => {
        const gitkeepPath = join(__dirname, '..', dir, '.gitkeep');
        if (!existsSync(gitkeepPath)) {
            writeFileSync(gitkeepPath, '');
            log(`Created .gitkeep file in ${dir}`, 'green');
        }
    });
}

// Main setup function
async function setupEnvironment() {
    log('🚀 Setting up Epilux API Environment', 'cyan');
    log('=====================================', 'cyan');
    
    try {
        // Create necessary directories
        log('\n📁 Creating directories...', 'blue');
        createDirectories();
        
        // Create environment files
        log('\n🔧 Creating environment files...', 'blue');
        createEnvironmentFiles();
        
        // Create .gitignore
        log('\n🚫 Creating .gitignore...', 'blue');
        createGitignore();
        
        // Create .gitkeep files
        log('\n📄 Creating .gitkeep files...', 'blue');
        createGitkeepFiles();
        
        log('\n✅ Environment setup completed successfully!', 'green');
        log('\n📋 Next steps:', 'yellow');
        log('1. Review and update the .env file with your specific configuration', 'yellow');
        log('2. Make sure MongoDB is running', 'yellow');
        log('3. Install dependencies: npm install', 'yellow');
        log('4. Start the server: npm start', 'yellow');
        log('\n📚 For more information, see SETUP.md', 'cyan');
        
    } catch (error) {
        log(`\n❌ Error during setup: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Check if script is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    setupEnvironment();
}

export { setupEnvironment, generateRandomString };
