const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const { generateToken } = require('../middleware/auth');


let mongoServer;

beforeAll(async () => {
  // Check if already connected
  if (mongoose.connection.readyState === 0) {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  }
});

afterAll(async () => {
  // Close all mongoose connections only if we're connected
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  // Stop in-memory server
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

global.testHelpers = {
  createTestUser: async (userData = {}) => {
    const defaultUser = {
      email: 'test@example.com',
      password: 'Password123',
      firstName: 'Test',
      lastName: 'User',
      ...userData
    };
    const user = new User(defaultUser);
    await user.save();
    return user;
  },

  createTestProduct: async (productData = {}) => {
    const defaultProduct = {
      name: 'Test Product',
      description: 'A test product',
      price: 99.99,
      sku: `TEST-${Math.random().toString(36).substr(2, 9)}`,
      category: 'Electronics',
      brand: 'Test Brand',
      inventory: { quantity: 10 },
      ...productData
    };
    const product = new Product(defaultProduct);
    await product.save();
    return product;
  },

  getAuthToken: async (user) => {
    return generateToken(user._id, user.role);
  }
};



