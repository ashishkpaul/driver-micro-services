# BuyLits Driver System — Comprehensive Roadmap

This document is the reviewed implementation roadmap for the `driver-backend-nest` and `driver-frontend-pwa` repositories, based on source-code validation rather than assumptions alone.

## Review Summary

I broadly agree with the proposed assessment and execution order, with a few important corrections from the actual codebase:

- **Hotfix 1 is valid and urgent**: route collisions are real in `admin.controller.ts` and `deliveries.controller.ts` because fixed string routes appear after `:id`.
- **Hotfix 2 is valid**: frontend admin APIs point at incorrect endpoints; canonical backend endpoints exist under `/admin/drivers`.
- **Hotfix 3 is valid**: `ProtectedRoute.jsx` uses Zustand incorrectly and should rely on selector-safe access and `usePermissions()`.
- **Drivers route ordering is mostly already correct**: `available` and `me` already precede `:id`, but some endpoints remain under-guarded.
- **Security gaps are real**: multiple delivery endpoints and `GET /drivers/:id/stats` are exposed without proper auth/ownership enforcement.
- **Driver availability logic is incomplete**: dispatch eligibility currently does not enforce `registrationStatus === APPROVED`.
- **Stats implementation needs hardening**: `getDriverStats()` currently fetches up to 10,000 records and aggregates in memory.
- **Endpoint duplication exists**: some admin driver functionality is split across both `/admin/users/*` and `/admin/drivers/*`, and should be normalized.

## Canonical API Direction

To avoid continued frontend/backend drift, use these canonical domains:

- `/auth` → authentication/session endpoints
- `/drivers` → driver self-service and driver operational endpoints
- `/deliveries` → delivery operational endpoints
- `/admin/users` → admin user management only
- `/admin/drivers` → driver admin operations only
- `/admin/deliveries` → admin delivery analytics and listing
- `/admin/zones` → zone management

Also mark these as consolidation/deprecation candidates:

- `/admin/users/pending-drivers` vs `/admin/drivers/pending`
- `/drivers/:id/activate|deactivate` vs `/admin/drivers/:id/enable|disable`

## Execution Priority

1. Immediate hotfixes
2. Security hardening of exposed endpoints
3. Missing backend API surface completion
4. Dispatch/business logic correctness
5. Driver app completion
6. Admin app completion
7. Production hardening

---

## Phase 1 — Immediate Hotfixes

### 1.1 Backend: route ordering collisions

#### `src/controllers/admin.controller.ts`

Reorder all `@Get()` handlers so fixed routes come before parameterized ones.

**Target order inside `@Controller('admin/users')`:**

1. `@Get('me')`
2. `@Get('stats')`
3. `@Get('stats/overview')`
4. `@Get('pending-drivers')`
5. `@Get('driver-stats')`
6. `@Get(':id')`

Keep patches/posts/deletes below in stable order:
7. `@Patch('me/change-password')`
8. `@Patch(':id')`
9. `@Delete(':id')`
10. `@Post(':id/reset-password')`

#### `src/deliveries/deliveries.controller.ts`

Move fixed routes above `@Get(':id')`:

- `@Get('seller-order/:sellerOrderId')`
- `@Get('seller-order/:sellerOrderId/history')`
- `@Get('drivers/:driverId/active')`
- then `@Get(':id')`

#### `src/drivers/drivers.controller.ts`

No route-order hotfix needed for `available` and `me`; they already precede `:id`.

### 1.2 Frontend: fix `src/api/admin.js`

Replace incorrect endpoints with canonical admin driver routes:

- `listDrivers()` → `GET /admin/drivers`
- `approveDriver(id)` → `PATCH /admin/drivers/:id/approve`
- `rejectDriver(id, reason)` → `PATCH /admin/drivers/:id/reject`
- `activateDriver(id)` → `PATCH /admin/drivers/:id/enable`
- `deactivateDriver(id)` → `PATCH /admin/drivers/:id/disable`

### 1.3 Frontend: fix `ProtectedRoute.jsx`

Use `usePermissions()` as the primary auth/role source and avoid destructuring Zustand without selector access.

Recommended behavior:

- no token or expired token → redirect to `/login` or `/admin/login`
- disallowed role → redirect to appropriate dashboard/home
- admin-only routes should check admin role explicitly

### 1.4 Smoke validation

Verify:

- `GET /admin/users/driver-stats` returns 200
- Admin driver roster loads correctly
- Approve/reject/enable/disable buttons hit working endpoints

---

## Phase 2 — Security Hardening of Exposed Endpoints

This phase should happen before major UI completion because several endpoints are currently exposed.

### 2.1 Add guards to delivery endpoints

Apply JWT guards to:

- `POST /deliveries`
- `GET /deliveries`
- `GET /deliveries/:id`
- `PATCH /deliveries/:id/status`
- `GET /deliveries/drivers/:driverId/active`
- `POST /deliveries/:id/otp/verify`
- preferably `POST /deliveries/:id/otp/regenerate` as well

### 2.2 Add ownership/role checks

- A driver can only query their own active delivery
- A driver can only verify OTP for their own active/assigned delivery
- A driver must not query another driver’s stats unless permitted as admin

### 2.3 Guard `GET /drivers/:id/stats`

This endpoint is currently exposed and should be protected with JWT + policy/ownership logic.

---

## Phase 3 — Complete Missing Backend API Surface

### 3.1 Auth

#### `GET /auth/me`

JWT-guarded session introspection endpoint for both driver and admin sessions.

Returns:

- driver session profile for driver users
- admin response DTO for admin users

### 3.2 Admin deliveries

#### `GET /admin/deliveries/stats`

Build via a dedicated `DeliveryStatsService` using TypeORM query builder.

Return:

- `total`
- `byStatus`
- `activeDeliveries`
- `completedToday`
- `failedToday`
- `avgDeliveryTimeMinutes`
- `slaBreachCount`

#### `GET /admin/deliveries`

Support filters:

- `status`
- `driverId`
- `cityId`
- `dateFrom`
- `dateTo`
- `skip`
- `take`

Honor admin city scoping:

- ADMIN → own city only
- SUPER_ADMIN → global

#### `GET /admin/drivers/:id/deliveries`

Return driver-specific delivery history for admin drill-down.

### 3.3 Driver earnings

#### `GET /drivers/me/earnings?period=today|week|month`

Return:

- `period`
- `totalDeliveries`
- `completedDeliveries`
- `failedDeliveries`
- `totalEarnings`
- `avgDeliveryTimeMinutes`
- daily `history[]`

### 3.4 Zones

Create `src/controllers/zone.controller.ts` under `@Controller('admin/zones')`:

- `GET /admin/zones`
- `POST /admin/zones`
- `PATCH /admin/zones/:id`
- `DELETE /admin/zones/:id`
- `GET /admin/zones/:id/drivers`

### 3.5 Driver admin list filter correctness

Ensure `isActive?: boolean` is properly parsed/coerced from query strings via DTO transform and applied correctly in service query builders.

---

## Phase 4 — Dispatch / Business Logic Correctness

### 4.1 Block dispatch for non-approved drivers

#### `DriverCapabilityService.checkDeliveryAcceptanceCapability()`

Add checks for:

- `isActive === true`
- `registrationStatus === APPROVED`
- `status === AVAILABLE`

#### `DriversService.findAvailable()`

Add filters for:

- `isActive = true`
- `status = AVAILABLE`
- `registrationStatus = APPROVED`

### 4.2 OTP verification hardening

Protect `POST /deliveries/:id/otp/verify` with JWT and ownership checks.

### 4.3 Dispatch mode feature flag

Add `DISPATCH_MODE=v1|v2`:

- `v1` → current direct assignment path
- `v2` → safe dispatch / offers flow

Keep `v1` default to avoid regressions.

### 4.4 Dev seed tooling

Add `scripts/seed-dev-data.ts` to:

- seed major cities
- seed default zones
- keep SUPER_ADMIN global
- create one test ADMIN per city

Wire as `npm run db:seed:dev`.

### 4.5 Cancellation webhook forwarding

Update `DeliveryCancelledHandler` to notify Vendure via `WebhooksService.notifyVendure('DELIVERY_CANCELLED', ...)`.

---

## Phase 5 — Driver PWA Completion

### 5.1 Session/profile foundation

- Call `GET /auth/me` on boot
- refresh driver profile in Zustand
- enforce `registrationStatus` gates
- short-term token expiry behavior: clear session and redirect to login with toast

### 5.2 Home screen

- live stats via backend
- online/offline toggle
- presence heartbeat verification
- gate unapproved users to pending approval flow

### 5.3 Active delivery flow

Wire status-driven UX:

- `ASSIGNED`
- `PICKED_UP`
- `IN_TRANSIT`
- `DELIVERED`
- `FAILED`

Integrate:

- status update endpoint
- OTP verification endpoint
- proof upload flow verification

### 5.4 Offers flow

- verify socket event handling
- ensure offers store is populated correctly
- wire accept/reject endpoints under `/v2/`
- navigate to active delivery after acceptance

### 5.5 Earnings screen

- connect to real earnings API
- show period toggles
- history visualization and table

### 5.6 Profile/settings

- self-edit profile flow
- logout
- preferences
- settings stubs where backend is not yet available

---

## Phase 6 — Admin Frontend Completion

### 6.1 Admin layout first

Create `AdminLayout.jsx` with:

- sidebar/bottom tabs
- role badge
- city name
- logout
- role-sensitive tab visibility

### 6.2 Driver roster UX

- replace `prompt()` with `RejectDriverModal`
- improve action states and error handling

### 6.3 Delivery operations UI

- add “Live Deliveries” section using `/admin/deliveries`
- start with list view before map integration

### 6.4 Driver detail page

Add `/admin/drivers/:id` with:

- profile
- status/approval actions
- active delivery
- paginated history
- stats
- enable/disable controls

### 6.5 Super admin user management

- create admin modal
- admin list table
- reset password flow
- enable/disable admin actions

---

## Phase 7 — Production Hardening

### 7.1 Refresh tokens

- `POST /auth/refresh`
- `POST /auth/logout`
- refresh token persistence
- rotation and revocation

### 7.2 Rate limiting and lockout

- throttle `POST /auth/admin/login`
- track `failedLoginAttempts`
- add `lockedUntil`
- disable/lock account after repeated failures

### 7.3 Audit log completeness

- add `@AuditResource()` decorator
- extract `resourceType` and `resourceId` reliably in interceptor

### 7.4 Replace fetch-all stats aggregation

Refactor `DriverAdminApplicationService.getDriverStats()` to use DB-side count queries instead of fetching up to 10,000 drivers into memory.

### 7.5 Drift false-positive fix

Normalize enum-vs-`USER-DEFINED` comparisons in schema diff logic so enum columns do not trigger false-positive drift warnings.

---

## Risks and Dependencies

### Key Risks

- **API duplication risk**: overlapping admin endpoints will continue to cause regressions unless canonical ownership is enforced.
- **Permission drift risk**: adding guards without aligning role/policy checks may break admin workflows.
- **Dispatch regression risk**: introducing offers flow without a strict feature flag may destabilize dispatch.
- **Auth/session ambiguity risk**: shared store/token handling between admin and driver flows needs careful separation.

### Dependencies

- `GET /auth/me` should land before most driver PWA completion work.
- Delivery endpoint security should land before ActiveDeliveryScreen hardening.
- Canonical admin endpoint decisions should be finalized before admin UI expansion.
- `DISPATCH_MODE` should be in place before deeply integrating offer-based flow in the frontend.

## Recommended Delivery Sequence

### Sprint 1

- Phase 1 hotfixes
- Phase 2 security hardening
- Start Phase 3 auth/admin deliveries surface

### Sprint 2

- Finish Phase 3
- Phase 4 dispatch/business logic correctness
- Begin Phase 5 driver app completion

### Sprint 3

- Finish Phase 5
- Phase 6 admin frontend completion
- Phase 7 production hardening backlog kickoff

## Acceptance Criteria for Immediate Start

The roadmap can be considered successfully underway once the following are true:

1. `GET /admin/users/driver-stats` returns 200 reliably
2. Admin driver roster uses only `/admin/drivers/*` endpoints
3. `ProtectedRoute.jsx` no longer relies on invalid Zustand destructuring
4. Unauthenticated users cannot access exposed delivery endpoints
5. Driver availability/dispatch excludes inactive or non-approved drivers
