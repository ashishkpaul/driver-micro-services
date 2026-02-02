const axios = require('axios');

async function testJWTValidation() {
  try {
    console.log('Testing JWT validation...\n');

    // Step 1: Login
    const loginResponse = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    });

    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful!');
    console.log('Token:', token.substring(0, 50) + '...');

    // Step 2: Test with a simple endpoint that requires authentication
    const healthResponse = await axios.get('http://localhost:3001/health', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Health endpoint accessible with admin token!');
    console.log('Health response:', healthResponse.data);

    // Step 3: Test with driver endpoint
    const driversResponse = await axios.get('http://localhost:3001/drivers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Drivers endpoint accessible with admin token!');
    console.log('Drivers count:', driversResponse.data.length);

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
  }
}

testJWTValidation();