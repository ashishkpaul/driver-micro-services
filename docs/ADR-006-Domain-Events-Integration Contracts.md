# ADR-006: Domain Events & Integration Contracts

```text
/docs/adr/ADR-006-Domain-Events-Integration Contracts.md
```

## Status

Accepted

## Context

The platform is a **multi-vendor, location-constrained marketplace (v1)** built on Vendure v3.5.1. Core commerce responsibilities (catalog, inventory, pricing, seller-orders, payments) are handled by Vendure.

Per **ADR-005**, delivery logistics (drivers, routing, notifications) are **explicitly out of scope for v1** and must be implemented as an **external system** in v2+.

To enable this clean separation, we need a **stable, minimal, versioned integration contract** between Vendure and any future delivery system.

This ADR defines:

* Which **domain events** Vendure emits
* What **data is exposed**
* What **Vendure guarantees** (and does not)

## Decision

Vendure will act as the **source of truth for commercial events only** and will expose them via **domain events** (or equivalent hooks) that can be consumed by external systems.

Vendure:

* Emits **immutable, business-level events**
* Does **not** manage delivery state
* Does **not** retry, orchestrate, or depend on delivery outcomes

External systems:

* Subscribe to events
* Own delivery lifecycle, drivers, SLAs, notifications
* May fail independently without impacting checkout

## Event Model (v1-Compatible)

### Core Principle

> **Events describe facts, not intentions.**

Vendure emits events **after** state transitions are complete.

---

### Event: `SellerOrderPlaced`

Emitted when a **Seller Order** is finalized (payment settled).

## **Trigger**

* Order type: `OrderType.Seller`
* Transition: `PaymentSettled`

## **Payload (example)**

```json
{
  "event": "SellerOrderPlaced",
  "version": "1.0",
  "occurredAt": "2026-01-21T18:30:00Z",
  "channelId": "uuid",
  "sellerOrder": {
    "orderId": "uuid",
    "orderCode": "ABCD1234",
    "sellerId": "uuid",
    "currencyCode": "INR",
    "totalWithTax": 129900,
    "stockLocationIds": ["uuid"],
    "customer": {
      "id": "uuid",
      "shippingPostalCode": "560034",
      "shippingCountryCode": "IN"
    }
  }
}
```

## **Guarantees**

* Inventory is already allocated
* Payment is settled
* Seller isolation is enforced

## **Non-guarantees**

* Delivery feasibility
* Driver availability
* Delivery ETA

---

### Event: `SellerOrderCancelled`

Emitted when a seller order is cancelled after placement.

Used by delivery systems to:

* Abort dispatch
* Release driver assignments

---

## Integration Contract Rules

### Vendure Guarantees

* Events are **idempotent** (same orderId always represents same order)
* Events are emitted **after DB commit**
* Events reflect **seller-order scope**, not aggregate order

### Vendure Does NOT Guarantee

* Delivery success
* Driver availability
* Real-time tracking
* SLA compliance

---

## Transport Mechanisms (Non-Prescriptive)

This ADR intentionally does **not** mandate transport.

Valid implementations include:

* Message broker (Kafka, RabbitMQ, SNS/SQS)
* Webhooks
* Event tables with CDC

The only requirement is:

> **At-least-once delivery semantics**

---

## Versioning Strategy

* Each event includes a `version`
* Breaking changes require a new major version
* Old versions must remain consumable for ≥ 1 release cycle

---

## Rejected Alternatives

### ❌ Direct DB access by delivery system

* Breaks isolation
* Not upgrade-safe

### ❌ Synchronous delivery API calls during checkout

* Couples checkout to logistics availability
* Violates v1 reliability goals

### ❌ Embedding delivery state in Vendure entities

* Turns Vendure into a logistics engine
* Conflicts with ADR-005

---

## Consequences

### Positive

* Clean separation of concerns
* Vendure remains upgradeable
* Delivery system can evolve independently

### Trade-offs

* Eventual consistency
* Requires monitoring of event delivery

---

## Related ADRs

* ADR-002: Seller Onboarding Permissions
* ADR-003: Cart & Checkout Invariants
* ADR-004: Elasticsearch Boundaries
* ADR-005: Delivery & Logistics System

---

## Summary

This ADR establishes Vendure as a **commerce event producer**, not a delivery orchestrator. It enables a scalable, real-world delivery system without compromising v1 simplicity or Vendure core integrity.
