
# ADR 001: Location-Based Product Visibility (v1)

## Status

Accepted (or Proposed)

If either condition fails, the product:

- MUST NOT appear in search results
- MUST NOT appear in collections
- MUST NOT be addable to cart

---

## Distance Model

- Distance is calculated between:
- Customer coordinates (latitude, longitude)
- StockLocation coordinates (latitude, longitude)
- Standard geo-distance formula is used (Haversine)
- Unit: kilometers (km)
- Radius is **fixed and constant at 5 km**

No seller-, channel-, or product-level variation is allowed in v1.

---

## Enforcement Strategy

### Elasticsearch (Primary Enforcement)

Elasticsearch is responsible for **search-time visibility enforcement**:

- Indexes only StockLocations with available inventory
- Stores StockLocation geo-points per variant
- Applies a strict `geo_distance` filter (`<= 5km`)
- Sorts results by nearest StockLocation

Elasticsearch **must not**:

- Enforce delivery SLA logic
- Decide seller eligibility
- Implement checkout or fulfillment policy

---

### Backend Services

- `SellerStoreInfoPlugin`:
- Enriches search results with distance metadata
- Supports discovery and diagnostics
- Does NOT override Elasticsearch visibility

- Core Vendure services:
- Rely on StockLocation inventory as the fulfillment source of truth
- Do not re-check distance in cart or checkout in v1

---

### Storefront (Qwik)

- Obtains customer coordinates via browser or device geolocation
- Passes `customerLat` and `customerLon` explicitly in `SearchInput`
- Consumes backend-filtered search results
- Does not duplicate visibility logic

---

## Cart & Checkout Invariants

### Invariant 1: Cart Safety

All products added to cart already satisfy the 5 km rule.

- Cart operations do not need geo-validation
- No late-stage cart rejection due to distance

---

### Invariant 2: Multi-Seller Cart Validity

A cart may contain products from multiple sellers because:

- Each variant independently satisfies the visibility rule
- All sellers in the cart are within 5 km

---

### Invariant 3: Checkout Guarantee

If an order reaches checkout, it is deliverable.

- No global sellers exist in v1
- No seller verification branching applies
- No delivery mode decisions are required

---

### Invariant 4: Stock Consistency

Inventory correctness is ensured by Vendure’s stock allocation model:

- `(stockOnHand - stockAllocated)` is enforced at:
- Indexing
- Cart allocation
- Order placement

---

## Consequences

### Positive Outcomes

- Deterministic product visibility
- Zero geo-related checkout failures
- Simplified cart and order logic
- Safe multi-seller checkout
- Clean upgrade path to v2

---

### Trade-offs

- Products are invisible without customer location
- Storefront must actively provide coordinates
- Discovery without location is intentionally limited

---

## Non-Goals (Explicit)

The following are **not implemented in v1**:

- Seller verification–based visibility
- Global or cross-city selling
- Configurable delivery radius
- Express vs standard delivery modes
- SLA or ETA enforcement
- Checkout-time distance revalidation

---

## References

- Vendure Multivendor Example Plugin
- Vendure Elasticsearch Plugin (v9)
- SellerStoreInfoPlugin (internal)
- Unified Storefront (Qwik) Starter

---

## Future Considerations (v2 – Not Implemented)

- Seller-configurable delivery radius
- Verified seller privileges
- Multiple delivery speeds
- Checkout revalidation for extended delivery zones

These changes must be additive and must not alter v1 behavior.

---

**Decision Finalized.**
