// // scripts/fix-carts.js
// import mongoose from 'mongoose';
// import Cart from '../models/Cart.js';
// import dotenv from 'dotenv';

// dotenv.config();

// async function fixCarts() {
//   try {
//     // Connect to MongoDB
//     await mongoose.connect(process.env.MONGODB_URI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//     });

//     console.log('Connected to MongoDB');

//     // Drop the unique index
//     console.log('Dropping unique index on userId...');
//     await Cart.collection.dropIndex('userId_1').catch(console.log);

//     // Find all carts with null or missing user
//     const nullUserCarts = await Cart.find({
//       $or: [
//         { user: null },
//         { user: { $exists: false } }
//       ]
//     });

//     console.log(`Found ${nullUserCarts.length} carts with null or missing user`);

//     // Delete all carts with null or missing user
//     if (nullUserCarts.length > 0) {
//       await Cart.deleteMany({
//         $or: [
//           { user: null },
//           { user: { $exists: false } }
//         ]
//       });
//       console.log(`Deleted ${nullUserCarts.length} carts with null or missing user`);
//     }

//     // Recreate the index with proper options
//     console.log('Recreating unique index on userId...');
//     await Cart.collection.createIndex({ user: 1 }, { 
//       unique: true,
//       partialFilterExpression: { user: { $type: 'objectId' } }
//     });

//     console.log('Successfully fixed cart indexes and cleaned up null user carts');
//     process.exit(0);
//   } catch (error) {
//     console.error('Error fixing carts:', error);
//     process.exit(1);
//   }
// }

// fixCarts();

// scripts/fix-carts.js
import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixCarts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Drop the existing index by name
    console.log('Dropping existing index...');
    try {
      await Cart.collection.dropIndex('user_1');
      console.log('Dropped existing index');
    } catch (dropError) {
      console.log('Could not drop index (might not exist):', dropError.message);
    }

    // Find and clean up any carts with null or missing user
    console.log('Cleaning up null user carts...');
    const deleteResult = await Cart.deleteMany({
      $or: [
        { user: null },
        { user: { $exists: false } }
      ]
    });
    console.log(`Cleaned up ${deleteResult.deletedCount} carts with null or missing user`);

    // Create a new index with a specific name
    console.log('Creating new index...');
    await Cart.collection.createIndex(
      { user: 1 }, 
      { 
        name: 'user_unique_index',
        unique: true,
        partialFilterExpression: { user: { $type: 'objectId' } }
      }
    );
    console.log('Successfully created new index');

    console.log('✅ Cart indexes and data have been fixed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing carts:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

fixCarts();