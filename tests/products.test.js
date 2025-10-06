const request = require('supertest');
const app = require('../index');
const Product = require('../models/Product');
const mongoose = require('mongoose');

describe('Products API', () => {
  let adminToken;

  beforeAll(async () => {
    // Add a small delay to ensure user creation is fully complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if testHelpers exists
    if (!global.testHelpers) {
      throw new Error('global.testHelpers is not defined! Setup is not working.');
    }
    
    const adminUser = await global.testHelpers.createTestUser({ 
      email: 'admin-products@example.com',
      role: 'admin' 
    });
    
    if (!adminUser) {
      throw new Error('Failed to create admin user');
    }
    
    adminToken = await global.testHelpers.getAuthToken(adminUser);
    
    if (!adminToken) {
      throw new Error('Failed to generate admin token');
    }
    
    if (adminToken.length < 10) {
      throw new Error(`Admin token is too short: ${adminToken.length} characters`);
    }
  });

  describe('GET /api/products', () => {
    beforeEach(async () => {
      await global.testHelpers.createTestProduct({
        name: 'Laptop',
        price: 999.99,
        category: 'Electronics',
        brand: 'TechBrand',
      });
      await global.testHelpers.createTestProduct({
        name: 'Smartphone',
        price: 699.99,
        category: 'Electronics',
        brand: 'PhoneBrand',
      });
      await global.testHelpers.createTestProduct({
        name: 'T-Shirt',
        price: 19.99,
        category: 'Clothing',
        brand: 'FashionBrand',
      });
    });

    it('should get all products', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.products.length).toBe(3);
      expect(response.body.pagination.total).toBe(3);
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=2')
        .expect(200);

      expect(response.body.products.length).toBe(2);
      expect(response.body.pagination.pages).toBe(2);
    });

    it('should filter products by category', async () => {
      const response = await request(app)
        .get('/api/products?category=Electronics')
        .expect(200);

      expect(response.body.products.length).toBe(2);
      expect(response.body.products.every(p => p.category === 'Electronics')).toBe(true);
    });

    it('should filter products by brand', async () => {
      const response = await request(app)
        .get('/api/products?brand=TechBrand')
        .expect(200);

      expect(response.body.products.length).toBe(1);
      expect(response.body.products[0].brand).toBe('TechBrand');
    });

    it('should filter products by price range', async () => {
      const response = await request(app)
        .get('/api/products?minPrice=500&maxPrice=800')
        .expect(200);

      expect(response.body.products.length).toBe(1);
      expect(response.body.products[0].price).toBe(699.99);
    });

    it('should search products', async () => {
      const response = await request(app)
        .get('/api/products?search=laptop')
        .expect(200);

      expect(response.body.products.length).toBe(1);
      expect(response.body.products[0].name).toBe('Laptop');
    });
  });

  describe('GET /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => {
      testProduct = await global.testHelpers.createTestProduct();
    });

    it('should get product by ID', async () => {
      const response = await request(app)
        .get(`/api/products/${testProduct._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.product.name).toBe(testProduct.name);
    });

    it('should return 404 for non-existent product', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/products/${nonExistentId}`)
        .expect(404);
    });

    it('should return 400 for invalid ID format', async () => {
      await request(app)
        .get('/api/products/invalid-id')
        .expect(400);
    });
  });

  describe('POST /api/products', () => {
    it('should create product with admin token', async () => {
      console.log('Test execution - adminToken:', adminToken ? 'defined' : 'undefined');
      console.log('Test execution - adminToken value:', adminToken ? adminToken.substring(0, 20) + '...' : 'undefined');
      console.log('Test execution - adminToken length:', adminToken ? adminToken.length : 'undefined');
      
      const productData = {
        name: 'New Product',
        description: 'A new product',
        price: 149.99,
        sku: 'NEW-001',
        category: 'Electronics',
        brand: 'NewBrand',
        inventory: { quantity: 25 }
      };

      try {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(productData);
          
        console.log('Response status:', response.status);
        console.log('Response body:', response.body);
        
        if (response.status !== 201) {
          throw new Error(`Expected status 201 but got ${response.status}. Body: ${JSON.stringify(response.body)}`);
        }
      } catch (error) {
        console.log('Request error:', error.message);
        throw error;
      }

      expect(response.body.success).toBe(true);
      expect(response.body.product.name).toBe('New Product');
    });

    it('should not create product without authentication', async () => {
      const productData = { name: 'test', description: 'test', price: 1, sku: 'test', category: 'test', brand: 'test' };
      await request(app)
        .post('/api/products')
        .send(productData)
        .expect(401);
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('PUT /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => {
      testProduct = await global.testHelpers.createTestProduct();
    });

    it('should update product with admin token', async () => {
      const updateData = {
        name: 'Updated Product',
        price: 199.99
      };

      const response = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.product.name).toBe('Updated Product');
      expect(response.body.product.price).toBe(199.99);
    });
  });

  describe('DELETE /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => {
      testProduct = await global.testHelpers.createTestProduct();
    });

    it('should delete product with admin token', async () => {
      await request(app)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const deletedProduct = await Product.findById(testProduct._id);
      expect(deletedProduct).toBeNull();
    });
  });

  describe('GET /api/products/categories/list', () => {
    beforeEach(async () => {
      await global.testHelpers.createTestProduct({ category: 'Electronics' });
      await global.testHelpers.createTestProduct({ category: 'Clothing' });
    });

    it('should get list of categories', async () => {
      const response = await request(app)
        .get('/api/products/categories/list')
        .expect(200);

      expect(response.body.categories).toContain('Electronics');
      expect(response.body.categories).toContain('Clothing');
    });
  });

  describe('GET /api/products/brands/list', () => {
    beforeEach(async () => {
      await global.testHelpers.createTestProduct({ brand: 'TechBrand' });
      await global.testHelpers.createTestProduct({ brand: 'PhoneBrand' });
    });

    it('should get list of brands', async () => {
      const response = await request(app)
        .get('/api/products/brands/list')
        .expect(200);

      expect(response.body.brands).toContain('TechBrand');
      expect(response.body.brands).toContain('PhoneBrand');
    });
  });
});
