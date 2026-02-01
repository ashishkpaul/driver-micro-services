# ADR-024 through ADR-031: V2 Architecture Decisions

**Version:** Draft (Post-GA Planning)  
**Date:** January 31, 2026  
**Scope:** v2.0.0 planned features and architectural evolution

---

# ADR-024: Driver Offer + Accept Workflow

**Status:** Planned (v2.0.0 Phase 1)  
**Date:** 2026-01-31

## Context

In v1, drivers are assigned orders automatically with no consent mechanism. This causes:
- Drivers feeling powerless
- High rejection rates (going offline to avoid unwanted assignments)
- Orders assigned to drivers who can't/won't complete them

## Decision

Implement offer → accept pattern:

1. Order READY
2. System generates "offer" (assignment candidate with ETA)
3. Offer sent to driver (push notification + app alert)
4. Driver has 30 seconds to ACCEPT or REJECT
5. If accepted → driver marked BUSY, delivery tracking starts
6. If rejected → next candidate gets offer
7. If timeout (no response) → auto-accept fallback

## Data Model

```typescript
// New table
table driver_offers {
  id: UUID
  delivery_id: UUID
  driver_id: UUID
  status: PENDING | ACCEPTED | REJECTED | EXPIRED
  offer_payload: {
    pickup_location: LatLng
    pickup_store_name: string
    estimated_pickup_time_min: number
    estimated_delivery_time: timestamp
    estimated_distance_km: number
    estimated_earning: number
  }
  created_at: timestamp
  expires_at: timestamp  // created_at + 30 seconds
  accepted_at?: timestamp
  rejected_at?: timestamp
  rejection_reason?: string

  // Tracking
  notification_sent_at: timestamp
  notification_method: 'push' | 'websocket' | 'both'
  driver_response_time_ms?: number  // For analytics
}

// Update: deliveries
table deliveries {
  // ... existing ...
  current_offer_id: UUID
  offer_acceptance_count: number  // How many drivers rejected?
  accepted_offer_id: UUID
}
```

## Consequences

✅ Drivers have agency  
✅ Higher acceptance rate (they chose the order)  
✅ Fewer silent rejections (we know if they said no)  
✅ Better for driver retention  

⚠️ More complex workflow (4 states instead of 1)  
⚠️ Offer timeout adds latency (~30 seconds worst case)  
⚠️ Auto-accept fallback needed for offline drivers  

## Fallback Behavior

```
if (offer.expires_at < now) {
  // Auto-accept after timeout
  offer.status = 'EXPIRED'
  // Assignment proceeds normally
  assignment = await assignNearestDriver()
}
```

---

# ADR-025: Driver Availability State Machine

**Status:** Planned (v2.0.0 Phase 1)  
**Date:** 2026-01-31

## Context

v1 assumes drivers are either AVAILABLE or OFFLINE (via heartbeat timeout). No way to model:
- Intentional breaks (lunch, rest)
- Shift boundaries (work 9am-5pm)
- Admin-forced pauses (suspicious activity, training)

## Decision

Expand to explicit state machine:

```
AVAILABLE → [take break] → ON_BREAK → [duration expires] → AVAILABLE
AVAILABLE → [end shift] → SHIFT_ENDED → [start new shift] → AVAILABLE
AVAILABLE → [heartbeat expires] → OFFLINE (unintentional)
AVAILABLE → [admin action] → PAUSED (under review)
BUSY → [delivery completes] → AVAILABLE
BUSY → [heartbeat expires] → OFFLINE
```

## Data Model

```typescript
enum DriverAvailability {
  AVAILABLE = 'available',
  ON_BREAK = 'on_break',
  SHIFT_ENDED = 'shift_ended',
  OFFLINE = 'offline',
  PAUSED = 'paused'
}

table drivers {
  // ... existing ...
  availability: DriverAvailability
  availability_until?: timestamp  // When break/pause ends
  availability_reason?: string  // "lunch", "bathroom", "admin_review"
  last_availability_change: timestamp
  availability_change_actor?: 'driver' | 'admin' | 'system'
}

// State transition log (audit)
table driver_availability_history {
  id: UUID
  driver_id: UUID
  from_state: DriverAvailability
  to_state: DriverAvailability
  reason?: string
  actor_id?: UUID
  actor_type?: 'driver' | 'admin' | 'system'
  timestamp: timestamp
}
```

## Redis GEO Updates

Only `AVAILABLE` drivers appear in `drivers:geo`:

```typescript
async updateDriverAvailability(driverId, newState) {
  if (newState === 'AVAILABLE') {
    // Add to GEO
    await redis.geoadd('drivers:geo', lat, lon, driverId)
  } else {
    // Remove from GEO (including OFFLINE, ON_BREAK, etc)
    await redis.zrem('drivers:geo', driverId)
  }
  
  // Update status hash
  await redis.hset('drivers:status', driverId, newState)
}
```

## Consequences

✅ Drivers can take intentional breaks  
✅ Clear distinction between "offline" and "took a break"  
✅ Admin has control for policy enforcement  
✅ Complete audit trail  

⚠️ More states to manage  
⚠️ Periodic cleanup needed (expired breaks)  

---

# ADR-026: Automatic Delivery Reassignment

**Status:** Planned (v2.0.0 Phase 2)  
**Date:** 2026-01-31

## Context

Once a driver is assigned, there's no mechanism to reassign if:
- Driver cancels delivery
- Driver goes offline unexpectedly
- Order SLA at risk

## Decision

Implement automatic reassignment with safeguards:

```
Delivery assigned to Driver A
  ↓
Driver A goes OFFLINE (no heartbeat for 2 min)
  ↓
Wait 2 min (grace period for network blip)
  ↓
Still OFFLINE?
  ↓
Trigger automatic reassignment
  → Find new nearest driver (excluding Driver A)
  → Create new offer
  → Increment reassignment_count
  ↓
If reassignment_count > 3
  ↓
Escalate to manual dispatch (ops ticket)
```

## Rules

1. **Max 3 automatic reassignments** (then manual)
2. **Grace period:** Wait 2 min before reassigning (network hiccup?)
3. **Track reason:** Why was it reassigned?
4. **Preserve history:** All assignment attempts logged
5. **Update ETA:** Customer sees updated estimate

## Data Model

```typescript
table deliveries {
  // ... existing ...
  current_assignment_id: UUID
  assignment_attempt_count: number
  assignment_history: {
    driver_id: UUID
    assigned_at: timestamp
    unassigned_at?: timestamp
    reason: 'driver_cancelled' | 'driver_offline' | 'reassignment_requested' | 'admin_override'
    reassignment_count: number  // This was attempt #N
  }[]
  needs_manual_review: boolean  // if assignment_attempt_count > 3
  support_ticket_id?: UUID
}

// Reassignment trigger
table delivery_reassignment_attempts {
  id: UUID
  delivery_id: UUID
  previous_driver_id: UUID
  reason: string
  triggered_at: timestamp
  triggered_by: 'system' | 'admin'
  outcome: 'success' | 'no_drivers_available' | 'max_attempts_reached'
  next_driver_id?: UUID
  next_driver_assigned_at?: timestamp
}
```

## Consequences

✅ Orders don't get stuck  
✅ Automatic recovery without ops intervention  
✅ SLAs protected  
✅ Complete audit trail  

⚠️ More complex state machine  
⚠️ Potential for thrashing (keep reassigning)  

---

# ADR-027: Silent Failure Escalation & Observability

**Status:** Planned (v2.0.0 Phase 1)  
**Date:** 2026-01-31

## Context

In v1, if no driver is available for assignment, the webhook returns 200 {assigned: false}, but nothing escalates to ops. Order sits in READY state indefinitely.

## Decision

Implement failure detection and escalation:

```
Order unassigned → Queue check runs every 5 min
  ↓
Found unassigned for > 5 min?
  ↓
Create ops alert + support ticket
  ↓
Found unassigned for > 15 min?
  ↓
Auto-reassign with relaxed constraints (10km radius)
  ↓
Found unassigned for > 30 min?
  ↓
Auto-cancel or escalate to seller
```

## New Tracking Table

```typescript
table unassigned_orders {
  id: UUID
  delivery_id: UUID
  seller_order_id: UUID
  location: Point
  failure_reason: 
    | 'no_available_drivers'
    | 'all_drivers_busy'
    | 'distance_exceeded'
    | 'redis_timeout'
    | 'zone_empty'
  first_attempt_at: timestamp
  last_attempt_at: timestamp
  attempt_count: number
  escalation_level: 0 | 1 | 2 | 3  // 0=none, 1=ticket, 2=retry, 3=cancel
  support_ticket_id?: UUID
  notification_sent_at?: timestamp
}
```

## Escalation Timeline

```
Minute 0-5: Silent retry (every 1 min)
Minute 5:   Alert ops ("order unassigned 5 min")
Minute 15:  Retry with 10km radius
Minute 30:  Contact seller? Cancel? Admin override needed
Minute 60:  Escalate to leadership
```

## Consequences

✅ Ops visibility into failures  
✅ No silent failures  
✅ Automatic recovery attempt  
✅ Support tickets auto-created  

⚠️ More complex state tracking  
⚠️ Potential false positives  

---

# ADR-028: Complete Delivery Audit Trail

**Status:** Planned (v2.0.0 Phase 2)  
**Date:** 2026-01-31

## Context

Support needs to answer: "Why wasn't this driver assigned?"
Current logs are ephemeral and don't capture decision rationale.

## Decision

Persist complete immutable audit log:

```typescript
table delivery_audit_logs {
  id: UUID
  delivery_id: UUID
  timestamp: timestamp
  event_type: string  // 'created', 'assignment_search', 'driver_assigned', etc.
  actor: {
    id: UUID
    type: 'system' | 'driver' | 'admin' | 'api'
  }
  details: JSON  // Event-specific
  version: number  // Schema version for evolution
}
```

## Event Examples

```json
{
  "event_type": "assignment_search_started",
  "details": {
    "search_radius_km": 5,
    "redis_available": true,
    "search_start_time_ms": 1234567890
  }
}

{
  "event_type": "candidates_found",
  "details": {
    "count": 3,
    "candidates": [
      {
        "driver_id": "uuid1",
        "distance_km": 0.5,
        "rating": 4.8,
        "current_deliveries": 1,
        "availability": "available"
      }
    ]
  }
}

{
  "event_type": "offer_sent",
  "details": {
    "driver_id": "uuid1",
    "offer_id": "uuid2",
    "expires_at": "2026-02-01T10:00:00Z"
  }
}

{
  "event_type": "offer_accepted",
  "details": {
    "driver_id": "uuid1",
    "response_time_ms": 5000,
    "driver_notes": null
  }
}

{
  "event_type": "reassignment_triggered",
  "details": {
    "previous_driver_id": "uuid1",
    "reason": "driver_offline",
    "offline_duration_seconds": 120,
    "attempt_count": 2
  }
}
```

## Support Dashboard

```
Show complete timeline → support can explain every decision
```

## Consequences

✅ Complete audit trail  
✅ Compliance + debugging  
✅ Data for ML improvements  
✅ Historical analysis possible  

⚠️ Storage overhead (one row per event)  
⚠️ Query complexity  

---

# ADR-029: Customer-Facing ETA & Live Tracking

**Status:** Planned (v2.0.0 Phase 3)  
**Date:** 2026-01-31

## Context

Customers don't know when their order arrives. No tracking URL. No ETA.
This destroys trust and creates support load.

## Decision

Expose ETA and live driver location to customers:

```
GET /orders/:orderId/delivery-status
{
  "status": "assigned",
  "driver": {
    "name": "John D.",
    "rating": 4.8,
    "vehicle": "Honda Civic, Blue",
    "phone_masked": "***-***-1234"
  },
  "location": {
    "lat": 12.9xxx,
    "lon": 77.6xxx,
    "accuracy_meters": 50,
    "last_updated": "2026-02-01T10:00:00Z"
  },
  "estimated_pickup_time": "2026-02-01T10:05:00Z",
  "estimated_delivery_time": "2026-02-01T10:20:00Z",
  "tracking_url": "https://marketplace.com/track/order-abc123?token=xxx"
}
```

## Real-Time Updates (WebSocket)

```
Driver app: PATCH /drivers/:id/location {lat, lon}
Driver Service: Emit to "delivery:{deliveryId}:location-update"
Storefront: Subscribe to WebSocket, show live movement
```

## ETA Calculation

```typescript
async calculateETA(delivery) {
  // 1. Travel time to pickup
  const travelToPU = await mapsAPI.getDrivingTime({
    origin: driver.current_location,
    destination: delivery.pickup_location,
    traffic: 'best_guess'
  })

  // 2. Pickup time (from seller historical data)
  const pickupTime = seller.avg_pickup_time_seconds || 300

  // 3. Delivery time (from driver location to customer)
  const travelToCustomer = await mapsAPI.getDrivingTime({
    origin: delivery.pickup_location,
    destination: delivery.delivery_location
  })

  const eta = {
    pickup_eta: now + (travelToPU + pickupTime),
    delivery_eta: now + (travelToPU + pickupTime + travelToCustomer),
    confidence: 0.80  // Realistic, not 100%
  }

  return eta
}
```

## Consequences

✅ Customer sees when order arrives  
✅ Builds trust  
✅ Reduces support calls  
✅ Live tracking is differentiator  

⚠️ Requires real-time location updates (driver app integration)  
⚠️ Privacy considerations (should customer see exact driver location?)  
⚠️ Maps API cost  

---

# ADR-030: Zone-Based Demand Balancing

**Status:** Planned (v2.0.0 Phase 3)  
**Date:** 2026-01-31

## Context

Greedy nearest-driver causes clustering. All drivers go to downtown, rural areas empty.
No way to encourage drivers to underserved zones.

## Decision

Define delivery zones and balance assignment strategy:

```typescript
table delivery_zones {
  id: UUID
  name: string  // "Downtown", "East Side", etc.
  geometry: Polygon  // GIS boundary
  priority_level: number  // 1 (urgent) to 5 (low)
  min_drivers_online: number  // Maintain > X drivers
  current_drivers_online: number  // Real-time count
  avg_wait_time_seconds: number  // Current SLA
  target_wait_time_seconds: number  // Goal (300 = 5 min)
}

table driver_zone_preferences {
  id: UUID
  driver_id: UUID
  zone_id: UUID
  preference: PREFERRED | AVAILABLE | UNAVAILABLE
  distance_to_zone_center: number  // km
}
```

## Zone-Aware Assignment

```typescript
async assignNearestDriver(delivery) {
  const zone = await findZoneByCoordinates(delivery.location)
  const zoneHealth = await getZoneHealth(zone.id)

  // If zone understaffed, expand search radius
  const searchRadius = zoneHealth.current_drivers < zoneHealth.min_drivers_online
    ? 15  // Search farther
    : 5   // Normal radius

  const candidates = await redis.geosearch(
    delivery.location,
    searchRadius,
    {
      filter: (driverId) => {
        const pref = getZonePreference(driverId, zone.id)
        return pref !== 'UNAVAILABLE'
      },
      sort: (candidates) => {
        // Prefer drivers who work this zone
        return candidates.sort((a, b) => {
          const prefA = getZonePreference(a, zone.id)
          const prefB = getZonePreference(b, zone.id)
          return (prefA === 'PREFERRED' ? 0 : 1) - (prefB === 'PREFERRED' ? 0 : 1)
        })
      }
    }
  )

  return assignDriver(candidates[0])
}
```

## Incentive System (Optional)

```typescript
table delivery_incentives {
  id: UUID
  zone_id: UUID
  bonus_per_delivery: number  // +$2 in zone X
  active_from: timestamp
  active_until: timestamp
}

// When assigning:
const incentive = await getActiveIncentive(zone.id)
if (incentive) {
  offer.estimated_earning = base_earning + incentive.bonus_per_delivery
  // Driver sees higher earning
}
```

## Consequences

✅ Fair distribution across zones  
✅ Reduces wait times in underserved areas  
✅ Driver choice + incentives encourage better coverage  

⚠️ Requires zone definition (who defines zones?)  
⚠️ More complex assignment logic  

---

# ADR-031: Operational Analytics & Cost Tracking

**Status:** Planned (v2.0.0 Phase 4)  
**Date:** 2026-01-31

## Context

No cost visibility. Can't answer: "How much does delivery cost?"
Can't price competitively or optimize spend.

## Decision

Track costs and revenue per delivery:

```typescript
table delivery_costs {
  delivery_id: UUID
  // Infrastructure costs (allocated)
  postgres_cost: number  // fraction of DB subscription
  redis_cost: number
  api_calls_cost: number  // Maps API, etc.

  // Direct costs
  driver_payment: number
  platform_fee: number

  total_cost: number
}

table delivery_revenue {
  delivery_id: UUID
  commission: number  // % of order value
  delivery_fee: number  // flat fee
  total_revenue: number
}

table delivery_economics {
  delivery_id: UUID
  cost: DeliveryCost
  revenue: DeliveryRevenue
  net_profit: number
  margin_percent: number
}
```

## Analytics Dashboard

```
KPIs by Zone:
  ├─ orders: 600
  ├─ total_cost: $1800
  ├─ total_revenue: $2700
  ├─ net_profit: $900
  ├─ cost_per_delivery: $3.00
  ├─ revenue_per_delivery: $4.50
  ├─ margin_percent: 33%
  ├─ avg_delivery_distance: 2.1 km
  ├─ avg_delivery_time: 18 min
  └─ insights: ["Profitable! Can reduce commission 2%"]
```

## Profitability Model

```
Order value: $50
Commission: 15% = $7.50
Delivery fee (charged to customer): $2.00
Total revenue: $9.50

Cost:
  Driver payment: 40% of delivery fee = $0.80
  Maps API: $0.10
  Platform overhead (allocated): $2.50
  Total cost: $3.40

Net profit: $9.50 - $3.40 = $6.10
Margin: 64%
```

## Consequences

✅ Understand unit economics  
✅ Optimize pricing  
✅ Identify profitable zones  
✅ Data-driven product decisions  

⚠️ Allocation logic is approximate  
⚠️ Need historical cost data  

---

## Summary: v2 ADRs

| ADR | Feature | Maturity | Effort |
|-----|---------|----------|--------|
| ADR-024 | Offer + Accept | Planned | Medium |
| ADR-025 | Availability States | Planned | Low |
| ADR-026 | Auto Reassignment | Planned | Medium |
| ADR-027 | Escalation & Observability | Planned | Low |
| ADR-028 | Audit Trail | Planned | Medium |
| ADR-029 | ETA & Tracking | Planned | Large |
| ADR-030 | Zone Balancing | Planned | Medium |
| ADR-031 | Analytics | Planned | Medium |

**Total:** 8 major features spanning Phases 1-4 of v2 development

---

**End of ADR-024 through ADR-031**
