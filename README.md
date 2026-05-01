# Driver Microservice

NestJS backend for the BuyLits last-mile delivery platform. Manages the complete driver lifecycle — registration, dispatch, real-time delivery tracking, and fulfilment callbacks to Vendure.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+, NestJS 10 |
| Database | PostgreSQL 15 + TypeORM (migrations only, no sync) |
| Cache / Presence | Redis 7 (ioredis) |
| Real-time | Socket.IO (JWT-authenticated, `/driver` namespace) |
| Auth | JWT (driver + admin), Google SSO, OTP email |
| Job Queue | Outbox pattern (PostgreSQL-backed, adaptive batching) |
| Observability | OpenTelemetry tracing, Winston structured logging |
| Push | Firebase Cloud Messaging (optional) |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Minimum required: DB_*, REDIS_*, JWT_SECRET

# 3. Start infrastructure (Postgres + Redis)
docker compose up -d postgres redis

# 4. Run migrations
npm run db:migrate

# 5. Seed super admin
npm run init:superadmin

# 6. Start dev server
npm run start:dev
```

Service starts on `PORT` (default **3002**).
Swagger UI: `http://localhost:3002/api/docs`

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DB_HOST` | Postgres host |
| `DB_PORT` | Postgres port (default `5432`) |
| `DB_USER` | Postgres user |
| `DB_PASSWORD` | Postgres password |
| `DB_NAME` | Database name |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `REDIS_PASSWORD` | Redis password |
| `JWT_SECRET` | JWT signing secret |

### Integration

| Variable | Description |
|---|---|
| `VENDURE_WEBHOOK_URL` | Vendure inbound webhook endpoint |
| `VENDURE_TO_DRIVER_SECRET` | Shared secret for Vendure → Driver calls |
| `DRIVER_TO_VENDURE_SECRET` | Shared secret for Driver → Vendure callbacks |

### Optional

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `3002`) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `SMTP_HOST/PORT/FROM` | SMTP for OTP emails |
| `FIREBASE_PROJECT_ID/PRIVATE_KEY/CLIENT_EMAIL` | FCM push notifications |
| `OPS_ALERT_WEBHOOK_URL` | Slack/Discord webhook for DLQ alerts |
| `DISPATCH_MODE` | `v1` (direct) or `v2` (offers flow) |

---

## Delivery Lifecycle

The core flow from order placement to fulfilment:

```
Vendure (PaymentSettled)
  └─► POST /events/seller-order-ready          ← Vendure → Driver
        └─► Create Delivery (PENDING)
        └─► Find nearest available driver
        └─► Create Offer → emit OFFER_CREATED_V2 via WebSocket
              └─► Driver accepts offer
                    └─► Delivery → ASSIGNED
                    └─► Outbox: DELIVERY_ASSIGNED_V1
                          └─► POST /webhooks/driver-events  ← Driver → Vendure
                                └─► Vendure: DeliveryAssignment ASSIGNED

Driver picks up order
  └─► WebSocket: proof:uploaded (PICKUP)
        └─► Delivery → PICKED_UP
        └─► Outbox: DELIVERY_PICKUP_CONFIRMED_V1 → Vendure webhook
              └─► Vendure: Order PaymentSettled → Shipped

Driver delivers order
  └─► WebSocket: proof:uploaded (DROPOFF)
        └─► Delivery → DELIVERED
        └─► Outbox: DELIVERY_DROPOFF_CONFIRMED_V1 → Vendure webhook
              └─► Vendure: Order Shipped → Delivered
```

### Delivery States

```
PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
                ↘                           ↗
                  FAILED ←→ (retry loop)
                CANCELLED  (terminal)
```

---

## API Reference

### Auth (`/auth`)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Driver login |
| POST | `/auth/register` | Driver self-registration |
| POST | `/auth/otp/request` | Request OTP email |
| POST | `/auth/otp/verify` | Verify OTP |
| POST | `/auth/google` | Google SSO |
| POST | `/auth/admin/login` | Admin login |
| POST | `/auth/refresh` | Refresh JWT |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Current user profile |
| GET | `/auth/cities` | Available cities |

### Drivers (`/drivers`)

| Method | Path | Description |
|---|---|---|
| GET | `/drivers` | List drivers |
| GET | `/drivers/me` | Own profile |
| GET | `/drivers/:id` | Driver by ID |
| PATCH | `/drivers/me/profile` | Update own profile |
| PATCH | `/drivers/:id/location` | Update location |
| PATCH | `/drivers/:id/status` | Update status (`AVAILABLE`/`BUSY`/`OFFLINE`) |
| GET | `/drivers/me/earnings` | Earnings summary |
| GET | `/drivers/:id/stats` | Driver stats |

### Deliveries (`/deliveries`)

| Method | Path | Description |
|---|---|---|
| GET | `/deliveries` | List deliveries (filterable) |
| GET | `/deliveries/:id` | Delivery by ID |
| PATCH | `/deliveries/:id/status` | Update status (idempotent) |
| GET | `/deliveries/drivers/:id/active` | Active delivery for driver |
| POST | `/deliveries/:id/otp/generate` | Generate delivery OTP |
| POST | `/deliveries/:id/otp/verify` | Verify OTP (triggers DELIVERED) |

### Offers (`/v2/offers`)

| Method | Path | Description |
|---|---|---|
| POST | `/v2/drivers/:driverId/offers/:offerId/accept` | Accept offer |
| POST | `/v2/drivers/:driverId/offers/:offerId/reject` | Reject offer |
| GET | `/v2/offers/driver/:driverId` | Driver's pending offers |
| GET | `/v2/offers/delivery/:deliveryId` | Offers for a delivery |

### Events (Vendure → Driver)

| Method | Path | Description |
|---|---|---|
| POST | `/events/seller-order-ready` | Trigger dispatch for a seller order |

### Webhooks (Driver → Vendure)

| Method | Path | Description |
|---|---|---|
| POST | `/webhooks/driver-events` | Receive inbound driver lifecycle events |

Supported inbound events: `DELIVERY_ASSIGNED_V1`, `DELIVERY_PICKUP_CONFIRMED_V1`, `DELIVERY_DROPOFF_CONFIRMED_V1`, `DELIVERY_FAILED_V1`, `DELIVERY_CANCELLED_V1`

### Admin — Users (`/admin/users`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/users` | List admin users |
| POST | `/admin/users` | Create admin (SUPER_ADMIN only) |
| PATCH | `/admin/users/:id` | Update admin |
| DELETE | `/admin/users/:id` | Disable admin (SUPER_ADMIN only) |
| POST | `/admin/users/:id/reset-password` | Reset password |
| GET | `/admin/users/pending-drivers` | Pending driver approvals |

### Admin — Drivers (`/admin/drivers`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/drivers` | List drivers with filters |
| GET | `/admin/drivers/pending` | Pending approvals |
| PATCH | `/admin/drivers/:id/approve` | Approve registration |
| PATCH | `/admin/drivers/:id/reject` | Reject registration |
| PATCH | `/admin/drivers/bulk/status` | Bulk enable/disable |

### Admin — Deliveries (`/admin/deliveries`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/deliveries` | All deliveries |
| GET | `/admin/deliveries/stats` | Delivery statistics |

### Admin — Dead Letter Queue (`/admin/dead-letter`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/dead-letter/failed` | List failed outbox events |
| POST | `/admin/dead-letter/:id/retry` | Retry a failed event |
| POST | `/admin/dead-letter/retry-all` | Retry all failed events |
| POST | `/admin/dead-letter/cleanup` | Cleanup expired events |

### Admin — Archive (`/admin/archive`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/archive/stats` | Archive statistics |
| POST | `/admin/archive/archive` | Archive old events |
| POST | `/admin/archive/emergency` | Emergency archive |

### Delivery Metrics (`/delivery-metrics`)

| Method | Path | Description |
|---|---|---|
| GET | `/delivery-metrics/summary` | Aggregate metrics |
| GET | `/delivery-metrics/delivery/:id` | Per-delivery metrics |
| GET | `/delivery-metrics/driver/:id` | Per-driver metrics |

### Health (`/health`)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Basic liveness |
| GET | `/health/ready` | Readiness probe (DB + Redis) |
| GET | `/health/status` | Full system status |
| GET | `/health/outbox` | Outbox queue health |
| GET | `/health/dashboard` | Health dashboard |

### Zones (`/zones`)

| Method | Path | Description |
|---|---|---|
| GET | `/zones` | List zones |
| POST | `/zones` | Create zone |
| PATCH | `/zones/:id` | Update zone |
| DELETE | `/zones/:id` | Delete zone |

---

## WebSocket

Connect to `ws://localhost:3002/driver` with `Authorization: Bearer <token>`.

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `LOCATION_UPDATE_V1` | `{ lat, lon, accuracy?, heading? }` | Location update |
| `DRIVER_STATUS_V1` | `{ status }` | Status change |
| `DRIVER_HEARTBEAT_V1` | `{ timestamp }` | Presence keepalive |
| `PROOF_UPLOADED_V1` | `{ deliveryId, proofType, imageUrl }` | Proof of pickup/delivery |
| `SYNC_STATE_V1` | — | Request full state sync |
| `PING_V1` | — | Connection ping |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `OFFER_CREATED_V2` | Offer object | New delivery offer |
| `DELIVERY_ASSIGNED` | Delivery object | Assignment confirmed |
| `PROOF_ACCEPTED_V1` | `{ deliveryId, proofType }` | Proof accepted |
| `LOCATION_ACK` | `{ received: true }` | Location acknowledged |
| `error` | `{ code, message }` | Error notification |

---

## Roles & Permissions

| Role | Access |
|---|---|
| `DRIVER` | Own profile, own deliveries, location, offers |
| `ADMIN` | Drivers and deliveries in their city |
| `SUPER_ADMIN` | All cities, all admins, system configuration |

---

## Outbox Worker

Domain events (webhooks to Vendure, WebSocket notifications) are processed asynchronously via a PostgreSQL-backed outbox. The worker runs in the same process by default, or as a standalone process for horizontal scaling.

```bash
# Standalone worker (production)
node dist/driver-backend-nest/src/worker.js
```

The outbox provides:
- At-least-once delivery with exponential backoff (up to 10 retries)
- Circuit breaker per event type (opens after 5 failures)
- Idempotency keys to prevent duplicate processing
- Dead letter queue for events that exhaust retries
- Automatic archival of completed events

---

## Database Migrations

```bash
npm run db:new <Name>     # Generate a new migration
npm run db:migrate        # Run pending migrations
npm run db:rollback       # Revert last migration
npm run db:status         # Show migration status
npm run db:drift          # Check for schema drift
npm run db:deploy         # Full deploy: validate → simulate → run → verify
```

### Migration Prefix Convention

| Prefix | Meaning |
|---|---|
| `SAFE_` | Additive only (new tables, columns, indexes) |
| `DATA_` | Data backfills |
| `BREAKING_` | Destructive changes (DROP, SET NOT NULL) |
| `FIX_` | Targeted repairs |
| `BASELINE_` | Full schema snapshot |

---

## Project Structure

```
src/
├── auth/                  # JWT, Google SSO, OTP, guards, ABAC permissions
├── drivers/               # Driver entity, registration, capability, scoring
├── deliveries/            # Delivery FSM, SLA monitor, OTP verification
├── offers/                # Offer creation, acceptance, expiry
├── assignment/            # Driver assignment authorization
├── websocket/             # Socket.IO gateway, proof handler, presence
├── domain-events/         # Outbox worker, handlers, circuit breaker, DLQ
├── dispatch-scoring/      # Multi-factor driver scoring
├── safe-dispatch/         # Canary dispatch with scoring rollout
├── delivery-intelligence/ # Delivery metrics, driver stats
├── webhooks/              # Inbound Vendure webhook receiver
├── events/                # Seller order event controller
├── admin/                 # Admin user management
├── controllers/           # Admin REST controllers
├── health/                # Health checks and dashboard
├── schema/                # Schema control plane, drift detection
├── observability/         # OpenTelemetry, Winston, request context
├── redis/                 # Redis service with circuit breaker
├── push/                  # Firebase push notifications
├── bootstrap/             # Startup orchestration, Swagger
├── config/                # TypeORM data source, naming strategies
├── migrations/            # TypeORM migration files
└── worker/                # Standalone outbox worker entry point
```

---

## Scripts

```bash
npm run start:dev          # Dev server with hot reload
npm run build              # Compile TypeScript
npm run start:prod         # Production (compiled)
npm run test               # Unit tests
npm run test:e2e           # E2E tests (runs migrations first)
npm run lint               # ESLint
npm run init:superadmin    # Seed super admin
npm run db:seed:dev        # Seed dev data
npm run openapi:generate   # Generate OpenAPI spec
npm run openapi:check      # Check for API drift
```

---

## Docker

```bash
docker build -t driver-micro-services .
docker run -p 3002:3002 --env-file .env driver-micro-services
```
