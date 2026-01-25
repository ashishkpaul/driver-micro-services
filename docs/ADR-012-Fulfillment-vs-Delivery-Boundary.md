Below is **ADR-012**, written in the **same formal, strict, Vendure-native style** as your existing ADRs, with **explicit prohibitions** to close the last remaining architectural loophole.

This ADR does **not introduce new logic**.
It **locks boundaries**, prevents accidental automation, and makes your v1 position unambiguous to future engineers.

It is ready to commit as-is.

---

```md
# ADR-012: Fulfillment vs Delivery Boundary (Explicit Non-Automation)

## Status

Accepted

## Date

2026-01-23

## Context

The platform is a **multi-vendor, location-constrained marketplace (v1)** built on **Vendure v3.5.1**.

Following prior decisions:

- **ADR-003**: Cart & Checkout Invariants  
- **ADR-005**: Delivery Logistics System Separation  
- **ADR-006**: Domain Events & Integration Contracts  
- **ADR-007**: Dispatch & Routing Algorithm  
- **ADR-008**: Vendure ↔ Driver Webhook Mapping  
- **ADR-009**: Delivery Lifecycle Events & Proof of Fulfillment  
- **ADR-010.01**: Delivery Failure & Reassignment  

the system integrates with an **external Driver / Delivery Service** that:

- Assigns drivers
- Manages routing
- Emits delivery lifecycle events

Vendure, by design, already includes a **Fulfillment state machine** intended for **warehouse and shipping workflows**.

Vendure also provides extension points such as:

- `FulfillmentProcess`
- `transitionFulfillmentToState`
- Admin-only fulfillment mutations

These capabilities **could** be used to automate fulfillment state transitions based on driver events.

This ADR explicitly forbids that automation in **v1**.

---

## Decision

### Core Principle

> **Delivery completion is not fulfillment automation.**

Vendure’s **Fulfillment FSM** and the external **Delivery lifecycle** are **intentionally separate domains**.

In **v1**, driver-originated events **MUST NOT** cause Fulfillment state transitions.

---

## Explicit Boundary Definition

### Fulfillment (Vendure Core)

Fulfillment represents:

- Warehouse picking
- Packing
- Shipping handoff
- Seller-side operational workflows

Characteristics:

- Admin-only mutations
- Human-verified actions
- Auditable seller operations
- Optional per seller / per channel

---

### Delivery (External System)

Delivery represents:

- Last-mile logistics
- Driver assignment
- Pickup and drop-off
- Proof of fulfillment

Characteristics:

- Operated externally
- Event-driven
- Append-only lifecycle
- May fail or retry independently

---

## Explicit Prohibitions (v1 – Hard Rules)

The following actions are **explicitly forbidden** in v1:

### ❌ No Fulfillment FSM Automation

Inbound delivery events (`DELIVERY_*_V1`) MUST NOT:

- Call `transitionFulfillmentToState`
- Modify `Fulfillment.state`
- Use `FulfillmentProcess`
- Override admin-only fulfillment transitions
- Bypass seller/admin verification

---

### ❌ No Driver-App-to-Fulfillment Access

Driver-side applications MUST NOT:

- Call Admin API mutations
- Authenticate as admin or seller users
- Transition fulfillment states
- Complete orders implicitly

---

### ❌ No Implicit Order Completion

Delivery completion MUST NOT:

- Auto-complete Seller Orders
- Auto-complete Aggregate Orders
- Trigger refunds
- Trigger payment capture/settlement
- Trigger customer notifications

Order completion remains a **business decision**, not a logistics side-effect.

---

## Allowed Vendure Behavior (v1)

Vendure MAY:

- Accept inbound delivery lifecycle events via webhooks
- Persist delivery metadata in `SellerOrder.customFields`
- Record proof URLs and timestamps
- Expose delivery evidence in Admin UI (read-only)
- Allow human operators to decide next actions

Vendure MUST remain **passive** with respect to delivery outcomes.

---

## Rationale

This boundary exists to prevent:

- Accidental coupling of checkout to logistics availability
- Irreversible state corruption from retrying webhooks
- Sellers losing operational control
- Vendure becoming a logistics engine
- Breaking upgrade paths of Vendure core

This separation mirrors real-world systems:

- Amazon: fulfillment ≠ last-mile delivery
- Zomato: kitchen ops ≠ rider ops
- Shopify: order state ≠ carrier delivery state

---

## Rejected Alternatives

### ❌ Automate Fulfillment on `DELIVERY_DELIVERED`

Rejected because:

- Driver systems are unreliable by nature
- Delivery retries are common
- Fulfillment is a seller responsibility
- Violates ADR-003 checkout invariants

---

### ❌ Use FulfillmentProcess for Driver Events

Rejected because:

- FulfillmentProcess is designed for internal workflows
- Introduces implicit side effects
- Breaks auditability

---

## Consequences

### Positive

- Clear ownership boundaries
- No accidental automation
- Safe webhook retries
- Human-in-the-loop operations
- Upgrade-safe Vendure core

### Trade-offs

- Manual intervention required for exceptional cases
- No “auto-complete” convenience in v1
- Requires admin discipline

These trade-offs are **intentional**.

---

## Compatibility

This ADR is fully compatible with:

- ADR-001 → ADR-011
- Vendure v3.5.1
- Multi-vendor Seller Orders
- Pinelab Webhook Plugin
- External Driver Microservices

No breaking changes.

---

## Summary

> **In v1, delivery events record facts.  
> Fulfillment remains a human-controlled workflow.  
> Automation is explicitly forbidden.**

This ADR permanently closes the automation loophole and freezes the v1 delivery architecture.

---

## Follow-Ups (Optional, v2+)

- ADR-013: Fulfillment Automation Guards (if ever needed)
- ADR-014: Seller-Controlled Fulfillment Automation (opt-in)
- ADR-015: SLA & Delivery Guarantees

None are required for v1.
```

---

### ✅ What this gives you

* A **hard architectural stop-sign**
* Zero ambiguity for future engineers
* Protection against “helpful” but dangerous automation
* A clean handoff point for v2 experimentation

If you want, next we can do **one final thing only**:

👉 **v1 Architecture Freeze Checklist (one page)**

After that, this system is genuinely production-frozen.
