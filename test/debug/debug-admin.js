const axios = require('axios');

async function debugAdminLogin() {
  try {
    console.log('Testing admin login with debug...\n');

    const response = await axios.post('http://localhost:3001/auth/admin/login', {
      email: 'admin@company.com',
      password: 'password'
    }, {
      timeout: 10000
    });

    console.log('✅ Login successful!');
    console.log('Token:', response.data.access_token);
    console.log('User:', response.data.user);
    
  } catch (error) {
    console.error('❌ Login failed:');
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugAdminLogin();