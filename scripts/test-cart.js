const API_BASE = 'http://localhost:5000';

async function testCart() {
  try {
    console.log('=== Testing Cart with Authentication ===');
    
    // Step 1: Login to get token
    console.log('\n1. Logging in...');
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
    console.log('Login response:', {
      status: loginResponse.status,
      success: loginData.success,
      message: loginData.message,
      hasToken: !!loginData.token
    });
    
    if (!loginData.success || !loginData.token) {
      console.log('Login failed, cannot test cart');
      return;
    }
    
    const token = loginData.token;
    console.log('Login successful, token length:', token.length);
    
    // Step 2: Test cart endpoint
    console.log('\n2. Testing cart endpoint...');
    try {
      const cartResponse = await fetch(`${API_BASE}/api/cart`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const cartData = await cartResponse.json();
      console.log('Cart response:', {
        status: cartResponse.status,
        success: cartData.success,
        message: cartData.message,
        data: cartData.data ? {
          hasItems: cartData.data.items && cartData.data.items.length > 0,
          itemCount: cartData.data.totalItems || 0
        } : null
      });
    } catch (err) {
      console.log('Cart endpoint error:', err.message);
    }
    
    // Step 3: Try to add item to cart
    console.log('\n3. Adding item to cart...');
    try {
      // First, we need to get a valid product ID
      const productsResponse = await fetch(`${API_BASE}/api/products`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const productsData = await productsResponse.json();
      let productId = null;
      
      if (productsData.success && productsData.data && productsData.data.length > 0) {
        productId = productsData.data[0]._id;
        console.log('Using product ID:', productId);
      } else {
        // Use a dummy product ID for testing the authentication
        productId = '507f1f77bcf86cd799439011';
        console.log('Using dummy product ID for testing:', productId);
      }
      
      const addToCartResponse = await fetch(`${API_BASE}/api/cart/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: productId,
          quantity: 1
        })
      });
      
      const addToCartData = await addToCartResponse.json();
      console.log('Add to cart response:', {
        status: addToCartResponse.status,
        success: addToCartData.success,
        message: addToCartData.message,
        error: addToCartData.error || null
      });
      
    } catch (err) {
      console.log('Add to cart error:', err.message);
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testCart();
