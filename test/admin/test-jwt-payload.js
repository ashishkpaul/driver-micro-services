const axios = require('axios');

async function testJWTPayload() {
  try {
    console.log('Testing JWT payload...\n');

    // Step 1: Login
    const loginResponse = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    });

    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful!');
    console.log('Token:', token.substring(0, 50) + '...');

    // Step 2: Decode JWT to see payload
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token);
    console.log('✅ JWT decoded!');
    console.log('JWT payload:', JSON.stringify(decoded, null, 2));

    // Step 3: Test with admin users endpoint (should work for superadmin)
    const adminUsersResponse = await axios.get('http://localhost:3001/admin/users', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Admin users endpoint accessible with admin token!');
    console.log('Admin users count:', adminUsersResponse.data.admins.length);

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
  }
}

testJWTPayload();