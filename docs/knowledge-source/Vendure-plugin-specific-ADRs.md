Perfect, this is the right moment to formalize this 👍
Below are **Vendure-plugin-specific ADRs**, written in **clean ADR style**, aligned with:

* `driver-micro-services`
* Vendure server plugins:

  * `driver-integration`
  * `seller-store-info`
  * `es9`
* Your GA constraints (idempotency, retries, correctness)

You can drop these directly into:

```
docs/adr/
```

I’ll number them so they **extend**, not conflict with, your existing ADR set.

---

# ADR-011: Vendure → Driver Service Integration via Webhooks

**Status:** Accepted
**Date:** 2026-01-27
**Owners:** Platform / Logistics

## Context

Vendure is the system of record for:

* Orders
* Sellers
* Store metadata

Driver assignment must occur **outside Vendure core** to avoid:

* Blocking order workflows
* Coupling delivery logic to commerce internals

Vendure already supports **event-driven webhooks**.

## Decision

We integrate Vendure with the Driver Service using **server-side plugins emitting webhooks**.

* Vendure emits `SellerOrderReady` events
* Driver Service exposes:

  ```
  POST /events/seller-order-ready
  ```
* Communication is **asynchronous**
* Authentication via shared webhook secret

## Consequences

✅ Vendure remains stateless regarding delivery
✅ Driver Service can scale independently
✅ Failures do not block order placement

❌ Delivery assignment is eventually consistent (acceptable)

---

# ADR-012: Idempotent Order-to-Delivery Mapping

**Status:** Accepted
**Date:** 2026-01-27

## Context

Vendure webhooks:

* Can be retried
* Can be delivered more than once
* May arrive out of order during retries

Creating duplicate deliveries would be catastrophic.

## Decision

Delivery creation is **idempotent** on `sellerOrderId`.

* Database enforces **unique constraint**
* Service logic checks before insert
* Duplicate webhook → safe no-op

## Consequences

✅ Safe retries
✅ No duplicate deliveries
✅ Easy replay of events

---

# ADR-013: Driver Assignment Outside Vendure Core

**Status:** Accepted
**Date:** 2026-01-27

## Context

Vendure plugins should not:

* Perform heavy computation
* Call Redis / GEO queries
* Make synchronous external calls

Driver proximity logic is complex and stateful.

## Decision

Vendure plugins:

* **Emit events only**
* Never select drivers
* Never manage availability

Driver Service:

* Owns assignment logic
* Owns Redis + PostgreSQL coordination

## Consequences

✅ Clean separation of concerns
✅ Vendure plugins remain thin
✅ Driver logic evolves independently

---

# ADR-014: Store & Seller Metadata Resolution Strategy

**Status:** Accepted
**Date:** 2026-01-27

## Context

Assignment requires:

* Pickup location
* Seller / store geo coordinates

Vendure stores this data, but not all plugins need it.

## Decision

`seller-store-info` plugin:

* Acts as **read-only metadata provider**
* Resolves store → geo coordinates
* Exposes structured payload to Driver Service

Driver Service:

* Does **not** query Vendure synchronously
* Consumes enriched event payload

## Consequences

✅ No runtime dependency on Vendure APIs
✅ Faster assignment
✅ Simpler failure handling

---

# ADR-015: Retry Strategy for Vendure → Driver Events

**Status:** Accepted
**Date:** 2026-01-27

## Context

Network failures are inevitable:

* Driver Service restart
* Temporary DB lock
* Redis failover

Vendure supports webhook retries.

## Decision

* Vendure retries on non-2xx
* Driver Service:

  * Returns `2xx` **only after persistence**
  * Uses idempotency to absorb duplicates
* No custom retry queues in Driver Service

## Consequences

✅ Simple, robust retry model
✅ No dual retry systems
✅ Easy to reason about failure modes

---

# ADR-016: Delivery State Ownership

**Status:** Accepted
**Date:** 2026-01-27

## Context

Both systems track delivery state:

* Vendure: order fulfillment status
* Driver Service: delivery execution status

Conflicting ownership causes drift.

## Decision

* Driver Service is **authoritative** for delivery lifecycle
* Vendure is **notified** of state changes via outbound webhooks
* Vendure never mutates delivery state directly

## Consequences

✅ Single source of truth
✅ Clear responsibility boundary
❌ Vendure reflects state asynchronously

---

# ADR-017: Failure Isolation Between Vendure and Driver Service

**Status:** Accepted
**Date:** 2026-01-27

## Context

Driver Service outages must not:

* Block checkout
* Block order confirmation
* Crash Vendure workers

## Decision

Vendure plugins:

* Fire-and-forget webhook calls
* Log failures
* Never throw fatal errors for delivery issues

Driver Service outages are **non-fatal** to Vendure.

## Consequences

✅ Commerce remains available
✅ Delivery failures are recoverable
✅ Clear operational isolation

---

# ADR-018: Plugin Responsibility Boundaries

**Status:** Accepted
**Date:** 2026-01-27

## Decision Summary

| Component            | Responsibility           |
| -------------------- | ------------------------ |
| `es9`                | Order lifecycle events   |
| `seller-store-info`  | Seller/store metadata    |
| `driver-integration` | Webhook emission         |
| Driver Service       | Assignment + execution   |
| Redis                | Availability + proximity |
| PostgreSQL           | Truth + audit            |

## Consequences

✅ No overlap
✅ No circular dependencies
✅ Easy ownership & debugging

---

# ADR-019: Observability Boundary

**Status:** Accepted
**Date:** 2026-01-27

## Decision

* Vendure logs:

  * Event emission
  * Webhook delivery result
* Driver Service logs:

  * Assignment decisions
  * Driver availability
  * Redis degradation

No shared logging system required.

## Consequences

✅ Clear incident ownership
✅ Reduced noise
✅ Easier SRE triage

---

# ADR-020: Versioned Contract Between Vendure and Driver Service

**Status:** Accepted
**Date:** 2026-01-27

## Decision

* Event payloads are **versioned**
* Breaking changes require:

  * New payload version
  * Backward compatibility window

Example:

```json
{
  "version": "v1",
  "sellerOrderId": "...",
  "pickup": { "lat": 12.9, "lon": 77.6 }
}
```

## Consequences

✅ Safe evolution
✅ Independent deployments
✅ No surprise breakages

---

## 📌 What you now have

* Clean Vendure ↔ Driver Service contract
* Explicit retry & idempotency model
* Clear plugin responsibilities
* Auditor-friendly documentation
* Zero hidden coupling

If you want next, I can:

* Add **Mermaid diagrams per ADR**
* Cross-link these ADRs into `ARCHITECTURE.md`
* Produce **Vendure plugin README templates**
* Generate **contract test cases** between systems

You’ve built this like a real platform — not just a service.
