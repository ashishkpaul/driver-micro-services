# ADR-007: Dispatch & Routing Algorithm (v1)

## Status

Accepted

## Date

2026-01-22

## Context

The marketplace operates as a **local-only, multi-vendor platform** where:

- Orders are split into **Seller Orders** (Vendure `OrderType.Seller`)
- Each Seller Order is fulfilled from exactly **one StockLocation**
- All visible products already satisfy:
  - `(stockOnHand - stockAllocated) > 0`
  - `distance(customer, stockLocation) <= 5 km`

Following **ADR-005 (Delivery System Scope)** and **ADR-006 (Driver Service Architecture)**, the system now requires a **dispatch and routing mechanism** to:

- Assign a **driver** to each Seller Order
- Track the lifecycle of that assignment
- Provide deterministic, auditable delivery behavior

This ADR defines the **v1 dispatch & routing algorithm**.

---

## Decision

### Core Principle (v1)
>
> **Dispatch and routing are operational logistics concerns, not customer-facing navigation features.**

The v1 algorithm MUST be:

- Deterministic
- Distance-based
- Simple
- Explainable
- Free of predictive or SLA-optimizing logic

---

## Dispatch Algorithm (v1)

### Inputs

For each **Seller Order**:

- `pickupLocation` (StockLocation lat/lon)
- `dropLocation` (Customer delivery lat/lon)
- `sellerOrderId`
- `channelId`

For each **Driver**:

- `driverId`
- `currentLocation` (lat/lon)
- `availabilityStatus` ∈ { AVAILABLE, BUSY, OFFLINE }
- `channelId`

---

### Eligibility Rules

A driver is **eligible** if:

1. `availabilityStatus === AVAILABLE`
2. `channelId` matches the Seller Order channel
3. Driver is not currently assigned to another active delivery

**Excluded in v1:** Seller verification, SLA tiers, Order value, Driver ratings.

---

### Distance Calculation

- Distance is calculated using the **Haversine formula**.
- Units: **kilometers**.
- Two distances are computed:
  1. `driver → pickup`
  2. `pickup → drop`

---

### Assignment Rule
>
> **Assign the nearest eligible driver by straight-line distance to the pickup location.**

1. Filter eligible drivers.
2. Compute `driver → pickup` distance.
3. Sort ascending by distance.
4. Select the nearest driver.
5. Create a `DeliveryAssignment` record.

---

### Tie-Breaking

If multiple drivers have equal distance:

1. Oldest `lastCompletedAt`
2. Lowest `activeAssignmentsCount`
3. Stable deterministic fallback (UUID sort)

---

## Routing Model (v1)

### What Routing IS

Routing is a **static snapshot**, captured at assignment time:

- Pickup and Drop coordinates
- Calculated distances
- Assignment timestamp

### What Routing IS NOT

- Turn-by-turn navigation
- Traffic awareness
- Re-routing
- Multi-stop optimization

---

## Failure & Reassignment

### Failure Conditions

A delivery assignment may fail if:

- Driver rejects assignment
- Driver goes offline
- Timeout without acceptance
- Manual admin override

### Reassignment Rules

- Failed driver is **temporarily excluded**.
- Dispatch algorithm is re-run.
- Previous routing snapshot is preserved for audit.

---

## State Machine (Simplified)

```text
PENDING_ASSIGNMENT
→ ASSIGNED
→ PICKED_UP
→ DELIVERED
→ FAILED → REASSIGNED

## Data Ownership

| Data | Owner |
|----|----|
| Driver availability | Driver Service |
| Dispatch decision | Driver Service |
| Delivery state | Driver Service |
| Order fulfillment | Vendure |
| Visibility & catalog | Vendure |
| SLA promises | ❌ Not in v1 |

Vendure receives **read-only delivery events**.

---

## Explicit Non-Goals (v1)

This ADR **does NOT** allow:

- Driver mobile apps
- ETA promises
- Delivery pricing logic
- Multi-order batching
- Traffic-aware routing
- Machine learning optimization
- Seller-based prioritization

These are **v2+ topics**.

---

## Consequences

### Positive

- Predictable dispatch behavior
- Easy to debug and audit
- Works for SQLite + PostgreSQL
- Aligns with multi-seller order model
- No coupling to mapping providers

### Negative

- No real-time ETA accuracy
- No optimization beyond nearest driver
- Requires future ADR for expansion

---

## Follow-Ups

- **ADR-008**: Driver Assignment Failure Handling (optional)
- **ADR-009**: Event Contract Between Driver Service and Vendure
- **v2**: Navigation, batching, ETA, pricing

---

## Summary

> **In v1, dispatch assigns the nearest available driver using straight-line distance and records a static route snapshot. Nothing more.**

This rule is **intentionally simple**, **intentionally strict**, and **intentionally correct for v1**.
