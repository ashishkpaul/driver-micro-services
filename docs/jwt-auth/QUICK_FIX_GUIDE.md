# Quick Fix Guide: 401 Unauthorized Error on /drivers Endpoint

## Problem Diagnosis

You're experiencing this error:
```
❌ Drivers endpoint failed: 401
Error data: { message: 'Unauthorized', statusCode: 401 }
```

Based on the code review, the most likely cause is that the JWT token payload is **missing the `type: 'admin'` field**, which the `AdminScopeGuard` requires to verify admin access.

## The Root Cause

Looking at your `src/auth/admin-scope.guard.ts` (lines 3930-3942):

```typescript
export class AdminScopeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AdminJwtPayload | DriverJwtPayload | undefined;

    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }

    // Check if user is admin (not driver)
    if (user.type !== 'admin') {  // ⚠️ THIS CHECK IS FAILING
      throw new ForbiddenException('Admin access required');
    }
    // ...
  }
}
```

The guard expects `user.type === 'admin'`, but your JWT token doesn't include this field.

## The Fix

### Step 1: Update `src/auth/auth.service.ts`

Find the `adminLogin()` method (around line 4092) and add the `type` field:

```typescript
async adminLogin(admin: AdminUser) {
  const payload = {
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    cityId: admin.cityId,
    sub: admin.id,
    type: 'admin', // ⬅️ ADD THIS LINE
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

### Step 2: Verify JWT Strategy Returns Type

Check `src/auth/jwt.strategy.ts` (around line 4008) to ensure it returns the `type` field:

```typescript
async validate(payload: any) {
  try {
    // Check if it's a driver token
    if (payload.driverId) {
      const driver = await this.authService.validateDriver(payload.driverId);
      return {
        driverId: driver.id,
        sub: payload.sub,
        type: 'driver',
      };
    }
    
    // Check if it's an admin token
    if (payload.userId && payload.role) {
      const admin = await this.authService.adminService.findById(payload.userId);
      return {
        userId: admin.id,
        email: admin.email,
        role: admin.role,
        cityId: admin.cityId,
        sub: payload.sub,
        type: 'admin', // ⬅️ VERIFY THIS LINE EXISTS
      };
    }

    throw new Error('Invalid token payload');
  } catch (error) {
    throw new Error('Token validation failed: ' + error.message);
  }
}
```

### Step 3: Rebuild and Restart

```bash
# Stop the running service (Ctrl+C)

# Rebuild
npm run build

# Restart
npm run start:dev
```

### Step 4: Test the Fix

Run the debug script to verify:

```bash
node test/debug/debug-jwt-auth.js
```

You should now see:
```
🔍 Token Structure Analysis:
- userId: ... ✅
- email: admin@company.com ✅
- role: SUPER_ADMIN ✅
- cityId: ... ✅
- sub: ... ✅
- type: admin ✅  ⬅️ THIS SHOULD NOW BE PRESENT
```

And the drivers endpoint should work:
```
📍 Testing: Drivers List (JWT + AdminScope Required)
   ✅ Success! Status: 200
   📊 Returned X items
```

## Alternative Issue: JWT_SECRET Mismatch

If adding the `type` field doesn't fix it, check for JWT_SECRET mismatch:

### Verify .env file
```bash
# Check your .env file
cat .env | grep JWT_SECRET
```

Should show:
```
JWT_SECRET=driver-service-secret
```

### Verify it matches in all files

1. **src/auth/jwt.strategy.ts** (line 3991):
   ```typescript
   secretOrKey: process.env.JWT_SECRET || 'driver-service-secret',
   ```

2. **src/auth/auth.module.ts** (line 4197):
   ```typescript
   secret: process.env.JWT_SECRET || 'driver-service-secret',
   ```

3. **src/websocket/websocket.module.ts** (line 6415):
   ```typescript
   secret: process.env.JWT_SECRET || 'driver-service-secret',
   ```

All should use the **same secret**.

## Verification Checklist

- [ ] Added `type: 'admin'` to adminLogin() payload
- [ ] Verified jwt.strategy.ts returns type field
- [ ] Rebuilt the application
- [ ] Restarted the service
- [ ] Tested with debug-jwt-auth.js
- [ ] Verified JWT_SECRET is consistent
- [ ] Checked logs for errors

## Still Not Working?

If you're still experiencing issues after these fixes:

1. **Check the application logs:**
   ```bash
   tail -f logs/error.log
   ```

2. **Enable detailed logging:**
   Add this to your `src/auth/jwt.strategy.ts`:
   ```typescript
   async validate(payload: any) {
     console.log('🔍 JWT Strategy - Validating payload:', payload);
     // ... rest of validation
     const result = { /* ... */ };
     console.log('✅ JWT Strategy - Returning user:', result);
     return result;
   }
   ```

3. **Check AdminScopeGuard:**
   Add logging to `src/auth/admin-scope.guard.ts`:
   ```typescript
   canActivate(ctx: ExecutionContext): boolean {
     const req = ctx.switchToHttp().getRequest();
     const user = req.user;
     
     console.log('🔍 AdminScopeGuard - Checking user:', user);
     
     if (!user) {
       throw new UnauthorizedException('Missing authentication');
     }
     
     console.log('🔍 AdminScopeGuard - User type:', user.type);
     // ... rest of guard
   }
   ```

4. **Run the comprehensive test:**
   ```bash
   node test/jwt-auth/test-driver-microservices-e2e.js
   ```

## Expected Behavior After Fix

### Login Response
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin": {
    "id": "uuid",
    "email": "admin@company.com",
    "role": "SUPER_ADMIN",
    "cityId": "uuid"
  }
}
```

### Decoded Token Payload
```json
{
  "userId": "uuid",
  "email": "admin@company.com",
  "role": "SUPER_ADMIN",
  "cityId": "uuid",
  "sub": "uuid",
  "type": "admin",  ⬅️ THIS FIELD IS CRITICAL
  "iat": 1705319400,
  "exp": 1705405800
}
```

### Successful /drivers Request
```
Status: 200 OK
Body: [
  {
    "id": "driver-uuid",
    "name": "Driver Name",
    "phone": "+1234567890",
    "status": "AVAILABLE",
    ...
  }
]
```

## Need More Help?

If this doesn't resolve your issue, run the debug script and share the output:

```bash
node debug-jwt-auth.js > debug-output.txt 2>&1
```

Then review `debug-output.txt` for detailed diagnostics.
