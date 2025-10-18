#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';

const readline = { createInterface };

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

// Helper function to ask questions
function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Function to update .env file with admin credentials
async function setupAdminCredentials() {
    log('🔧 Setting up admin credentials...', 'cyan');

    try {
        const envPath = path.join(__dirname, '..', '.env');
        
        // Check if .env file exists
        if (!fs.existsSync(envPath)) {
            log('❌ .env file not found. Please run setup-env.js first.', 'red');
            return;
        }

        // Read current .env content
        let envContent = fs.readFileSync(envPath, 'utf8');

        // Ask for admin email
        const adminEmail = await askQuestion('Enter admin email (default: admin@epilux.com): ') || 'admin@epilux.com';
        
        // Ask for admin password
        const adminPassword = await askQuestion('Enter admin password (default: admin123): ') || 'admin123';

        // Remove existing admin credentials if they exist
        envContent = envContent.replace(/^ADMIN_EMAIL=.*$/m, '');
        envContent = envContent.replace(/^ADMIN_PASSWORD=.*$/m, '');

        // Add admin credentials
        envContent += `\n# Admin Configuration\nADMIN_EMAIL=${adminEmail}\nADMIN_PASSWORD=${adminPassword}\n`;

        // Write back to .env file
        fs.writeFileSync(envPath, envContent);

        log('✅ Admin credentials have been set up successfully!', 'green');
        log(`📧 Admin Email: ${adminEmail}`, 'blue');
        log(`🔑 Admin Password: ${adminPassword}`, 'blue');
        log('\n🚀 You can now use these credentials to log in to the admin dashboard at:', 'cyan');
        log('   POST /api/auth/admin/login', 'yellow');
        log('\n📋 Request body:', 'cyan');
        log('   {', 'yellow');
        log('     "email": "' + adminEmail + '",', 'yellow');
        log('     "password": "' + adminPassword + '"', 'yellow');
        log('   }', 'yellow');

    } catch (error) {
        log('❌ Error setting up admin credentials: ' + error.message, 'red');
    }
}

// Run the script
setupAdminCredentials();

// Export for testing purposes
export { setupAdminCredentials };
