const axios = require('axios');

async function testAdminDirect() {
  try {
    console.log('Testing admin direct access...\n');

    // Test if we can access the admin users endpoint
    const response = await axios.get('http://localhost:3001/admin/users', {
      timeout: 5000
    });

    console.log('✅ Admin users endpoint accessible!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('❌ Admin users endpoint failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
  }
}

testAdminDirect();