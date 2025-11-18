import mongoose from 'mongoose';
import config from '../config/environment.js';

async function cleanupNullCarts() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find and delete carts with null user
    const result = await mongoose.connection.db.collection('carts').deleteMany({ user: null });
    console.log(`Deleted ${result.deletedCount} carts with null user`);

    // Also check for any carts with undefined user
    const undefinedResult = await mongoose.connection.db.collection('carts').deleteMany({ user: { $exists: false } });
    console.log(`Deleted ${undefinedResult.deletedCount} carts with undefined user`);

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Cleanup error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

cleanupNullCarts();
