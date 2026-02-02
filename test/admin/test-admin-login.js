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
    console.error('❌ Login failed:', error.response?.data || error.message);
    return null;
  }
}

async function testAdminCRUD(token) {
  if (!token) return;

  try {
    console.log('\nTesting admin CRUD operations...\n');

    // Test get all admins
    const response = await axios.get('http://localhost:3001/admin/users', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('✅ Get admins successful!');
    console.log('Admins:', response.data.admins);
    
  } catch (error) {
    console.error('❌ Admin CRUD failed:', error.response?.data || error.message);
  }
}

async function main() {
  const token = await testAdminLogin();
  await testAdminCRUD(token);
}

main();