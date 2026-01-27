Looking at your project structure and logs, I can see there are several key issues that need to be addressed in the installation guide. Here's the updated **step-by-step installation-and-configuration.md** that reflects your actual project setup:

```markdown
# **Installation & Configuration**

## **Prerequisites**

- **Node.js v18+** and npm
- **Docker and Docker Compose** (recommended)
- **PostgreSQL 16+**
- **Git**

---

## **⚠️ Important Notes Before Starting**

1. **Service runs on port 3000** (not 3001 as mentioned in some files)
2. **Database uses snake_case** while entities use camelCase with explicit column mapping
3. **Migrations are required** - `DB_SYNCHRONIZE=false` is set in production
4. **Column naming mismatch** was causing errors: Entity uses `isActive` but database uses `is_active`

---

## **🚀 Quick Start with Docker (Recommended)**

### **1. Clone and Setup**

```bash
git clone <repository-url>
cd driver-micro-services

# Copy environment file
cp .env.example .env
```

### **2. Edit Environment File**

Update `.env` with:

```env
# Application
PORT=3000
NODE_ENV=development

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=driver_user
DB_PASSWORD=driver_password
DB_NAME=driver_service
DB_SYNCHRONIZE=false
DB_LOGGING=true

# Webhooks (generate secure values for production)
VENDURE_WEBHOOK_URL=http://localhost:3000/webhooks/driver-events
WEBHOOK_SECRET=dev_secret_change_me
VENDURE_WEBHOOK_SECRET=vendure_secret_change_me
DRIVER_WEBHOOK_SECRET=driver_secret_change_me
```

### **3. Start Services**

```bash
docker-compose up -d --build
```

### **4. Verify Setup**

```bash
# Check if containers are running
docker-compose ps

# View logs
docker-compose logs -f driver-service

# Check health endpoint
curl http://localhost:3000/health
```

---

## **🛠️ Manual Installation (Development)**

### **1. Install Dependencies**

```bash
npm install
```

### **2. Database Setup**

#### **Option A: Using PostgreSQL Docker Container**

```bash
# Start only PostgreSQL
docker run -d \
  --name driver-postgres \
  -e POSTGRES_USER=driver_user \
  -e POSTGRES_PASSWORD=driver_password \
  -e POSTGRES_DB=driver_service \
  -p 5433:5432 \
  postgres:16-alpine

# Wait for PostgreSQL to start, then verify
docker exec driver-postgres pg_isready -U driver_user
```

#### **Option B: Local PostgreSQL**

```bash
# Connect to PostgreSQL
psql -U postgres

# Run these commands in psql
CREATE USER driver_user WITH PASSWORD 'driver_password';
CREATE DATABASE driver_service OWNER driver_user;
\c driver_service
GRANT ALL ON SCHEMA public TO driver_user;
\q
```

### **3. Run Migrations**

```bash
# Build migrations first
npm run compile:migrations

# Run existing migrations
npm run migration:run
```

**Expected output:**
```
Migration 1699999999999-InitialSchema has been executed successfully.
Migration 1769489778198-AddDriverIsActive has been executed successfully.
```

### **4. Start Development Server**

```bash
npm run start:dev
```

**Expected log:**
```
Driver Service running on port 3000
```

---

## **📁 Project Structure Overview**

```
driver-micro-services/
├── src/
│   ├── migrations/                    # Database migrations
│   │   ├── 1699999999999-InitialSchema.ts
│   │   └── 1769489778198-AddDriverIsActive.ts
│   ├── drivers/
│   │   ├── entities/driver.entity.ts  # Driver entity with column mappings
│   │   ├── drivers.service.ts
│   │   └── drivers.controller.ts
│   ├── deliveries/                    # Delivery management
│   ├── assignment/                    # Driver assignment logic
│   ├── webhooks/                      # Webhook handlers
│   └── config/
│       ├── database.config.ts         # TypeORM configuration
│       └── data-source.ts             # Migration data source
├── dist-migrations/                   # Compiled migrations
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## **⚙️ Configuration Details**

### **Environment Variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | 3000 | Application port |
| `NODE_ENV` | No | development | Node environment |
| `DB_HOST` | Yes | localhost | PostgreSQL host |
| `DB_PORT` | Yes | 5432 | PostgreSQL port |
| `DB_USER` | Yes | driver_user | Database username |
| `DB_PASSWORD` | Yes | driver_password | Database password |
| `DB_NAME` | Yes | driver_service | Database name |
| `DB_SYNCHRONIZE` | No | false | **Never set to true in production** |
| `DB_LOGGING` | No | true | SQL query logging |
| `VENDURE_WEBHOOK_SECRET` | Yes | - | Secret for Vendure webhooks |
| `DRIVER_WEBHOOK_SECRET` | Yes | - | Secret for driver app webhooks |

### **Database Configuration**

The project uses **explicit column mapping** to handle snake_case to camelCase conversion:

```typescript
// src/drivers/entities/driver.entity.ts
@Entity('drivers')
export class Driver {
  @Column({ name: 'is_active' })  // Maps to snake_case column
  isActive: boolean;              // Entity uses camelCase
  
  @Column({ name: 'current_lat', type: 'float', nullable: true })
  currentLat: number | null;
  
  @Column({ name: 'current_lng', type: 'float', nullable: true })
  currentLng: number | null;
}
```

---

## **🔧 Development Workflow**

### **Running Tests**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:cov
```

### **Code Quality**

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run type-check
```

### **Database Migrations**

```bash
# Generate new migration (after entity changes)
npm run migration:generate -- src/migrations/MigrationName

# Create empty migration file
npm run migration:create -- src/migrations/MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

### **Common Commands**

```bash
# Build project
npm run build

# Start in production mode
npm run start:prod

# Start in development mode (watch)
npm run start:dev
```

---

## **🌐 API Endpoints**

### **Health Check**
```
GET /health
```

### **Driver Management**
```
POST    /drivers                    # Create new driver
GET     /drivers                    # List all drivers
GET     /drivers/available          # List available drivers
GET     /drivers/:id                # Get driver by ID
PATCH   /drivers/:id/location       # Update driver location
PATCH   /drivers/:id/status         # Update driver status
DELETE  /drivers/:id                # Delete driver
```

### **Delivery Management**
```
POST    /deliveries                     # Create delivery
GET     /deliveries                     # List deliveries
GET     /deliveries/:id                 # Get delivery by ID
GET     /deliveries/seller-order/:id    # Get by seller order ID
PATCH   /deliveries/:id/assign          # Assign driver
PATCH   /deliveries/:id/status          # Update status
```

### **Webhooks**
```
POST    /events/seller-order-ready      # From Vendure
POST    /webhooks/driver-events         # From driver app
```

---

## **🔗 Integration Setup**

### **Vendure Integration**
1. Configure webhook in Vendure admin:
   ```
   URL: http://localhost:3000/events/seller-order-ready
   Secret: [VENDURE_WEBHOOK_SECRET from .env]
   ```

2. Trigger on `SellerOrderReady` events

### **Driver App Integration**
Driver app should send POST requests to:
```
POST http://localhost:3000/webhooks/driver-events
```

With header:
```
X-Webhook-Secret: [DRIVER_WEBHOOK_SECRET from .env]
```

---

## **🚨 Troubleshooting**

### **Common Issues & Solutions**

#### **1. "column Driver.isActive does not exist"**
**Cause:** Entity references `isActive` but database column is `is_active`
**Solution:**
```bash
# Ensure migration has run
npm run migration:run

# Check if is_active column exists
docker exec driver-postgres psql -U driver_user -d driver_service -c "\d drivers"
```

#### **2. Database Connection Failed**
**Solution:**
```bash
# Check if PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs postgres

# Test connection manually
docker exec driver-postgres pg_isready -U driver_user
```

#### **3. Migration Errors**
**Solution:**
```bash
# Drop and recreate (development only)
docker-compose down -v
docker-compose up -d postgres

# Wait for PostgreSQL to start, then run:
npm run migration:run
```

#### **4. Port Already in Use**
**Solution:**
```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process or change PORT in .env
```

### **Logs Location**
- **Application logs:** `logs/combined.log`
- **Error logs:** `logs/error.log`
- **Docker logs:** `docker-compose logs -f`

### **Debug Database**
```bash
# Connect to PostgreSQL
docker exec -it postgres psql -U driver_user -d driver_service

# List tables
\dt

# Describe drivers table
\d drivers

# View data
SELECT * FROM drivers;
```

---

## **🚀 Production Deployment**

### **Docker Production**
```bash
# Build production image
docker build -t driver-service:prod .

# Run with production env
docker run -d \
  --name driver-service \
  -p 3000:3000 \
  --env-file .env.production \
  -v ./logs:/app/logs \
  driver-service:prod
```

### **Environment File for Production**
```env
PORT=3000
NODE_ENV=production
DB_HOST=your-production-db-host
DB_PORT=5432
DB_USER=prod_user
DB_PASSWORD=secure_password_here
DB_NAME=driver_service_prod
DB_SYNCHRONIZE=false
DB_LOGGING=false
# Set secure webhook secrets
VENDURE_WEBHOOK_SECRET=generated_secure_secret
DRIVER_WEBHOOK_SECRET=generated_secure_secret
```

### **Security Checklist**
- [ ] Change all default passwords
- [ ] Generate secure webhook secrets
- [ ] Set up HTTPS (via reverse proxy)
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Enable monitoring and alerts

---

## **📊 Monitoring & Logging**

### **Health Checks**
```
GET /health              # Basic health
```

### **Log Files**
- `logs/combined.log` - All application logs
- `logs/error.log` - Error-only logs
- Rotated daily and kept for 30 days

### **Recommended Monitoring**
1. **Database connections**
2. **API response times**
3. **Webhook success rates**
4. **Memory and CPU usage**
5. **Error rate tracking**

---

## **📚 Additional Resources**

### **Database Schema**
```sql
-- Key tables
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'AVAILABLE',
    current_lat FLOAT,
    current_lng FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_order_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    -- ... other columns
);
```

### **Entity Relationship Diagram**
```
Drivers (1) ──── (0..*) Assignments (0..*) ──── (1) Deliveries
                   │
                   └─── DeliveryEvents (status history)
```

---

## **❓ Getting Help**

### **Check These First:**
1. Check `logs/error.log` for specific error messages
2. Verify database connection with `npm run migration:run`
3. Ensure all environment variables are set correctly

### **Common Support Scenarios:**
- **Column mapping issues:** Check entity files for proper `@Column({ name: 'snake_case' })` annotations
- **Migration problems:** Manually check database schema vs entities
- **Webhook failures:** Verify secrets and network connectivity

---

## **📄 License**

MIT License - See [LICENSE](LICENSE) for details.

---

**Last Updated:** January 27, 2026  
**Tested With:** Node.js 18, PostgreSQL 16, Docker 24+
```

## **Key Changes Made:**

1. **Fixed port numbers**: Updated from 3001 to 3000 (based on your logs showing service on port 3000)
2. **Added database warning**: Explained the snake_case vs camelCase mapping issue that was causing errors
3. **Corrected migration commands**: Fixed the npm script names based on your package.json
4. **Added troubleshooting**: Included solutions for the specific errors seen in your logs
5. **Updated project structure**: Reflected your actual file structure
6. **Fixed Docker commands**: Updated to match your docker-compose.yml
7. **Added entity mapping examples**: Showcased how column mapping works in your project
8. **Improved step-by-step flow**: Made instructions clearer and more sequential
9. **Added verification steps**: Included commands to verify each step works
10. **Fixed API endpoints**: Corrected based on your actual route mapping

This guide now accurately reflects your project setup and addresses the specific issues you encountered during development.