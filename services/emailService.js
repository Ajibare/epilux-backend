import nodemailer from 'nodemailer';
import config from '../config/environment.js';

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
    }

    async sendPasswordResetEmail(user, resetToken) {
        const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${resetToken.token}`;
        
        if (!this.isConfigured) {
            // Mock email service for development
            console.log('MOCK EMAIL - Password Reset Request');
            console.log('To:', user.email);
            console.log('Reset URL:', resetUrl);
            console.log('Token:', resetToken.token);
            console.log('--- End Mock Email ---');
            return true;
        }
        
        const mailOptions = {
            from: config.EMAIL_FROM || `"${config.APP_NAME}" <${config.SMTP_USER}>`,
            to: user.email,
            subject: 'Password Reset Request',
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Password Reset</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                        }
                        .logo {
                            max-width: 150px;
                            height: auto;
                        }
                        .content {
                            background: #f9f9f9;
                            padding: 30px;
                            border-radius: 8px;
                            margin-bottom: 20px;
                        }
                        .button {
                            display: inline-block;
                            background: #007bff;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            font-weight: bold;
                        }
                        .footer {
                            text-align: center;
                            font-size: 12px;
                            color: #666;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <img src="${config.LOGO_URL || 'https://via.placeholder.com/150'}" alt="${config.APP_NAME}" class="logo">
                    </div>
                    <div class="content">
                        <h2>Password Reset Request</h2>
                        <p>Hello ${user.firstName || user.email},</p>
                        <p>We received a request to reset your password for your ${config.APP_NAME} account. Click the button below to reset your password:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetUrl}" class="button">Reset Password</a>
                        </div>
                        <p>This link will expire in 1 hour for security reasons.</p>
                        <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
                        <p>For security reasons, do not share this link with anyone.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} ${config.APP_NAME}. All rights reserved.</p>
                        <p>If you have questions, contact our support team.</p>
                    </div>
                </body>
                </html>
            `
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log(`Password reset email sent to ${user.email}`);
            return true;
        } catch (error) {
            console.error('Error sending password reset email:', error);
            throw error;
        }
    }

    async testConnection() {
        if (!this.isConfigured) {
            console.log('Email service not configured - skipping connection test');
            return true;
        }
        
        try {
            await this.transporter.verify();
            console.log('Email service connection verified');
            return true;
        } catch (error) {
            console.error('Email service connection failed:', error);
            throw error;
        }
    }

    // Send a notification email
    async sendNotificationEmail({ to, subject, template, context = {} }) {
        if (!this.isConfigured) {
            // Mock email service for development
            console.log('MOCK EMAIL - Notification');
            console.log('To:', to);
            console.log('Subject:', subject);
            console.log('Template:', template);
            console.log('Context:', JSON.stringify(context, null, 2));
            console.log('--- End Mock Email ---');
            return true;
        }

        // In a real implementation, you would render the email template here
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 8px; margin-bottom: 20px; }
                    .button { display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="content">
                    <h2>${subject}</h2>
                    ${context.message || ''}
                    ${context.actionUrl ? `
                        <div style="margin: 25px 0;">
                            <a href="${context.actionUrl}" class="button">${context.actionText || 'View Details'}</a>
                        </div>
                    ` : ''}
                    <p>If you have any questions, please contact our support team.</p>
                    <p>Best regards,<br>${config.APP_NAME} Team</p>
                </div>
            </body>
            </html>
        `;

        const mailOptions = {
            from: config.EMAIL_FROM || `"${config.APP_NAME}" <${config.SMTP_USER}>`,
            to,
            subject: `${config.APP_NAME} - ${subject}`,
            html
        };

        try {
            await this.transporter.sendMail(mailOptions);
            return true;
        } catch (error) {
            console.error('Error sending notification email:', error);
            throw new Error('Failed to send notification email');
        }
    }
}


const emailService = new EmailService();

// Export both the instance and the class for testing/mocking
export { emailService as default, EmailService };

// Export the notification function for direct use
export const sendNotificationEmail = (options) => {
    return emailService.sendNotificationEmail(options);
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS
    }
});

export const sendDeliveryNotification = async (email, orderId, status, message) => {
    const mailOptions = {
        from: `"Epilux Support" <${config.EMAIL_USER}>`,
        to: email,
        subject: `Order ${orderId} - ${status}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Order Update</h2>
                <p>Your order #${orderId} has been updated:</p>
                <p><strong>Status:</strong> ${status}</p>
                <p>${message}</p>
                <p>Thank you for choosing Epilux!</p>
                <hr>
                <p>If you have any questions, please contact our support team.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};
