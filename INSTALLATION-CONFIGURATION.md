# **Installation & Configuration**

## **Prerequisites**
- Node.js v18+ and npm
- Docker and Docker Compose (for containerized setup)
- PostgreSQL 16 (if running without Docker)
- Git

## **Quick Start with Docker (Recommended)**

### **1. Clone the Repository**
```bash
git clone <repository-url>
cd driver-micro-services
```

### **2. Create Environment File**
```bash
cp .env.example .env
# Edit .env with your configuration
```

**Example `.env` file:**
```env
# Application
PORT=3001
NODE_ENV=production

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=driver_user
DB_PASSWORD=driver_password
DB_NAME=driver_service
DB_SYNCHRONIZE=false
DB_LOGGING=true

# Webhook Secrets (Generate secure values)
VENDURE_WEBHOOK_URL=https://your-vendure-instance.com/webhooks/driver-events
WEBHOOK_SECRET=your_webhook_secret_here
VENDURE_WEBHOOK_SECRET=your_vendure_webhook_secret_here
DRIVER_WEBHOOK_SECRET=your_driver_app_secret_here

# CORS
CORS_ORIGINS=http://localhost:3000,https://your-frontend.com
```

### **3. Build and Run with Docker Compose**
```bash
docker-compose up -d --build
```

### **4. Verify the Service**
```bash
# Check if the service is running
curl http://localhost:3001/health

# Check container status
docker-compose ps

# View logs
docker-compose logs -f driver-service
```

## **Manual Installation (Development)**

### **1. Install Dependencies**
```bash
npm install
```

### **2. Set Up PostgreSQL Database**

#### **Option A: Using Docker (Recommended)**

If you are using the provided `docker-compose.yml`, you need to initialize the specific database and user defined in your `.env`.

```bash
# 1. Access the running Postgres container
sudo docker exec -it postgres_db psql -U admin -d mydatabase

# 2. Create the application user
CREATE USER driver_user WITH PASSWORD 'driver_password';

# 3. Create the application database
CREATE DATABASE driver_service OWNER driver_user;

# 4. Grant schema permissions (Required for Postgres 15+)
\c driver_service
GRANT ALL ON SCHEMA public TO driver_user;

# 5. Exit psql
\q

```

**Verify the connection:**

```bash
# Try logging in directly as the new user
sudo docker exec -it postgres_db psql -U driver_user -d driver_service

```

#### **Option B: Manual Installation (Local Postgres)**

If running Postgres directly on your host machine:

```bash
# Connect to PostgreSQL
psql -U postgres

# Run setup commands
CREATE USER driver_user WITH PASSWORD 'driver_password';
CREATE DATABASE driver_service OWNER driver_user;
GRANT ALL PRIVILEGES ON DATABASE driver_service TO driver_user;
\c driver_service
GRANT ALL ON SCHEMA public TO driver_user;

```

### **3. Run Database Migrations**
```bash
# Build the project first
npm run build

# Run migrations
npm run migration:run
```

### **4. Start the Development Server**
```bash
npm run start:dev
```

## **Configuration Options**

### **Environment Variables**
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3001 | Application port |
| `NODE_ENV` | No | development | Environment mode |
| `DB_HOST` | Yes | - | PostgreSQL host |
| `DB_PORT` | Yes | 5432 | PostgreSQL port |
| `DB_USER` | Yes | - | Database user |
| `DB_PASSWORD` | Yes | - | Database password |
| `DB_NAME` | Yes | - | Database name |
| `DB_SYNCHRONIZE` | No | false | Auto-sync database schema |
| `DB_LOGGING` | No | true | Enable SQL logging |
| `VENDURE_WEBHOOK_URL` | Yes | - | Vendure webhook endpoint |
| `WEBHOOK_SECRET` | Yes | - | Secret for outgoing webhooks |
| `VENDURE_WEBHOOK_SECRET` | Yes | - | Secret for incoming webhooks |
| `DRIVER_WEBHOOK_SECRET` | Yes | - | Secret for driver app webhooks |
| `CORS_ORIGINS` | No | - | Comma-separated allowed origins |

### **Database Configuration**
The service supports the following database configurations:

1. **Local PostgreSQL**: Update `.env` with local database credentials
2. **Docker PostgreSQL**: Use the provided `docker-compose.yml`
3. **Cloud PostgreSQL**: Update connection string in `.env`

## **Development Workflow**

### **Running Tests**
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:cov
```

### **Code Quality Checks**
```bash
# Lint code
npm run lint

# Type checking
npm run type-check

# Security audit
npm run security

# Deprecated dependencies check
npm run deprecated
```

### **Database Migrations**
```bash
# Generate a new migration
npm run migration:generate -- -n CreateNewTable

# Run pending migrations
npm run migration:run

# Create empty migration file
npm run migration:create -- -n MigrationName
```

## **API Endpoints**

### **Health Check**
```http
GET /health
```

### **Driver Management**
```http
POST /drivers            # Create driver
GET /drivers            # List all drivers
GET /drivers/available  # List available drivers
GET /drivers/:id        # Get driver by ID
PATCH /drivers/:id/location  # Update driver location
PATCH /drivers/:id/status    # Update driver status
DELETE /drivers/:id     # Delete driver
```

### **Delivery Management**
```http
POST /deliveries                    # Create delivery
GET /deliveries                    # List all deliveries
GET /deliveries/:id               # Get delivery by ID
GET /deliveries/seller-order/:id  # Get delivery by seller order ID
PATCH /deliveries/:id/assign      # Assign driver to delivery
PATCH /deliveries/:id/status      # Update delivery status
```

### **Webhook Endpoints**
```http
POST /events/seller-order-ready    # Receive order events from Vendure
POST /webhooks/driver-events       # Receive events from driver app
```

## **Integration Setup**

### **Vendure Configuration**
1. In Vendure admin, configure the webhook endpoint:
   ```
   URL: http://localhost:3001/events/seller-order-ready
   Secret: (use VENDURE_WEBHOOK_SECRET from .env)
   ```

2. Set up the webhook to trigger on `SellerOrderReady` events

### **Driver App Integration**
1. Configure the driver app to send location updates to:
   ```
   POST http://localhost:3001/webhooks/driver-events
   ```
2. Include the header:
   ```
   X-Webhook-Secret: (DRIVER_WEBHOOK_SECRET from .env)
   ```

## **Troubleshooting**

### **Common Issues**

1. **Database Connection Failed**
   ```bash
   # Check if PostgreSQL is running
   docker-compose ps
   
   # Check database logs
   docker-compose logs postgres
   ```

2. **Migration Errors**
   ```bash
   # Drop and recreate database (development only)
   docker-compose down -v
   docker-compose up -d
   ```

3. **Webhook Failures**
   - Verify `VENDURE_WEBHOOK_URL` is correct and accessible
   - Check webhook secrets match between systems
   - Monitor logs for webhook delivery attempts

### **Logs Location**
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Docker logs: `docker-compose logs driver-service`

## **Production Deployment**

### **Docker Production Build**
```bash
# Build production image
docker build -t driver-service:prod .

# Run with production environment
docker run -d \
  --name driver-service \
  -p 3001:3001 \
  --env-file .env.production \
  driver-service:prod
```

### **Kubernetes (Sample Deployment)**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: driver-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: driver-service
  template:
    metadata:
      labels:
        app: driver-service
    spec:
      containers:
      - name: driver-service
        image: driver-service:prod
        ports:
        - containerPort: 3001
        envFrom:
        - secretRef:
            name: driver-service-secrets
```

## **Monitoring**

### **Health Endpoints**
- `GET /health` - Basic service health
- `GET /health/database` - Database connectivity check

### **Logging**
- Structured JSON logging for production
- File rotation with Winston
- Integration with external log aggregators (ELK, Datadog, etc.)

### **Metrics**
- Consider adding Prometheus metrics endpoint
- Monitor: API response times, database query performance, webhook success rates

## **Support**

For issues and questions:
1. Check the logs in `logs/` directory
2. Review the API documentation in source code
3. Ensure all environment variables are properly set
4. Verify database migrations are up to date

## **License**
MIT License - See [LICENSE](LICENSE) for details.
