-- Create Superadmin User SQL Script
-- This script creates a superadmin user directly in the database

-- First, create a default city if it doesn't exist
INSERT INTO cities (id, name, code, center, created_at, updated_at) 
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Default City', 'DEFAULT', POINT(0, 0), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create the superadmin user
INSERT INTO admin_users (id, email, password_hash, role, is_active, city_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@company.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: "password"
  'SUPER_ADMIN',
  true,
  '00000000-0000-0000-0000-000000000001',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  city_id = EXCLUDED.city_id,
  updated_at = NOW();

-- Verify the creation
SELECT id, email, role, is_active, city_id, created_at, updated_at 
FROM admin_users 
WHERE role = 'SUPER_ADMIN';
