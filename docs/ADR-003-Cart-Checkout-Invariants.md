Below is **ADR-003: Cart & Checkout Invariants**, written in **formal ADR format**, **v1-strict**, and ready to be committed under:

```
/docs/adr/ADR-003-cart-checkout-invariants.md
```

No v2 logic, no future branching, and fully aligned with Vendure v3.5.1.

---

```markdown
# ADR-003: Cart & Checkout Invariants (v1)

## Status
**Accepted**

## Date
2026-01-21

## Context

The platform is a **v1 multi-vendor local marketplace** built on Vendure v3.5.1.

Key characteristics:

- Multiple sellers operate one or more **StockLocations**
- All products are published to a **default channel**
- Customers may add products from **multiple sellers** into a single cart
- Product visibility is strictly limited to **local availability (≤ 5 km)**

This ADR defines **non-negotiable invariants** governing **cart and checkout behavior** to ensure consistency, correctness, and architectural clarity in v1.

These rules apply to:
- Cart operations
- Order creation
- Checkout flow
- Seller order splitting
- Fulfillment guarantees

---

## Decision

The system SHALL enforce the following **Cart & Checkout Invariants** in v1.

---

## Invariant 1: Cart Admissibility Rule

A product variant **MUST NOT** be addable to cart unless **both** conditions are true at add-to-cart time:

1. **Physical Inventory Exists**
```

stockOnHand - stockAllocated > 0

```
at at least one StockLocation

2. **Local Proximity Holds**
```

distance(customer, stockLocation) ≤ 5 km

```

If either condition fails:
- The add-to-cart operation MUST be rejected
- The variant MUST be treated as unavailable

This rule applies **even if the product was previously visible**.

---

## Invariant 2: Cart Contains Only Local Items

At all times, a cart MUST satisfy:

- Every line item corresponds to a product variant
- That variant has at least one fulfilling StockLocation
- That StockLocation is within **5 km** of the customer’s active location

As a result:
- A cart NEVER contains out-of-radius items
- A cart NEVER contains globally fulfilled items
- A cart NEVER contains items with unknown fulfillment origin

---

## Invariant 3: Multi-Seller Cart Is Always Allowed

The system explicitly allows:

- Multiple sellers in a single cart
- Multiple StockLocations in a single cart
- Multiple cities **as long as each item is within 5 km of the customer**

There is **NO restriction** on:
- Number of sellers
- Number of StockLocations
- Seller verification status

---

## Invariant 4: Checkout Is Always Allowed for a Valid Cart

If a cart satisfies all cart invariants:

- Checkout MUST be allowed
- No additional seller-level validation is required
- No delivery eligibility checks are re-run beyond stock reservation

Seller verification status:
- MUST NOT affect checkout
- MUST NOT block order placement
- MUST NOT affect payment authorization

---

## Invariant 5: Order Splitting Is Seller-Scoped

At checkout:

- The system MUST split the order into **Seller Orders**
- Each Seller Order:
- Contains only that seller’s variants
- Is fulfilled from that seller’s StockLocations
- Uses standard Vendure `OrderType.Seller`

There is NO concept of:
- Cross-seller fulfillment
- Shared StockLocations across sellers

---

## Invariant 6: Stock Allocation Is Authoritative

During checkout:

- Stock is allocated per StockLocation
- Allocation is atomic per variant per StockLocation
- If allocation fails for ANY line item:
- Checkout MUST fail
- No partial checkout is allowed

---

## Invariant 7: Elasticsearch Is NOT Authoritative at Checkout

Elasticsearch:
- MAY be used for discovery and search filtering
- MUST NOT be trusted for checkout decisions

At checkout:
- Stock validation MUST occur against the database
- Distance validation MUST rely on StockLocation coordinates
- Real-time availability always wins

---

## Invariant 8: No Delivery SLA Branching (v1)

In v1:
- There is **exactly one delivery behavior**
- All visible items are implicitly “fast delivery”
- No ETA promises are computed
- No express vs standard logic exists

Checkout MUST NOT:
- Compare delivery speeds
- Rank items by SLA
- Block checkout based on ETA

---

## Invariant 9: No Seller Verification Influence

Seller verification status:

- MUST NOT influence cart eligibility
- MUST NOT influence checkout eligibility
- MUST NOT influence order splitting
- MUST NOT influence fulfillment

Seller verification is **administrative only** in v1.

---

## Invariant 10: Failure Handling

If, at checkout time:

- Stock becomes unavailable
- A StockLocation is removed
- Distance validation fails due to changed customer location

Then:
- Checkout MUST fail with a clear error
- The cart MUST remain intact for user correction

Silent removal of items is NOT allowed.

---

## Consequences

### Positive
- Strong correctness guarantees
- Predictable cart behavior
- Simple mental model for sellers and customers
- Clean separation between discovery and fulfillment

### Negative
- No partial checkout
- No global sellers
- No long-distance fallback

These limitations are **intentional for v1**.

---

## Out of Scope (Explicit)

This ADR does NOT cover:
- Global delivery
- Seller-specific SLAs
- Configurable delivery radius
- Warehouse routing optimization
- Multi-leg fulfillment
- Courier assignment
- ETA computation

All of the above are v2+ concerns.

---

## Related ADRs

- **ADR-001**: Local Product Visibility Rules
- **ADR-002**: Seller Onboarding & Permission Model
- **ADR-004 (Planned)**: Elasticsearch Responsibility Boundaries

---

## Summary (One Sentence)

> In v1, a cart may contain multiple sellers, but ONLY products with local stock (≤ 5 km), and any valid cart MUST always be allowed to checkout with seller-scoped fulfillment.

```

---

If you want, next we can:

* Cross-audit your **cart service** against ADR-003
* Produce **ADR-004: Elasticsearch Boundaries**
* Create a **v2 roadmap doc** without touching v1 code
