# Driver Microservice

NestJS backend for the ZapRide driver platform. Provides REST + WebSocket APIs for driver management, delivery lifecycle, real-time dispatch, and admin operations.

## Stack

- **Runtime**: Node.js 18+, NestJS 10
- **Database**: PostgreSQL + TypeORM (migrations-only, no sync)
- **Cache / Presence**: Redis (ioredis)
- **Real-time**: Socket.IO (JWT-authenticated)
- **Auth**: JWT (driver) + JWT (admin), Google SSO, OTP email
- **Observability**: OpenTelemetry tracing, Winston logging, health endpoints
- **Push**: Firebase Cloud Messaging (optional)

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env — set DB_*, REDIS_*, JWT_SECRET at minimum

# 3. Start infrastructure
docker compose up -d

# 4. Run migrations
npm run db:migrate

# 5. Seed super admin
npm run init:superadmin

# 6. Start dev server
npm run start:dev
```

Service starts on `PORT` (default `3001`). Swagger UI at `http://localhost:3001/api`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | ✅ | Postgres host |
| `DB_PORT` | ✅ | Postgres port (default `5432`) |
| `DB_USER` | ✅ | Postgres user |
| `DB_PASSWORD` | ✅ | Postgres password |
| `DB_NAME` | ✅ | Database name |
| `REDIS_HOST` | ✅ | Redis host |
| `REDIS_PORT` | ✅ | Redis port |
| `REDIS_PASSWORD` | ✅ | Redis password |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `PORT` | — | HTTP port (default `3001`) |
| `CORS_ORIGINS` | — | Comma-separated allowed origins |
| `VENDURE_WEBHOOK_URL` | — | Vendure webhook endpoint |
| `WEBHOOK_SECRET` | — | Shared webhook secret |
| `SMTP_HOST` | — | SMTP host for OTP emails |
| `SMTP_PORT` | — | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | From address |
| `FIREBASE_PROJECT_ID` | — | FCM project ID (push notifications) |
| `FIREBASE_PRIVATE_KEY` | — | FCM service account key |
| `FIREBASE_CLIENT_EMAIL` | — | FCM service account email |
| `OPS_ALERT_WEBHOOK_URL` | — | Slack/Discord webhook for ops alerts |

---

## API Routes

### Auth (`/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Driver login (email + password) |
| POST | `/auth/register` | Driver registration |
| POST | `/auth/otp/request` | Request OTP email |
| POST | `/auth/otp/verify` | Verify OTP |
| POST | `/auth/google` | Google SSO login |
| POST | `/auth/admin/login` | Admin login |
| POST | `/auth/refresh` | Refresh JWT |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Current driver profile |
| GET | `/auth/cities` | Available cities |

### Drivers (`/drivers`)
| Method | Path | Description |
|---|---|---|
| GET | `/drivers` | List drivers |
| GET | `/drivers/me` | Own profile |
| GET | `/drivers/available` | Available drivers |
| GET | `/drivers/:id` | Driver by ID |
| POST | `/drivers` | Create driver |
| PATCH | `/drivers/me/profile` | Update own profile |
| PATCH | `/drivers/me/location` | Update location |
| PATCH | `/drivers/me/status` | Update status (AVAILABLE/BUSY/OFFLINE) |
| GET | `/drivers/me/earnings` | Earnings summary |
| GET | `/drivers/me/score` | Dispatch score |
| GET | `/drivers/stats` | Driver stats |

### Deliveries (`/deliveries`)
| Method | Path | Description |
|---|---|---|
| GET | `/deliveries` | List deliveries |
| POST | `/deliveries` | Create delivery |
| GET | `/deliveries/:id` | Delivery by ID |
| PATCH | `/deliveries/:id/status` | Update delivery status |
| POST | `/deliveries/:id/assign` | Assign driver |
| GET | `/deliveries/driver/active` | Active delivery for current driver |
| GET | `/deliveries/driver/history` | Delivery history |
| GET | `/deliveries/seller/:orderId` | By seller order ID |
| POST | `/deliveries/:id/otp/generate` | Generate OTP |
| POST | `/deliveries/:id/otp/verify` | Verify OTP |

### Offers (`/v2/offers`)
| Method | Path | Description |
|---|---|---|
| POST | `/v2/offers` | Create offer |
| POST | `/v2/offers/:id/accept` | Accept offer |
| POST | `/v2/offers/:id/reject` | Reject offer |
| GET | `/v2/offers/driver/:driverId` | Driver's offers |
| GET | `/v2/offers/delivery/:deliveryId` | Delivery's offers |

### Admin — Users (`/admin/users`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/users/me` | Current admin profile |
| GET | `/admin/users/stats` | Admin user stats |
| GET | `/admin/users` | List admin users |
| POST | `/admin/users` | Create admin user (SUPER_ADMIN) |
| GET | `/admin/users/:id` | Admin by ID |
| PATCH | `/admin/users/:id` | Update admin |
| DELETE | `/admin/users/:id` | Disable admin (SUPER_ADMIN) |
| POST | `/admin/users/:id/reset-password` | Reset password (SUPER_ADMIN) |
| PATCH | `/admin/users/me/change-password` | Change own password |
| GET | `/admin/users/pending-drivers` | Pending driver approvals |
| GET | `/admin/users/driver-stats` | Driver statistics |

### Admin — Drivers (`/admin/drivers`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/drivers` | List drivers (with filters) |
| GET | `/admin/drivers/pending` | Pending approval drivers |
| PATCH | `/admin/drivers/:id/status` | Enable/disable driver |
| PATCH | `/admin/drivers/:id/enable` | Enable driver |
| PATCH | `/admin/drivers/:id/disable` | Disable driver |
| PATCH | `/admin/drivers/:id/approve` | Approve registration |
| PATCH | `/admin/drivers/:id/reject` | Reject registration |
| PATCH | `/admin/drivers/bulk/status` | Bulk enable/disable |

### Admin — Deliveries (`/admin/deliveries`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/deliveries` | List all deliveries |
| GET | `/admin/deliveries/stats` | Delivery statistics |
| GET | `/admin/deliveries/drivers/:id/deliveries` | Deliveries by driver |

### Admin — Dead Letter Queue (`/admin/dead-letter`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/dead-letter` | Inspect failed events |
| GET | `/admin/dead-letter/failed` | List failed events |
| GET | `/admin/dead-letter/failed/:id` | Failed event detail |
| POST | `/admin/dead-letter/:id/retry` | Retry event |
| POST | `/admin/dead-letter/retry-all` | Retry all failed |
| POST | `/admin/dead-letter/cleanup` | Cleanup expired |
| GET | `/admin/dead-letter/threshold` | Failure threshold check |

### Admin — Archive (`/admin/archive`)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/archive/stats` | Archive statistics |
| GET | `/admin/archive/hot-table-stats` | Hot table stats |
| GET | `/admin/archive/events` | Archived events |
| POST | `/admin/archive/archive` | Archive old events |
| POST | `/admin/archive/hard-delete` | Hard delete old archives |
| POST | `/admin/archive/emergency` | Emergency archive |

### Zones (`/zones`)
| Method | Path | Description |
|---|---|---|
| GET | `/zones` | List zones |
| POST | `/zones` | Create zone |
| PATCH | `/zones/:id` | Update zone |
| DELETE | `/zones/:id` | Delete zone |
| GET | `/zones/:id/drivers` | Drivers in zone |

### Health (`/health`)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Basic health check |
| GET | `/health/ready` | Readiness probe |
| GET | `/health/status` | System status |
| GET | `/health/metrics` | System metrics |
| GET | `/health/schema` | Schema status |
| GET | `/health/db-pool` | DB pool status |
| GET | `/health/features` | Feature flags |
| GET | `/health/outbox` | Outbox health |
| GET | `/health/summary` | Health summary |
| GET | `/health/dashboard` | Health dashboard |
| GET | `/health/components` | Component health |

### Webhooks (`/webhooks`)
| Method | Path | Description |
|---|---|---|
| POST | `/webhooks/driver-events` | Receive Vendure driver events |

### Events (`/events`)
| Method | Path | Description |
|---|---|---|
| POST | `/events/seller-order-ready` | Seller order ready trigger |

### Delivery Metrics (`/delivery-metrics`)
| Method | Path | Description |
|---|---|---|
| GET | `/delivery-metrics/summary` | Metrics summary |
| GET | `/delivery-metrics/delivery/:id` | By delivery |
| GET | `/delivery-metrics/driver/:id` | By driver |

### Audit (`/audit`)
| Method | Path | Description |
|---|---|---|
| GET | `/audit/me` | Own audit logs |
| GET | `/audit/action/:action` | By action |
| GET | `/audit/resource/:type/:id` | By resource |
| GET | `/audit/date-range` | By date range |
| GET | `/audit/stats` | Audit stats |
| DELETE | `/audit/cleanup` | Cleanup old logs |

---

## WebSocket Events

Connect to `ws://localhost:PORT` with `Authorization: Bearer <token>`.

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `location:update` | `{ lat, lon, accuracy?, heading? }` | Driver location update |
| `driver:status` | `{ status }` | Status change |
| `driver:heartbeat` | `{ timestamp }` | Presence heartbeat |
| `delivery:status` | `{ deliveryId, status }` | Delivery status update |
| `proof:uploaded` | `{ deliveryId, type, url }` | Proof of delivery |
| `ping` | — | Connection keepalive |
| `sync:state` | — | Request state sync |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `delivery:assigned` | Delivery object | New delivery assigned |
| `delivery:assigned_v1` | Versioned delivery event | Offer notification |
| `location:ack` | `{ received: true }` | Location acknowledged |
| `proof:accepted` | `{ deliveryId }` | Proof accepted |
| `error` | `{ message }` | Error notification |

---

## Roles & Permissions

| Role | Access |
|---|---|
| `DRIVER` | Own profile, own deliveries, location updates, offers |
| `ADMIN` | Drivers in their city, deliveries, approvals |
| `SUPER_ADMIN` | All cities, all admins, system configuration |

---

## Database Migrations

```bash
# Create a new migration
npm run db:new AddDriverRating

# Run pending migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback

# Check migration status
npm run db:status

# Full deploy (validate + simulate + run + verify)
npm run db:deploy

# Check for schema drift
npm run db:drift

# Verify schema integrity
npm run db:verify
```

### Migration Prefix Convention
- `SAFE_` — additive changes (new tables, columns, indexes)
- `DATA_` — data backfills
- `BREAKING_` — destructive changes (DROP, SET NOT NULL)
- `FIX_` — targeted repairs
- `BASELINE_` — full schema snapshot (auto-generated)

---

## Scripts

```bash
npm run start:dev          # Development with hot reload
npm run build              # Compile TypeScript
npm run start:prod         # Production start
npm run test               # Unit tests
npm run test:e2e           # E2E tests (runs migrations first)
npm run lint               # ESLint
npm run init:superadmin    # Seed super admin account
npm run db:seed:dev        # Seed development data
npm run openapi:generate   # Generate OpenAPI spec
npm run openapi:check      # Check for API drift
```

---

## Project Structure

```
src/
├── auth/                  # JWT, Google SSO, OTP, guards, permissions
├── drivers/               # Driver entity, service, registration, capability
├── deliveries/            # Delivery lifecycle, state machine, SLA monitor
├── assignment/            # Driver assignment logic
├── offers/                # Offer creation and acceptance flow
├── websocket/             # Socket.IO gateway, presence, metrics
├── domain-events/         # Outbox pattern, event handlers, dead letter queue
├── admin/                 # Admin user management
├── controllers/           # Admin REST controllers (drivers, deliveries, audit)
├── dispatch-scoring/      # Multi-factor driver scoring for dispatch
├── safe-dispatch/         # Canary dispatch with scoring rollout
├── delivery-intelligence/ # Delivery metrics, driver stats
├── schema/                # Schema control plane, drift detection, migrations
├── health/                # Health checks and dashboard
├── observability/         # OpenTelemetry, Winston, performance tracking
├── push/                  # Firebase push notifications
├── webhooks/              # Vendure webhook receiver
├── events/                # Seller order events
├── redis/                 # Redis service with circuit breaker
├── bootstrap/             # Startup orchestration, Swagger setup
├── config/                # TypeORM data source, naming strategies
├── migrations/            # TypeORM migration files
└── worker/                # Standalone outbox worker process
```

---

## Running the Outbox Worker

The outbox worker runs as a separate process to process domain events:

```bash
# Development
npx ts-node src/worker.ts

# Production
node dist/driver-backend-nest/src/worker.js
```

---

## Docker

```bash
docker build -t driver-micro-services .
docker run -p 3001:3001 --env-file .env driver-micro-services
```
