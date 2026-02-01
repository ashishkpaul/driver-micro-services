#!/usr/bin/env ts-node

/**
 * Superadmin Initialization Script
 * 
 * This script creates a superadmin user in the database if one doesn't exist.
 * It should be run during initial deployment or when setting up a new environment.
 * 
 * Usage: npm run init:superadmin
 */

import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AdminUser } from '../src/entities/admin-user.entity';
import { PasswordService } from '../src/services/password.service';

async function initializeSuperAdmin() {
  console.log('🚀 Initializing Superadmin...\n');

  // Check required environment variables
  const email = process.env.SUPERADMIN_EMAIL || 'admin@company.com';
  const password = process.env.SUPERADMIN_PASSWORD;
  const autoCreate = process.env.SUPERADMIN_AUTO_CREATE === 'true';

  if (!autoCreate && !password) {
    console.log('⚠️  SUPERADMIN_AUTO_CREATE is not true and SUPERADMIN_PASSWORD is not set');
    console.log('💡 Set SUPERADMIN_AUTO_CREATE=true to auto-create superadmin');
    console.log('💡 Or set SUPERADMIN_PASSWORD to create with specific password');
    process.exit(1);
  }

  // Initialize database connection
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'driver_db',
    entities: [AdminUser],
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connection established');

    const adminRepository = dataSource.getRepository(AdminUser);
    const passwordService = new PasswordService();

    // Check if superadmin already exists
    const existingSuperAdmin = await adminRepository.findOne({
      where: { role: 'SUPER_ADMIN' as any }
    });

    if (existingSuperAdmin) {
      console.log('✅ Superadmin already exists');
      console.log(`📧 Email: ${existingSuperAdmin.email}`);
      console.log(`🆔 ID: ${existingSuperAdmin.id}`);
      console.log('💡 Use existing credentials or delete the superadmin to create a new one');
      process.exit(0);
    }

    // Generate password if not provided
    let finalPassword = password;
    if (!finalPassword) {
      finalPassword = passwordService.generateSecurePassword(16);
      console.log('🔐 Generated secure password (not stored in environment):');
      console.log(`   ${finalPassword}`);
    }

    // Validate password
    const passwordValidation = passwordService.validatePassword(finalPassword);
    if (!passwordValidation.isValid) {
      console.log('❌ Password does not meet security requirements:');
      passwordValidation.errors.forEach(error => console.log(`   - ${error}`));
      process.exit(1);
    }

    // Hash password
    const passwordHash = await passwordService.hash(finalPassword);

    // Create superadmin
    const superAdmin = adminRepository.create({
      email,
      passwordHash,
      role: 'SUPER_ADMIN' as any,
      isActive: true,
      lastLoginAt: undefined,
    });

    await adminRepository.save(superAdmin);

    console.log('\n✅ Superadmin created successfully!');
    console.log(`📧 Email: ${superAdmin.email}`);
    console.log(`🆔 ID: ${superAdmin.id}`);
    console.log(`🔑 Password: ${finalPassword}`);
    console.log('\n⚠️  IMPORTANT: Store these credentials securely!');
    console.log('💡 For production, use a strong, unique password');

  } catch (error) {
    console.error('❌ Failed to initialize superadmin:', error.message);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

// Run the script
if (require.main === module) {
  initializeSuperAdmin();
}

export { initializeSuperAdmin };