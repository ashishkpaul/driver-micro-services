const axios = require('axios');

async function debugJWTStrategy() {
  try {
    console.log('Debugging JWT strategy...\n');

    // Step 1: Login
    const loginResponse = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    });

    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful!');
    console.log('Token:', token.substring(0, 50) + '...');

    // Step 2: Test with a simple endpoint that doesn't require admin scope
    console.log('\n--- Testing /health endpoint (no auth required) ---');
    const healthResponse = await axios.get('http://localhost:3001/health');
    console.log('✅ Health endpoint works:', healthResponse.status);

    // Step 3: Test with admin endpoint without token
    console.log('\n--- Testing /admin/users without token ---');
    try {
      const noTokenResponse = await axios.get('http://localhost:3001/admin/users');
      console.log('❌ Should have failed:', noTokenResponse.status);
    } catch (error) {
      console.log('✅ Correctly rejected without token:', error.response?.status);
    }

    // Step 4: Test with admin endpoint with token
    console.log('\n--- Testing /admin/users with token ---');
    try {
      const adminResponse = await axios.get('http://localhost:3001/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ Admin endpoint works:', adminResponse.status);
      console.log('Admin users count:', adminResponse.data.admins?.length || 'No data');
    } catch (error) {
      console.log('❌ Admin endpoint failed:', error.response?.status);
      console.log('Error data:', error.response?.data);
    }

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
  }
}

debugJWTStrategy();