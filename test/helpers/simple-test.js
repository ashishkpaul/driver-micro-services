const axios = require('axios');

async function testAdminLogin() {
  try {
    console.log('Testing admin login...\n');

    const response = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    });

    console.log('✅ Login successful!');
    console.log('Token:', response.data.access_token);
    console.log('User:', response.data.user);
    
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Login failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Headers:', error.response?.headers);
    return null;
  }
}

testAdminLogin();