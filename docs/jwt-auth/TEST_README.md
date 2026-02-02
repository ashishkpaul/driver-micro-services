# Driver Microservices E2E Test Suite

This directory contains comprehensive end-to-end tests for the driver microservices application, focusing on authentication, authorization, and CRUD operations.

## Files

- **test/jwt-auth/test-driver-microservices-e2e.js** - Complete E2E test suite covering all major functionality
- **test/debug/debug-jwt-auth.js** - Focused JWT authentication debugging script
- **README.md** - This file

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Running microservice** on `http://localhost:3001`
3. **Database** with migrations applied
4. **Superadmin user** created with credentials:
   - Email: `admin@company.com`
   - Password: `password`

### Installing Dependencies

```bash
npm install axios jsonwebtoken
```

Or if you're in the main project directory:

```bash
# The axios dependency should already be in package.json
# Just install jsonwebtoken for the debug script
npm install --save-dev jsonwebtoken
```

## Quick Start

### Option 1: Run Full E2E Test Suite

This comprehensive test suite covers:
- Admin authentication
- JWT token generation and validation
- Role-based access control (RBAC)
- Driver CRUD operations
- Unauthorized access attempts
- Health check endpoints
- Token security

```bash
node test-driver-microservices-e2e.js
```

**Expected Output:**
```
🚀 Driver Microservices E2E Test Suite
📍 Base URL: http://localhost:3001
🕐 Started at: 2024-01-15T10:30:00.000Z

============================================================
Test 1: Superadmin Login & JWT Generation
============================================================
✅ Superadmin login successful
...
============================================================
Test Summary
============================================================

Total Tests: 25
Passed: 25
Failed: 0

Pass Rate: 100.00%
```

### Option 2: Run JWT Debug Script (Recommended for Troubleshooting)

If you're experiencing 401 errors, run this diagnostic script first:

```bash
node debug-jwt-auth.js
```

This script will:
1. Perform admin login and capture the JWT token
2. Decode and analyze the token payload
3. Test various endpoints with detailed error reporting
4. Identify common authentication issues
5. Provide specific recommendations

**Sample Output:**
```
======================================================================
Step 1: Admin Login
======================================================================
✅ Login successful!
Token (first 80 chars): eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5YjNhZjU4...

📋 Token Payload:
{
  "userId": "9b3af58e-...",
  "email": "admin@company.com",
  "role": "SUPER_ADMIN",
  "cityId": "...",
  "sub": "9b3af58e-...",
  "iat": 1705319400,
  "exp": 1705405800
}

🔍 Token Structure Analysis:
- userId: 9b3af58e-... ✅
- email: admin@company.com ✅
- role: SUPER_ADMIN ✅
- cityId: ... ✅
- sub: 9b3af58e-... ✅
- type: MISSING ⚠️
...
```

## Common Issues and Solutions

### Issue 1: 401 Unauthorized on /drivers endpoint

**Symptoms:**
```
❌ Drivers endpoint failed: 401
Error data: { message: 'Unauthorized', statusCode: 401 }
```

**Root Cause:**
The JWT token payload is missing the `type: 'admin'` field, which the `AdminScopeGuard` requires.

**Solution:**
Update `src/auth/auth.service.ts`, in the `adminLogin()` method:

```typescript
async adminLogin(admin: AdminUser) {
  const payload = {
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    cityId: admin.cityId,
    sub: admin.id,
    type: 'admin', // ADD THIS LINE
  };

  return {
    accessToken: this.jwtService.sign(payload),
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      cityId: admin.cityId,
    },
  };
}
```

### Issue 2: JWT_SECRET Mismatch

**Symptoms:**
```
❌ Token validation failed
```

**Solution:**
Ensure the JWT_SECRET is consistent across:
1. `.env` file: `JWT_SECRET=your-secret-key`
2. `src/auth/jwt.strategy.ts`: `secretOrKey: process.env.JWT_SECRET`
3. `src/auth/auth.module.ts`: `secret: process.env.JWT_SECRET`

### Issue 3: Guards in Wrong Order

**Symptoms:**
```
❌ Missing authentication
TypeError: Cannot read property 'type' of undefined
```

**Solution:**
Always place `AuthGuard('jwt')` before `AdminScopeGuard`:

```typescript
@Get()
@UseGuards(AuthGuard('jwt'), AdminScopeGuard) // Correct order
findAll() {
  return this.driversService.findAll();
}
```

### Issue 4: Missing City Scope

**Symptoms:**
```
❌ Missing city scope
```

**Solution:**
For SUPER_ADMIN, the guard should bypass city scope checks. Verify `src/auth/admin-scope.guard.ts`:

```typescript
// SUPER_ADMIN bypasses all scope checks
if (adminUser.role === Role.SUPER_ADMIN) {
  return true;
}
```

## Test Coverage

The complete test suite covers:

### Authentication & Authorization (10 tests)
- ✅ Superadmin login
- ✅ Invalid password rejection
- ✅ Non-existent user rejection
- ✅ Missing credentials rejection
- ✅ Valid JWT token acceptance
- ✅ Request without token rejection
- ✅ Invalid token rejection
- ✅ Malformed auth header rejection
- ✅ SUPER_ADMIN access to admin endpoints
- ✅ SUPER_ADMIN access to driver endpoints

### Driver CRUD Operations (6 tests)
- ✅ Create driver
- ✅ Get all drivers
- ✅ Get single driver by ID
- ✅ Activate driver
- ✅ Deactivate driver
- ✅ Delete driver

### Security & Edge Cases (4 tests)
- ✅ Drivers endpoint without auth rejected
- ✅ Create driver without auth rejected
- ✅ Admin users endpoint without auth rejected
- ✅ Health check endpoint accessible
- ✅ Expired token rejected

## Advanced Usage

### Running Tests Against Different Environments

```bash
# Development
BASE_URL=http://localhost:3001 node test-driver-microservices-e2e.js

# Staging
BASE_URL=https://staging.example.com node test-driver-microservices-e2e.js

# Production (use with caution!)
BASE_URL=https://api.example.com node test-driver-microservices-e2e.js
```

### Running Specific Test Sections

You can modify the main test runner to run specific tests:

```javascript
// In runTests() function, comment out tests you don't want:
async function runTests() {
  const superadminToken = await testSuperadminLogin();
  // await testInvalidLogin();
  // await testJWTValidation(superadminToken);
  await testDriverCRUD(superadminToken); // Run only this test
  // ...
}
```

### Custom Test Configuration

Edit the config object at the top of the test files:

```javascript
const config = {
  superadmin: {
    email: 'your-admin@company.com',
    password: 'your-secure-password'
  },
  driver: {
    name: 'Custom Test Driver',
    phone: '+1234567890',
    email: 'custom-driver@test.com'
  }
};
```

## Interpreting Test Results

### Successful Run
```
============================================================
Test Summary
============================================================

Total Tests: 25
Passed: 25
Failed: 0

Pass Rate: 100.00%
```

Exit code: `0`

### Failed Tests
```
============================================================
Test Summary
============================================================

Total Tests: 25
Passed: 20
Failed: 5

Pass Rate: 80.00%

❌ Failed Tests:
   - SUPER_ADMIN access to drivers endpoint
     Token validation failed: Invalid token payload
   - Create driver
     Missing required field: cityId
```

Exit code: `1`

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migrations
        run: npm run migration:run
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USER: postgres
          DB_PASSWORD: postgres
          DB_NAME: driver_db_test
      
      - name: Initialize superadmin
        run: npm run init:superadmin
        env:
          SUPERADMIN_AUTO_CREATE: true
      
      - name: Start service
        run: npm run start:prod &
        env:
          PORT: 3001
      
      - name: Wait for service
        run: npx wait-on http://localhost:3001/health
      
      - name: Run E2E tests
        run: node test-driver-microservices-e2e.js
```

## Troubleshooting

### Service Not Running
```bash
# Check if service is running
curl http://localhost:3001/health

# If not, start it:
npm run start:dev
```

### Database Not Initialized
```bash
# Run migrations
npm run migration:run

# Initialize superadmin
npm run init:superadmin
```

### Port Already in Use
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or change the BASE_URL in test files
```

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Use descriptive test names
3. Add proper error handling
4. Update test coverage documentation
5. Ensure tests are idempotent (can run multiple times)

## Support

For issues or questions:
1. Check the debug output from `debug-jwt-auth.js`
2. Review the common issues section
3. Check application logs: `logs/error.log`
4. Enable debug mode: `NODE_ENV=development DEBUG=* node test-driver-microservices-e2e.js`
