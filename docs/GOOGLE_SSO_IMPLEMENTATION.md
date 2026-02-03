# Google SSO Implementation for Driver Microservices

This document describes the implementation of Google SSO authentication for drivers in the driver-micro-services system.

## Overview

Google SSO provides a secure, user-friendly authentication method for drivers, eliminating the need to remember driver IDs and reducing support overhead.

## Architecture

```
Driver PWA
   |
   | Google OAuth (ID Token)
   v
Google Identity Platform
   |
   | idToken (JWT signed by Google)
   v
Driver Microservice (NestJS)
   |
   | verify Google token
   | map → driver record
   | issue internal JWT
   v
Postgres + Redis + WebSocket
```

## Database Changes

### New Columns in `drivers` table:

- `email` (varchar, nullable): Driver's email address from Google
- `google_sub` (varchar, nullable): Google's unique user identifier
- `auth_provider` (varchar, default 'legacy'): Authentication method ('legacy', 'google', 'email')

### New Indexes:

- `idx_drivers_google_sub`: Index on google_sub for fast lookups
- `idx_drivers_google_sub_unique`: Unique constraint on google_sub (when not null)
- `idx_drivers_email_unique`: Unique constraint on email (when not null)

## Implementation Details

### 1. GoogleAuthService

Located at `src/auth/google-auth.service.ts`

- Verifies Google ID tokens using `google-auth-library`
- Extracts user information (email, name, picture)
- Validates token audience and required claims

### 2. AuthService Changes

Located at `src/auth/auth.service.ts`

- Added `loginWithGoogle()` method
- Creates **pending driver records** (inactive by default) - admin must complete profile
- Returns `PENDING_APPROVAL` status for unapproved drivers
- Issues JWT only for approved drivers
- **Security**: Authentication fields never client-writable

### 3. AuthController Changes

Located at `src/auth/auth.controller.ts`

- Added `POST /auth/google` endpoint
- Includes audit logging for security tracking

### 4. JWT Strategy Updates

Located at `src/auth/jwt.strategy.ts`

- Updated to handle new JWT payload format
- Includes email in driver tokens for frontend convenience

### 5. DriversController Changes

Located at `src/drivers/drivers.controller.ts`

- Added `GET /drivers/me` endpoint for driver self-service
- Uses standardized `req.user.driverId` pattern

### 6. Database Migration

Located at `src/migrations/1700000000002-AddGoogleAuthColumns.ts`

- Adds new columns to drivers table
- Creates necessary indexes and constraints
- Provides rollback functionality

## JWT Payload Format

### Driver Token (Google SSO):

```json
{
  "driverId": "driver-uuid",
  "sub": "driver-uuid",
  "type": "driver",
  "email": "driver@example.com"
}
```

### Admin Token (Unchanged):

```json
{
  "userId": "admin-uuid",
  "email": "admin@example.com",
  "role": "ADMIN",
  "cityId": "city-uuid",
  "sub": "admin-uuid",
  "type": "admin"
}
```

## Security Considerations

1. **Token Verification**: All Google tokens are verified against Google's servers
2. **Audience Validation**: Ensures tokens are issued for the correct application
3. **Admin Approval**: New drivers are created as inactive until admin approval
4. **Audit Logging**: All authentication events are logged for security monitoring
5. **JWT Secret**: Must be kept secure and rotated periodically

## Environment Variables

Required for Google SSO:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
JWT_SECRET=your-jwt-secret-key
```

## Testing

### E2E Tests

Located at `test/google-sso.e2e-spec.ts`

- Tests invalid token handling
- Validates JWT payload structure
- Provides test framework for integration testing

### Manual Testing

1. Obtain a Google OAuth client ID from Google Cloud Console
2. Configure the client ID in environment variables
3. Use the `/auth/google` endpoint with a valid Google ID token
4. Verify driver creation and JWT issuance

## Migration Strategy

### Phase 1: Database Migration
```bash
npm run migration:generate
npm run migration:run
```

### Phase 2: Backend Deployment
- Deploy updated backend services
- Verify GoogleAuthService functionality
- Test JWT payload format

### Phase 3: Frontend Integration
- Update driver PWA to use Google login
- Implement session recovery for Google-authenticated drivers
- Add fallback to legacy login for existing drivers

### Phase 4: Admin Workflow
- Update admin interface to handle Google-authenticated drivers
- Implement driver activation workflow
- Add audit log monitoring

## Backward Compatibility

- Existing driver ID-based login continues to work
- Legacy drivers maintain their current authentication method
- Admin workflows remain unchanged
- WebSocket authentication continues to work with new JWT format

## Future Enhancements

1. **Email OTP**: Add email-based OTP as an alternative to Google SSO
2. **Multi-Provider**: Support additional OAuth providers (Facebook, Apple)
3. **Device Binding**: Add device fingerprinting for additional security
4. **Session Management**: Implement session revocation and management
5. **Rate Limiting**: Add rate limiting for authentication endpoints

## Troubleshooting

### Common Issues

1. **Invalid Token**: Verify Google Client ID and token format
2. **Driver Not Found**: Check if driver exists or needs admin approval
3. **JWT Validation**: Ensure JWT_SECRET is consistent across services
4. **Database Constraints**: Verify unique constraints on google_sub and email

### Debug Commands

```bash
# Check migration status
npm run migration:show

# Run database migration
npm run migration:run

# Test Google token verification
curl -X POST http://localhost:3001/auth/google \
  -H "Content-Type: application/json" \
  -d '{"idToken":"your-google-id-token"}'
```

## Security Checklist

- [ ] Google Client ID is properly configured
- [ ] JWT_SECRET is secure and rotated
- [ ] Audit logging is enabled and monitored
- [ ] Admin approval workflow is in place
- [ ] Database constraints prevent duplicate accounts
- [ ] Error messages don't leak sensitive information
- [ ] HTTPS is enforced for all authentication endpoints