import mongoose from 'mongoose';
import config from '../config/environment.js';

async function deleteTestUser() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Delete existing test user
    const result = await mongoose.connection.db.collection('users').deleteOne({ email: 'test@example.com' });
    console.log(`Deleted ${result.deletedCount} test user(s)`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

deleteTestUser();
