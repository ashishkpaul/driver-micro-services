Below is **ADR-009**, written in **formal ADR style**, **v1-strict**, **Vendure-compliant**, and ready to commit under:

```text
/docs/adr/ADR-009-delivery-lifecycle-events-and-proof-of-fulfillment.md
```

This ADR **extends ADR-008** without breaking it and introduces **Delivery Lifecycle Events** plus **Proof of Fulfillment**, while remaining **fully out of cart/checkout logic**.

---

```md
# ADR-009: Delivery Lifecycle Events & Proof of Fulfillment (v1)

## Status
Accepted

## Date
2026-01-22

## Context

Following:

- **ADR-005**: Delivery Domain Ownership  
- **ADR-006**: Event-Driven Integration  
- **ADR-007**: Dispatch & Routing Algorithm  
- **ADR-008**: Vendure ↔ Driver Event Contract  

the system currently supports:

- Seller Order dispatch
- Driver assignment (`DELIVERY_ASSIGNED_V1`)

However, **order fulfillment is not complete** without visibility into the **delivery lifecycle** and a **verifiable proof of fulfillment**.

In a real marketplace (Zomato / Amazon–style):

- Operations teams need delivery state tracking
- Sellers need confirmation that goods were handed over
- Customers need assurance of completion
- Disputes require objective evidence

This ADR defines:
1. **Delivery lifecycle events**
2. **Proof of fulfillment requirements**
3. **Event contracts**
4. **Vendure responsibilities**
5. **Explicit v1 boundaries**

---

## Decision

### Core Principle

> **Vendure owns order truth.  
> Driver Service owns delivery truth.  
> Proof bridges the two.**

Vendure must:
- Remain passive
- Record lifecycle events
- Never infer delivery completion

Driver Service must:
- Emit authoritative lifecycle events
- Attach verifiable proof
- Never modify order state directly

---

## Delivery Lifecycle States (v1)

Each **Seller Order delivery** follows this **linear lifecycle**:

```

ASSIGNED
→ PICKED_UP
→ DELIVERED

````text

Failure and reassignment are handled separately (future ADR).

---

## Outbound Events (Driver → Vendure)

All lifecycle events are **versioned**, **immutable**, and **append-only**.

---

### 1. `DELIVERY_PICKED_UP_V1`

#### Emitted When

- Driver physically picks up items from StockLocation
- Seller hands over goods
- Driver confirms pickup in system

#### Payload

```json
{
  "event": "DELIVERY_PICKED_UP_V1",
  "timestamp": "2026-01-22T11:05:00.000Z",
  "sellerOrderId": "uuid",
  "channelId": "uuid",
  "pickupProof": {
    "type": "PHOTO",
    "url": "https://cdn.example.com/pickup/abc123.jpg"
  }
}
````

#### Guarantees

* Emitted once per Seller Order
* Pickup proof is mandatory
* Proof URL must be immutable

---

### 2. `DELIVERY_DELIVERED_V1`

#### Emitted When

* Driver hands over items to customer
* Delivery is complete
* Proof of fulfillment is captured

#### Payload

```json
{
  "event": "DELIVERY_DELIVERED_V1",
  "timestamp": "2026-01-22T12:10:00.000Z",
  "sellerOrderId": "uuid",
  "channelId": "uuid",
  "deliveryProof": {
    "type": "PHOTO_WITH_GEO",
    "url": "https://cdn.example.com/delivery/xyz789.jpg",
    "lat": 12.9352,
    "lon": 77.6245
  }
}
```

---

## Proof of Fulfillment (v1)

### Definition

> **Proof of fulfillment is immutable evidence that goods were handed over at a specific place and time.**

---

### Accepted Proof Types (v1)

| Type              | Description                   |
| ----------------- | ----------------------------- |
| `PHOTO`           | Image captured by driver      |
| `PHOTO_WITH_GEO`  | Image + embedded GPS metadata |
| `SIGNATURE_IMAGE` | Customer signature photo      |

❌ OTP
❌ Face recognition
❌ Video
❌ Biometric verification

These are **explicitly out of scope for v1**.

---

### Proof Requirements

* Proof must be captured **at the moment of action**
* Stored in **object storage (S3 / CDN)**
* URL must be:

  * Read-only
  * Immutable
  * Non-expiring (or long TTL)

---

## Vendure Responsibilities (v1)

Upon receiving lifecycle events, Vendure must:

1. Persist delivery state **against Seller Order**
2. Store proof metadata (URL, type, timestamp)
3. Mark Seller Order as:

   * `pickedUpAt`
   * `deliveredAt`
4. Allow admin visibility & audit
5. NOT auto-complete the parent Order

⚠️ Order completion remains a **business decision**, not a delivery side-effect.

---

## Data Model (Vendure – Conceptual)

```ts
SellerOrder.customFields = {
  deliveryStatus: 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED',
  pickupProofUrl?: string,
  deliveryProofUrl?: string,
  deliveredAt?: Date
}
```

This ADR mandates semantic ownership and immutability rules for these fields.
Exact storage representation may evolve, but field meaning MUST remain stable for v1.

---

## Error Handling (v1)

* Missing proof → event rejected
* Duplicate events → idempotent ignore
* Out-of-order events → logged, not applied

No retries.
No compensation logic.

---

## Security & Trust (v1)

* HTTPS only
* Proof URLs must not be guessable
* Driver Service is the **single source of truth** for delivery events
* Vendure does not validate GPS accuracy

---

## Explicit Non-Goals (v1)

This ADR does NOT allow:

* Automatic refunds
* Customer acknowledgements
* Delivery SLA penalties
* Fraud detection
* Driver scoring
* Dispute resolution workflows

These require future ADRs.

---

## Consequences

### Positive

* Clear operational visibility
* Dispute-ready evidence
* Simple, auditable lifecycle
* No coupling to driver UX

### Negative

* Manual intervention required in disputes
* Proof storage cost
* No automated fraud detection

---

## Compatibility

* Fully compatible with:

  * ADR-008 event contract
  * Vendure EmailEventHandler / webhook model
  * Driver Microservice v1

No breaking changes.

---

## Summary

> **ADR-009 completes the delivery story by defining how fulfillment is proven and recorded — without polluting checkout, cart, or SLA logic.**

Delivery is no longer “done” — it is **provably done**.

---

## Follow-Ups

* **ADR-010**: Delivery Failure & Reassignment Events
* **ADR-011**: Admin Dispute & Evidence Review
* **v2**: OTP / Signature / Fraud heuristics

```text

---

If you want, the **next natural, v1-safe step** is:

1. Implement **Vendure event listeners** for `DELIVERY_PICKED_UP_V1` & `DELIVERY_DELIVERED_V1`
2. Extend **Driver Service** to emit proof URLs
3. Design **Admin UI (Angular + Clarity)** to view proof images

Say which one — we continue cleanly and precisely.
```

Vendure MUST ignore any inbound delivery event if:

- The SellerOrder already has a terminal deliveryStatus
- OR the same event type has already been recorded


📄 ADR-011 or appendix to ADR-009
📌 “SellerOrder Delivery Metadata Schema (v1)”

This prevents:

schema drift

accidental reuse in checkout

devs adding ETA/SLA later
