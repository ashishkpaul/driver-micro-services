# Project Directory Structure

```text
.
├── docker-compose.yml
├── eslint.config.js
├── jest.config.js
├── LICENSE
├── package.json
├── README.md
├── src
│   ├── app.module.ts
│   ├── assignment
│   │   ├── assignment.module.ts
│   │   ├── assignment.service.ts
│   │   └── entities
│   │       └── assignment.entity.ts
│   ├── config
│   │   ├── database.config.ts
│   │   └── data-source.ts
│   ├── deliveries
│   │   ├── deliveries.controller.ts
│   │   ├── deliveries.module.ts
│   │   ├── deliveries.service.ts
│   │   ├── dto
│   │   │   ├── create-delivery.dto.ts
│   │   │   └── update-delivery-status.dto.ts
│   │   └── entities
│   │       ├── delivery.entity.ts
│   │       └── delivery-event.entity.ts
│   ├── drivers
│   │   ├── drivers.controller.ts
│   │   ├── drivers.module.ts
│   │   ├── drivers.service.ts
│   │   ├── dto
│   │   │   ├── create-driver.dto.ts
│   │   │   ├── update-driver-location.dto.ts
│   │   │   └── update-driver-status.dto.ts
│   │   └── entities
│   │       └── driver.entity.ts
│   ├── events
│   │   ├── events.controller.ts
│   │   └── events.module.ts
│   ├── health
│   │   ├── health.controller.ts
│   │   ├── health.module.ts
│   │   └── typeorm.health.ts
│   ├── main.ts
│   └── webhooks
│       ├── dto
│       │   └── vendure-webhook.dto.ts
│       ├── webhooks.controller.ts
│       ├── webhooks.module.ts
│       └── webhooks.service.ts
└── tsconfig.json

15 directories, 37 files

# **File Descriptions**

## **Root Directory Files**
- **docker-compose.yml** - Docker configuration for running the driver service with PostgreSQL database
- **eslint.config.js** - ESLint configuration for TypeScript with Prettier integration
- **jest.config.js** - Jest testing configuration for unit and integration tests
- **LICENSE** - MIT License for the project
- **package.json** - Project dependencies and npm scripts for building, testing, and running
- **tsconfig.json** - TypeScript compiler configuration

## **Source Code Files**

### **Core Application**
- **src/app.module.ts** - Main application module that imports all feature modules
- **src/main.ts** - Application bootstrap file with middleware, security, and validation setup

### **Configuration**
- **src/config/database.config.ts** - TypeORM database configuration for entities
- **src/config/data-source.ts** - TypeORM DataSource configuration for migrations

### **Health Module**
- **src/health/health.controller.ts** - Health check endpoints for monitoring
- **src/health/health.module.ts** - Health module definition
- **src/health/typeorm.health.ts** - Custom health indicator for database connectivity

### **Assignment Module**
- **src/assignment/assignment.module.ts** - Module for driver assignment logic
- **src/assignment/assignment.service.ts** - Service to assign drivers to deliveries
- **src/assignment/entities/assignment.entity.ts** - Entity for tracking driver assignments

### **Deliveries Module**
- **src/deliveries/deliveries.controller.ts** - REST API endpoints for delivery management
- **src/deliveries/deliveries.module.ts** - Deliveries module definition
- **src/deliveries/deliveries.service.ts** - Service for delivery lifecycle management
- **src/deliveries/dto/create-delivery.dto.ts** - DTO for creating deliveries
- **src/deliveries/dto/update-delivery-status.dto.ts** - DTO for updating delivery status
- **src/deliveries/entities/delivery.entity.ts** - Main delivery entity
- **src/deliveries/entities/delivery-event.entity.ts** - Entity for delivery status history

### **Drivers Module**
- **src/drivers/drivers.controller.ts** - REST API endpoints for driver management
- **src/drivers/drivers.module.ts** - Drivers module definition
- **src/drivers/drivers.service.ts** - Service for driver CRUD operations and location management
- **src/drivers/dto/create-driver.dto.ts** - DTO for creating drivers
- **src/drivers/dto/update-driver-location.dto.ts** - DTO for updating driver location
- **src/drivers/dto/update-driver-status.dto.ts** - DTO for updating driver status
- **src/drivers/entities/driver.entity.ts** - Driver entity with location and status fields

### **Events Module**
- **src/events/events.controller.ts** - Webhook endpoint for receiving order events from Vendure
- **src/events/events.module.ts** - Events module definition

### **Webhooks Module**
- **src/webhooks/webhooks.controller.ts** - Controller for receiving webhooks from driver apps
- **src/webhooks/webhooks.module.ts** - Webhooks module definition
- **src/webhooks/webhooks.service.ts** - Service for sending webhooks to Vendure
- **src/webhooks/dto/vendure-webhook.dto.ts** - DTOs for Vendure webhook payloads

# **Project Brief**

## **Driver Management & Delivery Orchestration Microservice**

This is a **NestJS-based microservice** designed to manage drivers and orchestrate delivery assignments for an e-commerce platform (Vendure). The service acts as an intermediary between the e-commerce system and delivery personnel.

### **Core Functionality:**
1. **Driver Management** - Register, track, and manage delivery drivers with real-time location updates
2. **Delivery Orchestration** - Automatically assign the nearest available driver to new orders
3. **Webhook Integration** - Two-way webhook communication with Vendure for order events
4. **Delivery Lifecycle** - Track delivery status from assignment to completion/failure

### **Key Features:**
- **V1 Simplified Workflow** - Immediate driver assignment without acceptance workflow
- **Real-time Driver Location** - Track and use driver locations for optimal assignment
- **Delivery Status Tracking** - Comprehensive status updates with proof of delivery/pickup
- **Health Monitoring** - Built-in health checks for service and database
- **Security** - Webhook secret validation, Helmet, CORS, and input validation
- **Logging** - Winston-based structured logging to files and console

### **Architecture:**
- **NestJS Framework** - Modular, scalable architecture
- **PostgreSQL Database** - Persistent storage with TypeORM
- **Docker Deployment** - Containerized with PostgreSQL dependency
- **REST APIs** - Internal management endpoints
- **Webhook-based Events** - External system integration

### **Integration Points:**
1. **From Vendure** - Receives `seller-order-ready` events
2. **To Vendure** - Sends delivery status updates (assigned, picked up, delivered, failed)
3. **From Driver App** - Receives location updates and status changes

### **Business Logic:**
- Automatically finds the nearest available driver using Haversine formula
- Updates driver status to "BUSY" when assigned
- Maintains complete audit trail of delivery events
- Handles delivery failures with reason codes

The service is production-ready with proper error handling, logging, monitoring, and follows v1 simplified rules where assignments are immediate and final without driver acceptance workflow.
