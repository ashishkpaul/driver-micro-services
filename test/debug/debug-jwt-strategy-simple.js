const axios = require('axios');

async function debugJWTStrategySimple() {
  try {
    console.log('Debugging JWT strategy simple...\n');

    // Step 1: Login
    const loginResponse = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    });

    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful!');
    console.log('Token:', token.substring(0, 50) + '...');

    // Step 2: Test with a simple endpoint that uses JWT auth but doesn't require admin scope
    console.log('\n--- Testing /drivers endpoint (JWT auth required but no admin scope) ---');
    try {
      const driversResponse = await axios.get('http://localhost:3001/drivers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ Drivers endpoint works:', driversResponse.status);
      console.log('Drivers count:', driversResponse.data.drivers?.length || 'No data');
    } catch (error) {
      console.log('❌ Drivers endpoint failed:', error.response?.status);
      console.log('Error data:', error.response?.data);
    }

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
  }
}

debugJWTStrategySimple();