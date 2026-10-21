import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Messages submitted through the public "Contact us" form
const contactMessageSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 30 },
    subject: { type: String, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    inquiryType: { type: String, trim: true, maxlength: 50, default: 'general' },
    status: { type: String, enum: ['new', 'read', 'resolved'], default: 'new' },
    ip: { type: String }
}, { timestamps: true });

contactMessageSchema.index({ status: 1, createdAt: -1 });

export default model('ContactMessage', contactMessageSchema);
