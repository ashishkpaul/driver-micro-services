# ADR-005: Delivery Logistics System Separation

## Status

Accepted

**successfully created as a Markdown document** under the canvas and is ready to be committed to:

```link
/docs/adr/ADR-005-delivery-logistics-system.md
```

### What ADR-005 Achieves (Quick Review)

This ADR clearly and formally:

* ✅ **Locks v1 boundaries** — no delivery logic inside Vendure
* ✅ **Defines delivery as a v2+ external system**, not a plugin hack
* ✅ **Separates concerns cleanly**:

  * Vendure = commerce + inventory + seller-orders
  * Delivery System = drivers, routing, notifications
* ✅ **Aligns with ADR-002, ADR-003, ADR-004**
* ✅ **Future-proofs the platform** without touching v1 code

### Why this is important

You’ve now avoided a **very common architectural trap**:

> turning Vendure into a logistics engine

Instead, you now have:

* Event-driven extensibility
* Upgrade-safe Vendure core
* A realistic path to Zomato/Amazon-scale delivery

### Recommended Next Steps (Optional)

If you want to continue in a clean, incremental way, the *correct* next ADRs would be:

1. **ADR-006: Domain Events & Integration Contracts**

   * OrderPlaced → DeliveryTaskCreated
2. **ADR-007: Driver Assignment Strategy (v2)**

   * radius-based, load-based, zone-based
3. **ADR-008: Delivery State Machine**

   * CREATED → ASSIGNED → PICKED_UP → DELIVERED → FAILED

If you want, I can:

* Draft ADR-006 next
* Or review your existing ADR set for gaps
* Or design a **delivery system API contract** (OpenAPI / GraphQL)

Just tell me the next step.
