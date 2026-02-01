# Quick Reference Guide - Admin Operations & API Usage

**System**: Driver Microservices  
**Version**: v1 → v2 Launch  
**Last Updated**: February 2026

---

## 🔑 QUICK ACCESS - KEY INFORMATION

### Authentication Flow
```
1. Admin sends: POST /auth/login { driverId: "admin-001" }
2. Backend validates and returns JWT token
3. Admin includes token in all subsequent requests:
   Authorization: Bearer <JWT_TOKEN>
```

### JWT Token Payload Structure
```json
{
  "userId": "admin-001",
  "driverId": "admin-001",
  "role": "SUPER_ADMIN",
  "cityId": null,
  "iat": 1706816400,
  "exp": 1706902800
}
```

---

## 🚀 BOOTSTRAP CHECKLIST (Before First Deployment)

### Step 1: Create Superadmin User

#### Option A: Using Script (Recommended for CI/CD)
```bash
# In backend project root
npm run init:superadmin

# This will:
# - Create admin_users table (if not exists)
# - Generate secure password
# - Create superadmin user
# - Output credentials to SECURE location
```

#### Option B: Manual Database Insert
```sql
-- Connect to PostgreSQL
psql -h localhost -U postgres -d driver_db

-- Create admin_users table if not exists
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('DRIVER', 'ADMIN', 'SUPER_ADMIN') NOT NULL,
  city_id UUID NULLABLE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP NULLABLE
);

-- Insert superadmin
INSERT INTO admin_users (id, email, password_hash, role, is_active)
VALUES (
  gen_random_uuid(),
  'superadmin@company.com',
  '$2b$12$...',  -- Use bcrypt-hashed password
  'SUPER_ADMIN',
  true
);
```

#### Option C: Docker Environment Variables
```bash
# In .env.production
SUPERADMIN_EMAIL=admin@company.com
SUPERADMIN_PASSWORD=GenerateSecurePasswordHere
SUPERADMIN_AUTO_CREATE=true

# Docker will automatically create on startup
```

### Step 2: Verify Superadmin Works
```bash
# Test login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"driverId":"superadmin@company.com"}'

# Expected response:
{
  "accessToken": "eyJhbGc...",
  "driver": {
    "id": "...",
    "role": "SUPER_ADMIN"
  }
}
```

### Step 3: Test Admin Endpoint Access
```bash
# Get all drivers (requires SUPER_ADMIN)
curl -X GET http://localhost:3001/drivers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected: List of all drivers
```

---

## 📋 COMMON API OPERATIONS (For Admin)

### Driver Management

#### Create New Driver
```bash
curl -X POST http://localhost:3001/drivers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "phone": "+1234567890",
    "cityId": "bangalore",
    "zoneId": "north-bng"
  }'
```

#### List All Drivers
```bash
# SUPER_ADMIN: global view
curl -X GET http://localhost:3001/drivers \
  -H "Authorization: Bearer $TOKEN"

# ADMIN: city-scoped view
curl -X GET "http://localhost:3001/drivers?cityId=bangalore" \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Driver Details
```bash
curl -X GET http://localhost:3001/drivers/driver-001 \
  -H "Authorization: Bearer $TOKEN"
```

#### Disable Driver (Block From Receiving Deliveries)
```bash
# PATCH endpoint (MUST IMPLEMENT)
curl -X PATCH http://localhost:3001/drivers/driver-001/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

#### Enable Driver
```bash
curl -X PATCH http://localhost:3001/drivers/driver-001/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive": true}'
```

### Delivery Management

#### View All Deliveries
```bash
curl -X GET http://localhost:3001/deliveries \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Delivery Details
```bash
curl -X GET http://localhost:3001/deliveries/delivery-uuid \
  -H "Authorization: Bearer $TOKEN"

# Response includes:
# - Status (PENDING, ASSIGNED, PICKED_UP, DELIVERED, FAILED)
# - Driver info
# - Pickup/dropoff locations
# - Proof URLs
```

#### Get Delivery History for Order
```bash
curl -X GET http://localhost:3001/deliveries/seller-order/order-uuid/history \
  -H "Authorization: Bearer $TOKEN"
```

### Proof Management

#### View Proof Image
```bash
# Get delivery with proofs
curl -X GET http://localhost:3001/deliveries/delivery-uuid \
  -H "Authorization: Bearer $TOKEN"

# In response, find proof object:
{
  "proofs": [
    {
      "id": "proof-uuid",
      "type": "PICKUP",
      "imageUrl": "https://storage.example.com/proofs/proof-uuid.jpg",
      "uploadedAt": "2026-02-01T14:30:00Z"
    }
  ]
}

# Access image at imageUrl directly
```

---

## 🔐 SECURITY OPERATIONS

### Change JWT Secret (Rotate Keys)
```bash
# 1. Generate new secret
openssl rand -base64 32

# 2. Update environment variable
export JWT_SECRET="new-secret-here"

# 3. Restart services
docker restart driver-service

# Note: Existing tokens will be invalidated
```

### Generate JWT Token Manually (for testing)
```bash
# Using backend CLI tool (must implement)
npm run generate-jwt -- \
  --userId=admin-001 \
  --role=SUPER_ADMIN \
  --expiry=24h
```

### View Audit Logs
```bash
# Once audit logging is implemented
curl -X GET http://localhost:3001/admin/audit-logs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "DRIVER_DISABLED",
    "startDate": "2026-02-01",
    "endDate": "2026-02-28",
    "limit": 50
  }'
```

---

## 🛠️ TROUBLESHOOTING

### Issue: 401 Unauthorized on Admin Endpoints

#### Cause #1: Missing or Invalid JWT Token
```bash
# Check token is present
curl -X GET http://localhost:3001/drivers \
  -H "Authorization: Bearer $TOKEN"

# If error: "Missing authentication"
# Solution: Get new token via /auth/login
```

#### Cause #2: Expired Token
```bash
# Tokens expire after 24 hours (default)
# Solution: Login again to get fresh token

curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"driverId":"admin@company.com"}'
```

#### Cause #3: Wrong Role
```bash
# Error: "Admin access required"
# Check your token payload:

jwt decode $TOKEN  # Using jwt-cli tool

# Your role should be ADMIN or SUPER_ADMIN
```

### Issue: 403 Forbidden on Specific City

#### Cause: ADMIN trying to access different city
```bash
# If you're ADMIN (not SUPER_ADMIN)
# You can only see drivers in your assigned city

# Check your token:
{
  "role": "ADMIN",
  "cityId": "bangalore"  # Can only manage bangalore
}

# If you need to manage other cities, escalate to SUPER_ADMIN
```

### Issue: Health Check Failing

```bash
# Check service health
curl -X GET http://localhost:3001/health

# Expected response:
{
  "status": "ok",
  "info": {
    "database": {"status": "up"},
    "redis": {"status": "up"}
  }
}

# If databases are down:
# 1. Check PostgreSQL is running
# 2. Check Redis is running
# 3. Verify connection strings in .env
```

---

## 📊 ENVIRONMENT VARIABLES FOR ADMIN

### Required Variables
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=securepassword
DB_NAME=driver_db

# JWT
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRY=24h

# Admin Bootstrap
SUPERADMIN_EMAIL=admin@company.com
SUPERADMIN_PASSWORD=TempPassword123!
SUPERADMIN_AUTO_CREATE=false  # Set true for auto-creation

# Server
PORT=3001
NODE_ENV=production

# Vendure Integration (optional)
VENDURE_WEBHOOK_URL=https://vendure.example.com/admin/webhooks
VENDOR_WEBHOOK_SECRET=webhook-secret-here
```

### Optional Variables
```bash
# Logging
LOG_LEVEL=info  # debug, info, warn, error

# Database Optimization
DB_POOL_MIN=5
DB_POOL_MAX=20

# WebSocket
WS_PORT=3002
WS_PATH=/driver

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # if required
```

---

## 📈 MONITORING & METRICS

### WebSocket Metrics (Available from Frontend)
```
GET /metrics/websocket
{
  "connected": 45,
  "disconnected": 5,
  "reconnected": 12,
  "messages": {
    "sent": 450,
    "received": 520,
    "errors": 2
  },
  "latency_ms": 85
}
```

### Database Metrics
```
GET /metrics/database
{
  "query_count": 1234,
  "slow_queries": 3,
  "avg_query_time_ms": 12,
  "connection_pool": {
    "active": 8,
    "idle": 12,
    "total": 20
  }
}
```

### Driver Activity
```
GET /analytics/drivers/activity
{
  "active_now": 45,
  "on_delivery": 38,
  "idle": 7,
  "offline": 0,
  "total_registered": 200
}
```

---

## 🚨 EMERGENCY PROCEDURES

### Emergency: Disable All Drivers (System Issue)
```bash
# 1. Get superadmin token
TOKEN=$(curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"driverId":"admin@company.com"}' | jq -r '.accessToken')

# 2. Bulk disable (must implement)
curl -X POST http://localhost:3001/drivers/bulk-action \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "disable",
    "driverIds": "ALL"
  }'
```

### Emergency: Database Connection Lost
```bash
# 1. Check database status
docker ps | grep postgres

# 2. Restart database
docker restart postgres

# 3. Verify connection
curl -X GET http://localhost:3001/health
```

### Emergency: Rollback to Previous Version
```bash
# 1. Get previous image
docker images | grep driver-service

# 2. Rollback
docker pull driver-service:v1.2.0
docker stop driver-service-v2
docker run -d --name driver-service-v1 driver-service:v1.2.0

# 3. Update load balancer to point to v1
```

---

## 🔄 COMMON WORKFLOWS

### Workflow: Disable Misbehaving Driver
```
1. Admin opens dashboard → Driver list
2. Searches for driver name/ID
3. Clicks "Disable" button
4. System sends: PATCH /drivers/{id}/status { isActive: false }
5. Driver is immediately blocked
6. Pending deliveries are reassigned
7. Audit log records: "Admin disabled Driver X at 14:30:00"
8. Driver cannot login until re-enabled
```

### Workflow: Handle Failed Delivery
```
1. Admin sees delivery with status "FAILED"
2. Clicks "View Details" → sees rejection reason
3. Chooses action:
   a) Reassign to different driver
   b) Mark for retry
   c) Cancel delivery
4. If reassigning:
   - System validates new driver availability
   - Sends: PATCH /deliveries/{id}/driver { newDriverId: "..." }
   - New driver notified via WebSocket
   - System creates new assignment record
5. Audit log records the action
```

### Workflow: Review Low-Quality Proof
```
1. Admin sees delivery with "PENDING_REVIEW" status
2. Clicks to view proof image
3. If quality is poor:
   - Clicks "Reject" button
   - Writes rejection reason
   - Sends: POST /proofs/{id}/reject { reason: "..." }
   - Driver is notified
   - Driver must retake photo
4. If quality is good:
   - Clicks "Approve" button
   - Sends: POST /proofs/{id}/approve
   - Delivery advances to next state
5. Both actions are audit logged
```

---

## 📞 SUPPORT CONTACTS

### For System Issues
- **Backend Issues**: DevOps/Backend Team
- **Database Issues**: Database Admin
- **Infrastructure**: Infrastructure Team

### For Admin Access Issues
- **Can't Login**: Reset password (once implemented)
- **Wrong Permissions**: Contact SUPER_ADMIN to update role
- **Lost Credentials**: Contact Security team

---

## 📚 ADDITIONAL RESOURCES

### Internal Documentation
- System Architecture: `/docs/ARCHITECTURE.md`
- API Documentation: `/docs/API.md`
- Database Schema: `/docs/SCHEMA.md`
- Security Guidelines: `/docs/SECURITY.md`

### External References
- NestJS Documentation: https://docs.nestjs.com
- Socket.io Documentation: https://socket.io/docs
- PostgreSQL Documentation: https://www.postgresql.org/docs
- JWT Specification: https://tools.ietf.org/html/rfc7519

---

**Quick Reference Guide - END**  
*Print this guide for quick access during operations*
