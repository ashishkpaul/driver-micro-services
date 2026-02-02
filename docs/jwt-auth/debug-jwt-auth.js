/**
 * JWT Authentication Debug Script
 * 
 * This script helps diagnose JWT authentication issues in the driver microservices.
 * It performs detailed token analysis and endpoint testing to identify where
 * authentication is failing.
 */

const axios = require('axios');
const jwt = require('jsonwebtoken'); // You may need to: npm install jsonwebtoken

const BASE_URL = 'http://localhost:3001';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(70));
  log(title, colors.blue);
  console.log('='.repeat(70));
}

async function debugJWTAuthentication() {
  section('Step 1: Admin Login');
  
  let token = null;
  let decodedToken = null;
  
  // Step 1: Login and get token
  try {
    const loginResponse = await axios.post(`${BASE_URL}/auth/admin/login`, {
      email: 'admin@company.com',
      password: 'password'
    });

    token = loginResponse.data.accessToken;
    log('✅ Login successful!', colors.green);
    log(`Token (first 80 chars): ${token.substring(0, 80)}...`, colors.cyan);
    
    // Decode token to inspect payload
    try {
      decodedToken = jwt.decode(token);
      log('\n📋 Token Payload:', colors.yellow);
      console.log(JSON.stringify(decodedToken, null, 2));
      
      // Check token structure
      log('\n🔍 Token Structure Analysis:', colors.yellow);
      log(`- userId: ${decodedToken.userId || 'MISSING'}`, decodedToken.userId ? colors.green : colors.red);
      log(`- email: ${decodedToken.email || 'MISSING'}`, decodedToken.email ? colors.green : colors.red);
      log(`- role: ${decodedToken.role || 'MISSING'}`, decodedToken.role ? colors.green : colors.red);
      log(`- cityId: ${decodedToken.cityId || 'MISSING'}`, decodedToken.cityId ? colors.green : colors.red);
      log(`- sub: ${decodedToken.sub || 'MISSING'}`, decodedToken.sub ? colors.green : colors.red);
      log(`- type: ${decodedToken.type || 'MISSING'}`, colors.yellow);
      log(`- iat: ${decodedToken.iat ? new Date(decodedToken.iat * 1000).toISOString() : 'MISSING'}`, decodedToken.iat ? colors.green : colors.red);
      log(`- exp: ${decodedToken.exp ? new Date(decodedToken.exp * 1000).toISOString() : 'MISSING'}`, decodedToken.exp ? colors.green : colors.red);
      
      // Verify token hasn't expired
      if (decodedToken.exp) {
        const now = Math.floor(Date.now() / 1000);
        const isExpired = now > decodedToken.exp;
        log(`- Token expired: ${isExpired}`, isExpired ? colors.red : colors.green);
        if (isExpired) {
          log('  ⚠️  Token has already expired!', colors.red);
        } else {
          const timeLeft = decodedToken.exp - now;
          log(`  Valid for: ${Math.floor(timeLeft / 3600)} hours, ${Math.floor((timeLeft % 3600) / 60)} minutes`, colors.green);
        }
      }
    } catch (decodeErr) {
      log(`❌ Failed to decode token: ${decodeErr.message}`, colors.red);
    }

  } catch (err) {
    log(`❌ Login failed: ${err.response?.data?.message || err.message}`, colors.red);
    log('Status code: ' + (err.response?.status || 'N/A'), colors.red);
    return;
  }

  // Step 2: Test various endpoints with the token
  section('Step 2: Testing Endpoints with JWT Token');

  const endpoints = [
    {
      name: 'Health Check (No Auth Required)',
      method: 'GET',
      url: `${BASE_URL}/health`,
      requiresAuth: false,
      requiresAdminScope: false
    },
    {
      name: 'Admin Users List (JWT + AdminScope Required)',
      method: 'GET',
      url: `${BASE_URL}/admin/users`,
      requiresAuth: true,
      requiresAdminScope: true
    },
    {
      name: 'Drivers List (JWT + AdminScope Required)',
      method: 'GET',
      url: `${BASE_URL}/drivers`,
      requiresAuth: true,
      requiresAdminScope: true
    },
    {
      name: 'Available Drivers (JWT Required, No AdminScope)',
      method: 'GET',
      url: `${BASE_URL}/drivers/available`,
      requiresAuth: true,
      requiresAdminScope: false
    }
  ];

  for (const endpoint of endpoints) {
    log(`\n📍 Testing: ${endpoint.name}`, colors.magenta);
    log(`   Method: ${endpoint.method}`, colors.cyan);
    log(`   URL: ${endpoint.url}`, colors.cyan);
    log(`   Requires Auth: ${endpoint.requiresAuth}`, colors.cyan);
    log(`   Requires AdminScope: ${endpoint.requiresAdminScope}`, colors.cyan);

    // Test with token
    try {
      const config = {
        method: endpoint.method,
        url: endpoint.url,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const response = await axios(config);
      log(`   ✅ Success! Status: ${response.status}`, colors.green);
      
      // Log response summary
      if (response.data) {
        if (Array.isArray(response.data)) {
          log(`   📊 Returned ${response.data.length} items`, colors.cyan);
        } else if (typeof response.data === 'object') {
          const keys = Object.keys(response.data);
          log(`   📊 Response keys: ${keys.join(', ')}`, colors.cyan);
          
          // Special handling for admin users response
          if (response.data.admins) {
            log(`   👥 Admin users count: ${response.data.admins.length}`, colors.cyan);
          }
        }
      }
    } catch (err) {
      const status = err.response?.status || 'N/A';
      const message = err.response?.data?.message || err.message;
      
      log(`   ❌ Failed! Status: ${status}`, colors.red);
      log(`   Error: ${message}`, colors.red);
      
      // Additional debugging for 401 errors
      if (status === 401) {
        log('   🔍 Debugging 401 Unauthorized:', colors.yellow);
        log(`   - Check if JWT_SECRET matches between auth and strategy`, colors.yellow);
        log(`   - Verify token format: "Bearer <token>"`, colors.yellow);
        log(`   - Token being sent: ${token.substring(0, 40)}...`, colors.yellow);
        
        // Check authorization header
        if (err.config?.headers?.Authorization) {
          log(`   - Auth header format: ${err.config.headers.Authorization.substring(0, 50)}...`, colors.yellow);
        }
      }
      
      // Additional debugging for 403 errors
      if (status === 403) {
        log('   🔍 Debugging 403 Forbidden:', colors.yellow);
        log(`   - User role: ${decodedToken?.role}`, colors.yellow);
        log(`   - User type: ${decodedToken?.type || 'NOT SET'}`, colors.yellow);
        log(`   - AdminScope guard may be rejecting the request`, colors.yellow);
        log(`   - Check if role is ADMIN or SUPER_ADMIN`, colors.yellow);
      }
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Step 3: Test without token (should fail)
  section('Step 3: Testing Without Token (Should Fail with 401)');

  for (const endpoint of endpoints.filter(e => e.requiresAuth)) {
    log(`\n📍 Testing: ${endpoint.name}`, colors.magenta);
    
    try {
      const config = {
        method: endpoint.method,
        url: endpoint.url
      };

      await axios(config);
      log(`   ❌ SECURITY ISSUE! Endpoint accessible without token`, colors.red);
    } catch (err) {
      if (err.response?.status === 401) {
        log(`   ✅ Correctly rejected with 401`, colors.green);
      } else {
        log(`   ⚠️  Rejected with unexpected status: ${err.response?.status}`, colors.yellow);
      }
    }
  }

  // Step 4: Test with malformed token
  section('Step 4: Testing With Malformed Token (Should Fail)');

  const malformedTokens = [
    { name: 'Invalid JWT', token: 'invalid.jwt.token' },
    { name: 'Missing Bearer prefix', token: token },
    { name: 'Wrong secret signature', token: jwt.sign(decodedToken, 'wrong-secret') }
  ];

  for (const { name, token: testToken } of malformedTokens) {
    log(`\n🔍 Testing: ${name}`, colors.magenta);
    
    try {
      await axios.get(`${BASE_URL}/drivers`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      log(`   ❌ SECURITY ISSUE! Request succeeded with ${name}`, colors.red);
    } catch (err) {
      if (err.response?.status === 401) {
        log(`   ✅ Correctly rejected with 401`, colors.green);
      } else {
        log(`   ⚠️  Rejected with unexpected status: ${err.response?.status}`, colors.yellow);
      }
    }
  }

  // Step 5: Recommendations
  section('Step 5: Analysis & Recommendations');

  log('\n📋 Common Issues and Solutions:', colors.cyan);
  log('\n1. Token Payload Missing "type" Field:', colors.yellow);
  log('   - Check auth.service.ts adminLogin() method', colors.white);
  log('   - Ensure payload includes: type: "admin"', colors.white);
  log('   - Current token type: ' + (decodedToken?.type || 'MISSING'), decodedToken?.type ? colors.green : colors.red);

  log('\n2. JWT_SECRET Mismatch:', colors.yellow);
  log('   - Verify .env file has correct JWT_SECRET', colors.white);
  log('   - Ensure jwt.strategy.ts uses same secret', colors.white);
  log('   - Ensure JwtModule.register uses same secret', colors.white);

  log('\n3. AdminScope Guard Issues:', colors.yellow);
  log('   - Guard checks for type === "admin"', colors.white);
  log('   - Guard checks for role in [ADMIN, SUPER_ADMIN]', colors.white);
  log('   - SUPER_ADMIN bypasses city scope checks', colors.white);

  log('\n4. Route Guard Order:', colors.yellow);
  log('   - Guards should be: @UseGuards(AuthGuard("jwt"), AdminScopeGuard)', colors.white);
  log('   - AuthGuard must run first to populate req.user', colors.white);

  section('Debug Session Complete');
}

// Run the debug script
debugJWTAuthentication().catch(err => {
  log(`\n💥 Fatal error: ${err.message}`, colors.red);
  console.error(err);
  process.exit(1);
});
