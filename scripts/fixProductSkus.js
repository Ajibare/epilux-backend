import mongoose from 'mongoose';
import Product from '../models/Product.js';
import config from '../config/environment.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected...');
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
};

const generateSku = () => {
  return `SKU-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString().slice(-4)}`;
};

const fixProductSkus = async () => {
  try {
    // Find all products with null or empty SKU
    const products = await Product.find({
      $or: [
        { sku: { $in: [null, ''] } },
        { sku: { $exists: false } }
      ]
    });

    console.log(`Found ${products.length} products with invalid SKUs`);

    // Update each product with a new SKU
    for (const product of products) {
      const newSku = generateSku();
      console.log(`Updating product ${product._id} with SKU: ${newSku}`);
      
      await Product.findByIdAndUpdate(
        product._id,
        { $set: { sku: newSku } },
        { new: true, runValidators: true }
      );
    }

    console.log('SKU update completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error updating product SKUs:', error);
    process.exit(1);
  }
};

// Run the migration
(async () => {
  await connectDB();
  await fixProductSkus();
})();
