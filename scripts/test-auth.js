const API_BASE = 'http://localhost:5000';

async function testAuth() {
  try {
    console.log('=== Testing Authentication Flow ===');
    
    // Test 1: Check if server is running
    console.log('\n1. Testing server connection...');
    try {
      const healthResponse = await fetch(`${API_BASE}/api/test-auth/test-auth`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('Expected error (no auth):', healthResponse.status, healthResponse.statusText);
    } catch (err) {
      console.log('Expected error (no auth):', err.message);
    }
    
    // Test 2: Try login to get a token
    console.log('\n2. Testing login...');
    let token = null;
    try {
      const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123'
        })
      });
      
      const loginData = await loginResponse.json();
      console.log('Login response:', loginData);
      
      if (loginData.success && loginData.token) {
        token = loginData.token;
        console.log('Login successful, got token:', token.substring(0, 20) + '...');
      }
    } catch (err) {
      console.log('Login error:', err.message);
    }
    
    if (token) {
      // Test 3: Use token to access protected route
      console.log('\n3. Testing protected route with token...');
      try {
        const authResponse = await fetch(`${API_BASE}/api/test-auth/test-auth`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        const authData = await authResponse.json();
        console.log('Protected route response:', authData);
      } catch (err) {
        console.log('Protected route error:', err.message);
      }
      
      // Test 4: Test cart endpoint
      console.log('\n4. Testing cart endpoint...');
      try {
        const cartResponse = await fetch(`${API_BASE}/api/cart`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        const cartData = await cartResponse.json();
        console.log('Cart response:', cartData);
      } catch (err) {
        console.log('Cart endpoint error:', err.message);
      }
      
    } else {
      console.log('Login failed, cannot test protected routes');
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testAuth();
