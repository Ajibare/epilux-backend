#!/usr/bin/env node

import mongoose from 'mongoose';
import User from '../models/User.js';
import config from '../config/environment.js';

// Note: Passwords should be hashed before saving to the database
// In a production environment, ensure ADMIN_PASSWORD is hashed before this script runs

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

async function createAdminUser() {
    log('🔧 Creating admin user...', 'cyan');

    try {
        // Connect to MongoDB
        await mongoose.connect(config.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        log('✅ Connected to MongoDB', 'green');

        // Check if admin user already exists
        const existingAdmin = await User.findOne({ email: config.ADMIN_EMAIL });
        if (existingAdmin) {
            log('⚠️  Admin user already exists!', 'yellow');
            log(`📧 Email: ${existingAdmin.email}`, 'blue');
            log(`👤 Name: ${existingAdmin.firstName} ${existingAdmin.lastName}`, 'blue');
            log(`🔑 Role: ${existingAdmin.role}`, 'blue');
            
            await mongoose.disconnect();
            return;
        }

        // Create admin user
        const adminUser = new User({
            email: config.ADMIN_EMAIL,
            password: config.ADMIN_PASSWORD,
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            emailVerified: true
        });

        await adminUser.save();
        log('✅ Admin user created successfully!', 'green');
        log(`📧 Email: ${adminUser.email}`, 'blue');
        log(`👤 Name: ${adminUser.firstName} ${adminUser.lastName}`, 'blue');
        log(`🔑 Role: ${adminUser.role}`, 'blue');
        log('\n🚀 You can now log in with these credentials at:', 'cyan');
        log('   POST /api/auth/admin/login', 'yellow');
        log('\n📋 Request body:', 'cyan');
        log('   {', 'yellow');
        log('     "email": "' + adminUser.email + '",', 'yellow');
        log('     "password": "' + config.ADMIN_PASSWORD + '"', 'yellow');
        log('   }', 'yellow');

    } catch (error) {
        log('❌ Error creating admin user: ' + error.message, 'red');
    } finally {
        await mongoose.disconnect();
        log('🔌 Disconnected from MongoDB', 'cyan');
    }
}

// Run the script
createAdminUser();

// Export for testing purposes
export { createAdminUser };
