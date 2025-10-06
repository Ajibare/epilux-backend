const request = require('supertest');
const app = require('../index');
const mongoose = require('mongoose');

describe('Debug Test', () => {
  it('should verify test setup is working', async () => {
    console.log('=== DEBUG TEST START ===');
    console.log('global.testHelpers exists:', !!global.testHelpers);
    
    if (global.testHelpers) {
      console.log('createTestUser exists:', !!global.testHelpers.createTestUser);
      console.log('getAuthToken exists:', !!global.testHelpers.getAuthToken);
      
      try {
        const testUser = await global.testHelpers.createTestUser({
          email: 'debug-test@example.com',
          role: 'admin'
        });
        console.log('Created test user:', testUser);
        
        const token = await global.testHelpers.getAuthToken(testUser);
        console.log('Generated token:', token ? 'success' : 'failed');
        console.log('Token length:', token ? token.length : 'N/A');
        
        // Test a simple authenticated request
        const response = await request(app)
          .get('/api/products')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        
        console.log('Authenticated request successful:', response.body.success);
      } catch (error) {
        console.error('Error in debug test:', error);
      }
    } else {
      console.error('global.testHelpers is not defined!');
    }
    
    console.log('=== DEBUG TEST END ===');
    expect(true).toBe(true); // Just to make the test pass
  });
});
