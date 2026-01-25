Perfect — constraints acknowledged and locked.
Below is **ADR-010**, written to be **fully Vendure v3.5.1–compliant**, **ADR-consistent**, and **implementation-safe** under *all* the rules you restated.

There is **no code** in this ADR by design. This is a **behavioral and contract ADR**, not an implementation one.
All implementation implications remain **external to Vendure core**, event-driven, and plugin-safe.

---

# ADR-010: Delivery Failure & Reassignment (v1)

```
/docs/adr/ADR-010-delivery-failure-and-reassignment-v1.md
```

---

## Status

**Accepted**

## Date

2026-01-23

## Scope

Delivery failure handling, reassignment semantics, and event contracts
**Applies to:** External Driver / Delivery System
**Explicitly excludes:** Vendure cart, checkout, pricing, SLA, ETA, search, or inventory logic

---

## Context

Following:

* **ADR-005** — Delivery & Logistics System Separation
* **ADR-006** — Domain Events & Integration Contracts
* **ADR-007** — Dispatch & Routing Algorithm
* **ADR-008** — Webhook Mapping (Vendure ↔ Driver Service)
* **ADR-009** — Delivery Lifecycle Events & Proof of Fulfillment

the platform supports:

* Seller Orders (`OrderType.Seller`)
* External dispatch & delivery lifecycle
* Proof-backed pickup and delivery confirmation

However, **real-world delivery is failure-prone**. Drivers may:

* Reject assignments
* Go offline
* Fail pickup
* Encounter customer unavailability
* Time out

This ADR defines **how failures are represented, communicated, and recovered from**, without violating v1 constraints or polluting Vendure with logistics orchestration.

---

## Decision

### Core Principle

> **Failures are explicit events, not implicit states.
> Vendure records failure facts but never resolves them.**

Delivery failure handling is **owned entirely by the Driver Service**.

Vendure:

* Remains a **passive event consumer**
* Never retries, reassigns, or infers outcomes
* Never blocks checkout retroactively

---

## Failure Model (v1)

### Definition

A **delivery failure** occurs when a Seller Order cannot progress through the delivery lifecycle as planned.

Failures are:

* Explicit
* Immutable
* Attributable to a cause
* Potentially recoverable via reassignment

---

## Failure Event

### Event: `DELIVERY_FAILED_V1`

#### Emitted By

Driver Service

#### Emitted When

Any of the following occurs **after assignment**:

* Driver rejects assignment
* Driver goes offline before pickup
* Pickup attempt fails
* Delivery attempt fails
* Operational timeout expires

---

### Payload (Canonical, Versioned)

```json
{
  "event": "DELIVERY_FAILED_V1",
  "version": 1,
  "timestamp": "2026-01-23T14:40:00.000Z",
  "sellerOrderId": "uuid",
  "channelId": "uuid",
  "failure": {
    "code": "DRIVER_REJECTED",
    "reason": "Driver declined assignment",
    "occurredAt": "2026-01-23T14:39:12.000Z"
  }
}
```

---

### Failure Codes (v1 – Locked)

| Code              | Meaning                           |
| ----------------- | --------------------------------- |
| `DRIVER_REJECTED` | Driver explicitly declined        |
| `DRIVER_OFFLINE`  | Driver disconnected               |
| `PICKUP_FAILED`   | Seller handover failed            |
| `DELIVERY_FAILED` | Customer handover failed          |
| `TIMEOUT`         | No progress within allowed window |
| `MANUAL_CANCEL`   | Ops manually aborted              |

❌ No free-text codes
❌ No SLA-based failures
❌ No retry counters embedded in payload

---

## Vendure Responsibilities (v1)

Upon receiving `DELIVERY_FAILED_V1`, Vendure MUST:

1. Persist failure metadata against the **Seller Order**
2. Record:

   * failure code
   * reason
   * timestamp
3. Mark Seller Order delivery state as **FAILED**
4. Preserve **all previous lifecycle events** (audit trail)

Vendure MUST NOT:

* Retry delivery
* Reassign drivers
* Cancel the Seller Order automatically
* Modify Order FSM state
* Refund or compensate automatically

---

## Reassignment Semantics (v1)

### Ownership

**Reassignment is exclusively owned by the Driver Service.**

Vendure has **no awareness** of reassignment attempts.

---

### Reassignment Rules (Driver Service)

After a failure:

1. Failed driver is **temporarily excluded**
2. Dispatch algorithm (ADR-007) is re-run
3. A new `DELIVERY_ASSIGNED_V1` may be emitted
4. Previous failure remains immutable

There is **no hard retry limit defined in v1**.
Retry caps are operational policy, not platform logic.

---

## Event Ordering Guarantees

* Events are **append-only**
* Out-of-order events:

  * MUST be logged
  * MUST NOT overwrite newer state
* Duplicate events:

  * MUST be idempotently ignored

Vendure does **not** attempt reconciliation.

---

## Failure Visibility (v1)

Failures are:

* Visible to Platform Admins
* Visible to Operations
* Auditable historically

Failures are **not**:

* Exposed to customers automatically
* Used to infer delivery outcome
* Used to auto-cancel orders

Customer communication is **out of scope**.

---

## Interaction with Cart & Checkout

Per **ADR-003**:

* Delivery failures **do not affect checkout**
* Checkout has already completed
* Inventory is already allocated

Failure handling is **post-checkout only**.

---

## Security & Trust Model

* Driver Service is authoritative for failure events
* Vendure does not validate failure legitimacy
* HTTPS + signed webhooks required
* No bidirectional orchestration

---

## Explicit Non-Goals (v1)

This ADR does NOT introduce:

* Automatic refunds
* Partial order cancellation
* SLA penalties
* Driver scoring
* Customer reattempt flows
* ETA recalculation
* Seller blame attribution

All of the above are **v2+ concerns**.

---

## Compatibility

This ADR is fully compatible with:

* ADR-005 (Delivery Separation)
* ADR-006 (Event Contracts)
* ADR-007 (Dispatch Algorithm)
* ADR-008 (Webhook Mapping)
* ADR-009 (Lifecycle & Proof)

No breaking changes.

---

## Consequences

### Positive

* Explicit failure modeling
* Operational transparency
* Clean audit trail
* Zero coupling to Vendure core logic
* Realistic real-world behavior

### Trade-offs

* Manual ops intervention required
* Eventual consistency
* No automatic customer resolution

These are **intentional in v1**.

---

## Summary

> **In v1, delivery failures are explicit, auditable facts emitted by the Driver Service. Vendure records them faithfully but never attempts recovery or orchestration.**

Failures are not bugs — they are first-class domain events.

---

## Recommended Follow-Ups

1. **ADR-011**: Admin Dispute & Evidence Review
2. **ADR-012**: Customer Notification Strategy (Non-blocking)
3. **v2**: Refunds, compensation, SLA handling

---

If you want, next we can:

* Draft **ADR-011** (Admin UI behavior, Angular + Clarity)
* Design **inbound webhook verification** (signature & idempotency)
* Map failure events to **EmailEventHandler** (non-blocking)

Say the next ADR number and we continue.

Vendure MUST ignore any inbound delivery event if:

* sellerOrderId already has a terminal deliveryStatus
* OR the same event type was previously recorded

Inbound failure events MUST NOT:

- Trigger Fulfillment FSM transitions
- Modify Fulfillment entities
- Be wired through FulfillmentProcess


On DELIVERY_FAILED_V1:

* Vendure records failure metadata
* Vendure DOES NOT:
  * cancel SellerOrder
  * refund payment
  * retry delivery
  * notify customer automatically
