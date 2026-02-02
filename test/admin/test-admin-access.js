const axios = require('axios');

async function testAdminAccess() {
  try {
    console.log('Testing admin login and access...\n');

    // Step 1: Login
    const loginResponse = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    });

    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful!');
    console.log('Token:', token.substring(0, 50) + '...');

    // Step 2: Test accessing admin users endpoint
    const usersResponse = await axios.get('http://localhost:3001/admin/users', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Admin users endpoint accessible!');
    console.log('Users count:', usersResponse.data.admins.length);
    console.log('Total:', usersResponse.data.total);

    // Step 3: Test accessing admin user by ID
    const userId = loginResponse.data.admin.id;
    const userResponse = await axios.get(`http://localhost:3001/admin/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Admin user by ID accessible!');
    console.log('User email:', userResponse.data.email);
    console.log('User role:', userResponse.data.role);

    console.log('\n🎉 All admin functionality working correctly!');

  } catch (error) {
    console.error('❌ Test failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
  }
}

testAdminAccess();