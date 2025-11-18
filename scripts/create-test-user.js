import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import config from '../config/environment.js';
import User from '../models/User.js';

async function createTestUser() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@example.com' });
    if (existingUser) {
      console.log('Test user already exists');
      console.log('User:', {
        id: existingUser._id,
        email: existingUser.email,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        role: existingUser.role
      });
      return;
    }

    // Create test user with all required fields
    const hashedPassword = await bcrypt.hash('password123', 12);
    const testUser = new User({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: hashedPassword,
      role: 'user',
      emailVerified: true,
      isActive: true,
      profile: {
        phone: '+1234567890'
      }
    });

    await testUser.save();
    console.log('Test user created successfully');
    console.log('User:', {
      id: testUser._id,
      email: testUser.email,
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      role: testUser.role
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createTestUser();
