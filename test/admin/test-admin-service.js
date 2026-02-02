const { DataSource } = require('typeorm');
const { AdminUser } = require('./dist/entities/admin-user.entity');

async function testAdminService() {
  console.log('Testing AdminService directly...\n');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'driver_user',
    password: process.env.DB_PASSWORD || 'driver_password',
    database: process.env.DB_NAME || 'driver_service',
    entities: ['./dist/**/*.entity.js'],
    ssl: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connection established');

    const adminRepository = dataSource.getRepository(AdminUser);

    // Test finding admin by email
    const admin = await adminRepository.findOne({
      where: { email: 'admin@company.com' }
    });

    if (admin) {
      console.log('✅ Admin found!');
      console.log('Admin ID:', admin.id);
      console.log('Admin Email:', admin.email);
      console.log('Admin Role:', admin.role);
      console.log('Admin Active:', admin.isActive);
      console.log('Password Hash:', admin.passwordHash.substring(0, 50) + '...');
    } else {
      console.log('❌ Admin not found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await dataSource.destroy();
  }
}

testAdminService();