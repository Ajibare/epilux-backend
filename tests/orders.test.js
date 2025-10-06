




const request = require('supertest');
const app = require('../index');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');

describe('Orders API', () => {
  let userToken;
  let adminToken;
  let testProduct;
  let testUser;

  beforeAll(async () => {
    // Create users and tokens once for all tests
    testUser = await global.testHelpers.createTestUser({
      email: 'user-orders@example.com',
    });
    userToken = await global.testHelpers.getAuthToken(testUser);

    const adminUser = await global.testHelpers.createTestUser({
      email: 'admin-orders@example.com',
      role: 'admin',
    });
    adminToken = await global.testHelpers.getAuthToken(adminUser);
  });

  beforeEach(async () => {
    // Create a fresh product for each test
    testProduct = await global.testHelpers.createTestProduct({
      inventory: { quantity: 10 },
    });
  });

  describe('POST /api/orders', () => {
    it('should create an order successfully', async () => {
      const orderData = {
        items: [{ product: testProduct._id, quantity: 2 }],
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          country: 'Testland',
          zipCode: '12345',
        },
        paymentMethod: 'card',
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.order.userId).toBe(testUser._id.toString());
      expect(response.body.order.total).toBeCloseTo(219.98);

      const updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.inventory.quantity).toBe(8);
    });

    it('should calculate shipping for orders under $100', async () => {
      const cheapProduct = await global.testHelpers.createTestProduct({ price: 10.00 });
      const orderData = {
        items: [{ product: cheapProduct._id, quantity: 1 }],
        shippingAddress: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          country: 'Testland',
          zipCode: '12345',
        },
        paymentMethod: 'card',
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body.order.shipping).toBe(15);
      expect(response.body.order.total).toBeCloseTo(26);
    });
  });

  describe('GET /api/orders', () => {
    let order1, order2;

    beforeEach(async () => {
      // Add a small delay to ensure user creation is fully complete
  await new Promise(resolve => setTimeout(resolve, 100));

  
      order1 = await Order.create({ 
        userId: testUser._id,
        orderNumber: 'ORD-001', 
        items: [], 
        subtotal: 100,  // Add this
        tax: 10,        // Add this
        shipping: 0,    // Add this
        total: 110,     // Calculate total as subtotal + tax + shipping
        shippingAddress: { street: '123 Test St', city: 'Test City', state: 'TS', country: 'Testland', zipCode: '12345' }, 
        paymentMethod: 'card', 
        status: 'pending', 
        paymentStatus: 'pending' 
      });
      order2 = await Order.create({ 
        userId: testUser._id, 
        orderNumber: 'ORD-002', 
        items: [], 
        subtotal: 200,  
        tax: 20,        
        shipping: 0,    
        total: 220,    
        shippingAddress: { street: '123 Test St', city: 'Test City', state: 'TS', country: 'Testland', zipCode: '12345' }, 
        paymentMethod: 'card', 
        status: 'shipped', 
        paymentStatus: 'paid' 
      });
    });

    it('should get a user\'s own orders', async () => {
      const response = await request(app)
        .get('/api/orders/my-orders')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      
      expect(response.body.orders.length).toBe(2);
    });

    it('should get a single order by ID', async () => {
      const response = await request(app)
        .get(`/api/orders/${order1._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.order._id).toBe(order1._id.toString());
    });

    it('should not allow a user to see another user\'s order', async () => {
      const otherUser = await global.testHelpers.createTestUser({ email: 'other@example.com' });
      const otherUserToken = await global.testHelpers.getAuthToken(otherUser);

      await request(app)
        .get(`/api/orders/${order1._id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });

    it('should allow an admin to see any order', async () => {
      await request(app)
        .get(`/api/orders/${order1._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should get all orders for an admin', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.orders.length).toBe(2);
    });

    it('should filter orders by status for admin', async () => {
      const response = await request(app)
        .get('/api/orders?status=shipped')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.orders.length).toBe(1);
      expect(response.body.orders[0].status).toBe('shipped');
    });
  });

  describe('PUT /api/orders', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await Order.create({ userId: testUser._id, orderNumber: 'ORD-001', items: [], total: 100, shippingAddress: { street: '123 Test St', city: 'Test City', state: 'TS', country: 'Testland', zipCode: '12345' }, paymentMethod: 'card', status: 'pending', paymentStatus: 'pending' });
    });

    it('should update order status for admin', async () => {
      const response = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' })
        .expect(200);
      
      expect(response.body.order.status).toBe('shipped');
    });

    it('should update payment status for admin', async () => {
      const response = await request(app)
        .put(`/api/orders/${testOrder._id}/payment-status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentStatus: 'paid' })
        .expect(200);

      expect(response.body.order.paymentStatus).toBe('paid');
    });
  });
});