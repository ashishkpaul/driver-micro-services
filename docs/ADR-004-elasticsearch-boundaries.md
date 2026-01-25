Below is **ADR-004: Elasticsearch Boundaries**, written in **formal ADR format**, strictly **v1-compliant**, and ready to be committed under:

```
/docs/adr/ADR-004-elasticsearch-boundaries.md
```

This ADR is carefully aligned with:

* Vendure v3.5.1 core architecture
* `@vendure/elasticsearch-plugin` responsibilities
* Your **SellerStoreInfoPlugin** + **Elasticsearch9Plugin** split
* All v1 non-negotiable constraints you defined

---

```markdown
# ADR-004: Elasticsearch Boundaries (v1)

## Status
**Accepted**

## Date
2026-01-21

## Context

The platform uses **Elasticsearch v9** via `@vendure/elasticsearch-plugin` to support
fast product discovery in a **multi-vendor, location-restricted marketplace**.

Key characteristics:

- All sellers publish products to a **shared default channel**
- Physical fulfillment happens from **StockLocations**
- Product visibility is restricted to **local inventory (≤ 5 km)**
- Elasticsearch is used for **search and discovery only**

This ADR defines **strict boundaries** for what Elasticsearch
**may** and **must not** do in v1.

---

## Decision

Elasticsearch SHALL be treated as a **read-only, advisory search index**.

It MUST NOT become a source of truth for:
- inventory
- fulfillment
- delivery
- seller eligibility
- checkout decisions

---

## Allowed Responsibilities (v1)

Elasticsearch MAY be used to:

### 1. Index Discoverable Product Data

- Product and ProductVariant text fields
- Facets and collections
- Channel-scoped visibility
- Seller-agnostic searchable attributes

---

### 2. Index Geo-Points for StockLocations

- Each ProductVariant MAY index **multiple geo-points**
- Each geo-point represents a StockLocation with:
  - valid latitude
  - valid longitude
  - positive available stock

Indexing MUST:
- Exclude StockLocations with zero available inventory
- Exclude StockLocations without coordinates

---

### 3. Apply Search-Time Geo Filtering

At search time, Elasticsearch MAY:

- Filter results using:
```

geo_distance ≤ 5 km

```
- Evaluate distance between:
- customer-provided coordinates
- indexed StockLocation geo-points
- Match if **ANY** StockLocation for a variant satisfies the rule

This logic is applied via:
- `mapQuery(...)`
- `mapSort(...)`

---

### 4. Sort Results by Nearest StockLocation

When customer coordinates are available, Elasticsearch MAY:

- Sort results by nearest StockLocation distance
- Use `mode: min` across multiple geo-points

Sorting is **purely UX-related**.

---

## Forbidden Responsibilities (v1)

Elasticsearch MUST NOT:

### 1. Enforce Business Rules

Elasticsearch MUST NOT:
- Decide seller eligibility
- Enforce delivery policies
- Apply seller verification rules
- Encode checkout logic

---

### 2. Act as a Source of Truth

Elasticsearch MUST NOT be trusted for:
- stock availability at checkout
- allocation correctness
- fulfillment guarantees

The database remains authoritative.

---

### 3. Perform SLA or Delivery Logic

Elasticsearch MUST NOT:
- Compute delivery times
- Compare SLAs
- Label express vs standard delivery
- Make ETA promises

---

### 4. Infer Seller or Channel Eligibility

Elasticsearch MUST NOT:
- Infer seller permissions
- Decide collection access
- Filter based on seller verification

All permission checks belong to:
- Vendure core
- ChannelService
- SellerService
- Admin UI configuration

---

### 5. Handle Missing Customer Location

If customer coordinates are missing:

- Elasticsearch MUST NOT guess location
- Elasticsearch MUST NOT apply fallback geo logic
- Elasticsearch MUST return unfiltered results

Strict visibility enforcement in this case is delegated to:
- Backend resolvers
- Cart validation
- Checkout validation

---

## Elasticsearch ↔ Backend Contract

### Elasticsearch Guarantees

When customer location is provided:

- Returned products satisfy:
```

(has_stock) AND (distance ≤ 5 km)

```

When location is not provided:

- Results are **discovery-only**
- No fulfillment guarantees are implied

---

### Backend Guarantees

The backend MUST:

- Revalidate stock at add-to-cart
- Revalidate distance at checkout
- Reject invalid carts
- Never trust ES for final decisions

---

## Failure Modes

If Elasticsearch:
- Is unavailable
- Returns stale data
- Contains outdated geo-points

Then:
- Search MAY degrade
- Checkout MUST still be correct
- Backend validation always wins

---

## Consequences

### Positive
- Clear separation of concerns
- Safe use of Elasticsearch
- No hidden business logic in search
- Easier future refactors

### Negative
- Some duplicate validation logic
- Slightly higher backend load

These trade-offs are intentional and acceptable in v1.

---

## Out of Scope (Explicit)

This ADR does NOT cover:
- Real-time inventory synchronization
- SLA-aware indexing
- Multi-region delivery
- Seller-specific radius rules
- Elasticsearch-driven checkout decisions

All of the above are v2+ topics.

---

## Related ADRs

- **ADR-001**: Local Product Visibility Rules
- **ADR-002**: Seller Onboarding & Permission Model
- **ADR-003**: Cart & Checkout Invariants

---

## Summary (One Sentence)

> In v1, Elasticsearch is a fast, read-only discovery engine that may filter and sort by local availability but MUST NEVER decide fulfillment, delivery, or checkout outcomes.

```

---

If you want, next we can:

* **Audit your `Elasticsearch9Plugin` line-by-line against ADR-004**
* Produce **ADR-005: Location Source Hierarchy**
* Draft a **v2 roadmap** that cleanly extends these boundaries without touching v1
