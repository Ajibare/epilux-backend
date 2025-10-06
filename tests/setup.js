// // eslint-disable-next-line @typescript-eslint/no-require-imports
// const { MongoMemoryServer } = require('mongodb-memory-server');
// // eslint-disable-next-line @typescript-eslint/no-require-imports
// const mongoose = require('mongoose');
// // const config = require('../config/environment');

// let mongoServer;

// beforeAll(async () => {
//   // Start in-memory MongoDB server
//   mongoServer = await MongoMemoryServer.create();
//   const mongoUri = mongoServer.getUri();
  
//   // Connect to the in-memory database
//   await mongoose.connect(mongoUri, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   });
// });

// afterAll(async () => {
//   // Disconnect from the database
//   await mongoose.disconnect();
  
//   // Stop the in-memory MongoDB server
//   if (mongoServer) {
//     await mongoServer.stop();
//   }
// });

// beforeEach(async () => {
//   // Clear all collections before each test
//   const collections = mongoose.connection.collections;
//   for (const key in collections) {
//     const collection = collections[key];
//     await collection.deleteMany({});
//   }
// });

// // Global test helpers
// global.testHelpers = {
//   // Helper to create a test user
//   createTestUser: async (userData = {}) => {
//     // eslint-disable-next-line @typescript-eslint/no-require-imports
//     const User = require('../models/User');
//     const defaultUser = {
//       email: 'test@example.com',
//       password: 'Password123',
//       firstName: 'Test',
//       lastName: 'User',
//       ...userData
//     };
    
//     const user = new User(defaultUser);
//     await user.save();
//     return user;
//   },

//   // Helper to create a test product
//   createTestProduct: async (productData = {}) => {
//     // eslint-disable-next-line @typescript-eslint/no-require-imports
//     const Product = require('../models/Product');
//     const defaultProduct = {
//       name: 'Test Product',
//       description: 'A test product',
//       price: 99.99,
//       category: 'Electronics',
//       brand: 'Test Brand',
//       inventory: {
//         quantity: 10,
//         sku: 'TEST-001'
//       },
//       ...productData
//     };
    
//     const product = new Product(defaultProduct);
//     await product.save();
//     return product;
//   },

//   // Helper to get auth token for a user
//   getAuthToken: async (user) => {
//     // eslint-disable-next-line @typescript-eslint/no-require-imports
//     const { generateToken } = require('../middleware/auth');
//     return generateToken(user._id, user.role);
//   }
// };







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



