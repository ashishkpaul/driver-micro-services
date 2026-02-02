const axios = require('axios');

async function testAdminLoginDetailed() {
  try {
    console.log('Testing admin login with detailed response...\n');

    const response = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    });

    console.log('✅ Login successful!');
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Login failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
    return null;
  }
}

testAdminLoginDetailed();