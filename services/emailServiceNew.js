import nodemailer from 'nodemailer';
import config from '../config/environment.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import ejs from 'ejs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmailService {
    constructor() {
        // Only create transporter if SMTP credentials are provided
        if (config.SMTP_USER && config.SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                host: config.SMTP_HOST,
                port: config.SMTP_PORT,
                secure: config.SMTP_SECURE === 'true',
                auth: {
                    user: config.SMTP_USER,
                    pass: config.SMTP_PASS
                }
            });
            this.isConfigured = true;
        } else {
            console.warn('Email service not configured - SMTP_USER and SMTP_PASS required. Using mock email service for development.');
            this.isConfigured = false;
        }
        
        // Load email templates
        this.templates = {};
        this.loadTemplates();
    }

    async loadTemplates() {
        try {
            const templatesDir = path.join(__dirname, '../emails/templates');
            const templateFiles = await fs.readdir(templatesDir);
            
            for (const file of templateFiles) {
                if (file.endsWith('.ejs')) {
                    const templateName = path.basename(file, '.ejs');
                    const templatePath = path.join(templatesDir, file);
                    const templateContent = await fs.readFile(templatePath, 'utf-8');
                    this.templates[templateName] = ejs.compile(templateContent);
                }
            }
        } catch (error) {
            console.error('Error loading email templates:', error);
        }
    }

    async sendEmail(to, subject, templateName, data = {}) {
        const template = this.templates[templateName];
        if (!template) {
            throw new Error(`Template ${templateName} not found`);
        }

        const html = template({
            ...data,
            appName: config.APP_NAME,
            logoUrl: config.LOGO_URL,
            frontendUrl: config.FRONTEND_URL,
            currentYear: new Date().getFullYear()
        });

        const mailOptions = {
            from: config.EMAIL_FROM || `"${config.APP_NAME}" <${config.SMTP_USER}>`,
            to,
            subject,
            html
        };

        if (!this.isConfigured) {
            console.log('--- MOCK EMAIL ---');
            console.log('To:', to);
            console.log('Subject:', subject);
            console.log('Template:', templateName);
            console.log('Data:', JSON.stringify(data, null, 2));
            console.log('--- End Mock Email ---');
            return true;
        }

        try {
            await this.transporter.sendMail(mailOptions);
            return true;
        } catch (error) {
            console.error('Error sending email:', error);
            return false;
        }
    }

    // Specific email methods
    async sendPasswordResetEmail(user, resetToken) {
        const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${resetToken.token}`;
        return this.sendEmail(
            user.email,
            'Password Reset Request',
            'password-reset',
            {
                name: user.firstName || 'User',
                resetUrl,
                expiryHours: 1
            }
        );
    }

    async sendWelcomeEmail(user) {
        return this.sendEmail(
            user.email,
            `Welcome to ${config.APP_NAME}!`,
            'welcome',
            {
                name: user.firstName || 'User',
                loginUrl: `${config.FRONTEND_URL}/login`,
                supportEmail: config.SUPPORT_EMAIL
            }
        );
    }

    // Affiliate related emails
    async sendAffiliateWelcomeEmail(affiliate) {
        return this.sendEmail(
            affiliate.email,
            'Welcome to Our Affiliate Program!',
            'affiliate-welcome',
            {
                name: affiliate.firstName || 'Affiliate',
                dashboardUrl: `${config.FRONTEND_URL}/affiliate/dashboard`,
                referralCode: affiliate.referralCode,
                referralLink: `${config.FRONTEND_URL}/register?ref=${affiliate.referralCode}`,
                supportEmail: config.SUPPORT_EMAIL
            }
        );
    }

    async sendAffiliateCommissionEarned(affiliate, commission) {
        return this.sendEmail(
            affiliate.email,
            `You've Earned $${commission.amount.toFixed(2)} in Commissions!`,
            'affiliate-commission',
            {
                name: affiliate.firstName || 'Affiliate',
                amount: commission.amount.toFixed(2),
                orderNumber: commission.orderNumber,
                commissionRate: (commission.rate * 100).toFixed(2) + '%',
                dashboardUrl: `${config.FRONTEND_URL}/affiliate/dashboard`,
                totalEarnings: affiliate.totalEarnings?.toFixed(2) || '0.00',
                availableBalance: affiliate.availableBalance?.toFixed(2) || '0.00'
            }
        );
    }

    async sendAffiliateWithdrawalRequest(affiliate, withdrawal) {
        return this.sendEmail(
            affiliate.email,
            'Withdrawal Request Received',
            'affiliate-withdrawal-request',
            {
                name: affiliate.firstName || 'Affiliate',
                amount: withdrawal.amount.toFixed(2),
                paymentMethod: withdrawal.paymentMethod,
                requestDate: withdrawal.createdAt.toLocaleDateString(),
                dashboardUrl: `${config.FRONTEND_URL}/affiliate/withdrawals`
            }
        );
    }

    async sendAffiliateWithdrawalUpdate(affiliate, withdrawal) {
        return this.sendEmail(
            affiliate.email,
            `Withdrawal Request ${withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}`,
            'affiliate-withdrawal-update',
            {
                name: affiliate.firstName || 'Affiliate',
                amount: withdrawal.amount.toFixed(2),
                status: withdrawal.status,
                transactionId: withdrawal.transactionId,
                notes: withdrawal.notes || 'No additional notes provided.',
                dashboardUrl: `${config.FRONTEND_URL}/affiliate/withdrawals`,
                contactEmail: config.SUPPORT_EMAIL
            }
        );
    }

    // Admin notifications
    async sendNewAffiliateSignupNotification(adminEmails, affiliate) {
        return this.sendEmail(
            adminEmails,
            'New Affiliate Signup',
            'admin-new-affiliate',
            {
                affiliateName: `${affiliate.firstName} ${affiliate.lastName}`.trim(),
                affiliateEmail: affiliate.email,
                signupDate: new Date().toLocaleDateString(),
                adminUrl: `${config.ADMIN_URL}/affiliates/${affiliate._id}`
            }
        );
    }

    async sendAffiliatePayoutNotification(adminEmails, affiliate, withdrawal) {
        return this.sendEmail(
            adminEmails,
            'Affiliate Payout Request',
            'admin-affiliate-payout',
            {
                affiliateName: `${affiliate.firstName} ${affiliate.lastName}`.trim(),
                affiliateEmail: affiliate.email,
                amount: withdrawal.amount.toFixed(2),
                paymentMethod: withdrawal.paymentMethod,
                requestDate: withdrawal.createdAt.toLocaleDateString(),
                adminUrl: `${config.ADMIN_URL}/withdrawals/${withdrawal._id}`
            }
        );
    }
}

const emailService = new EmailService();

export default emailService;
