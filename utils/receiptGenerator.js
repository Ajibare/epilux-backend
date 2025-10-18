// utils/receiptGenerator.js
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateWithdrawalReceipt = async (withdrawal, user) => {
    return new Promise((resolve, reject) => {
        try {
            const receiptDir = path.join(__dirname, '../receipts');
            if (!fs.existsSync(receiptDir)) {
                fs.mkdirSync(receiptDir, { recursive: true });
            }

            const receiptPath = path.join(receiptDir, `withdrawal_${withdrawal._id}.pdf`);
            const doc = new PDFDocument({ size: 'A4', margin: 50 });

            // Create write stream
            const stream = fs.createWriteStream(receiptPath);
            doc.pipe(stream);

            // Header
            doc
                .image(path.join(__dirname, '../public/logo.png'), 50, 45, { width: 50 })
                .fillColor('#444444')
                .fontSize(20)
                .text('Epilux', 110, 57)
                .fontSize(10)
                .text('123 Business Street', 200, 65, { align: 'right' })
                .text('Lagos, Nigeria', 200, 80, { align: 'right' })
                .moveDown();

            // Title
            doc
                .fontSize(20)
                .text('Withdrawal Receipt', 50, 120)
                .fontSize(10)
                .text(`Receipt #${withdrawal._id}`, 50, 150)
                .text(`Date: ${new Date(withdrawal.processedAt).toLocaleDateString()}`, 50, 165)
                .moveDown();

            // User Information
            doc
                .fontSize(14)
                .text('User Information', 50, 200)
                .fontSize(10)
                .text(`Name: ${user.name}`, 50, 225)
                .text(`Email: ${user.email}`, 50, 240)
                .text(`User ID: ${user._id}`, 50, 255)
                .moveDown();

            // Transaction Details
            doc
                .fontSize(14)
                .text('Transaction Details', 50, 300)
                .fontSize(10)
                .text(`Amount: ₦${withdrawal.amount.toLocaleString()}.00`, 50, 325)
                .text(`Status: ${withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}`, 50, 340)
                .text(`Requested: ${new Date(withdrawal.requestedAt).toLocaleString()}`, 50, 355)
                .text(`Processed: ${withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleString() : 'Pending'}`, 50, 370)
                .moveDown();

            // Footer
            doc
                .fontSize(10)
                .text('Thank you for using Epilux Services.', 50, 650, { align: 'center' })
                .text('For any inquiries, please contact support@epilux.com', 50, 665, { align: 'center' })
                .text('© 2025 Epilux. All rights reserved.', 50, 680, { align: 'center' });

            // Finalize the PDF and end the stream
            doc.end();

            stream.on('finish', () => {
                resolve(receiptPath);
            });

            stream.on('error', (err) => {
                reject(err);
            });

        } catch (error) {
            reject(error);
        }
    });
};

export const getReceiptPath = (withdrawalId) => {
    return path.join(__dirname, `../receipts/withdrawal_${withdrawalId}.pdf`);
};