const axios = require('axios');

async function testAdminFind() {
  try {
    console.log('Testing admin find by ID...\n');

    // Test if we can access the admin users endpoint
    const response = await axios.get('http://localhost:3001/admin/users/649d6dde-27fe-456e-a287-cce70388f85b', {
      timeout: 5000
    });

    console.log('✅ Admin find by ID successful!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('❌ Admin find by ID failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Error Message:', error.message);
  }
}

testAdminFind();