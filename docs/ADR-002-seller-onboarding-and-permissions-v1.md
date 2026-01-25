Below is **ADR-002**, written in the **same formal, production-ready style** as ADR-001 and designed to be **committed under `/docs/adr/`**.

This ADR is **strictly v1-compliant**, does **NOT** overload seller verification, and cleanly explains **seller onboarding, permissions, and collection access** without leaking into delivery or visibility logic.

---

# `/docs/adr/ADR-002-seller-onboarding-and-permissions-v1.md`

```md
# ADR-002: Seller Onboarding & Permission Model (v1)

**Status:** Accepted  
**Date:** 2026-01-21  
**Decision Owner:** Platform / Architecture Team  
**Scope:** Seller lifecycle, Admin UI, Channel & Collection permissions  
**Vendure Version:** v3.5.1  
**Project Phase:** v1 (Locked)

---

## Context

The platform is a **multi-vendor local marketplace** where:

- Multiple sellers operate within a shared **default channel**
- Sellers may operate multiple StockLocations
- Product visibility is governed exclusively by:
  - Physical inventory
  - Distance (≤ 5 km)

While a **seller verification flag exists**, it is explicitly **out of scope** for
delivery, visibility, and checkout decisions in v1.

However, the platform still requires a **controlled and safe seller onboarding process** that:

- Prevents unapproved sellers from polluting the catalog
- Allows the platform admin to curate collections and facets
- Uses Vendure’s permission system correctly
- Avoids coupling onboarding with delivery logic

---

## Problem Statement

Without a clear onboarding model:

- Sellers could publish products before operational readiness
- Collections and facets could become inconsistent
- Verification flags could be misused to control visibility
- Future v2 logic could accidentally leak into v1 behavior

The system needs a **clean separation** between:

- Seller onboarding & permissions
- Product visibility & delivery rules

---

## Decision

### Seller Verification Is **Administrative Only** (v1)

The `Seller.isVerified` flag:

- **MAY exist** as metadata
- **MUST NOT** affect:
  - Product visibility
  - Search results
  - Delivery eligibility
  - Checkout behavior

It is used **only** to gate onboarding steps and admin permissions.

---

## Seller Lifecycle (v1)

### 1. Seller Registration

When a seller is created:

- Seller entity is created
- Seller user is created
- Seller is assigned to the **default channel**
- Seller is marked:
```

isVerified = false

```

At this stage, the seller:

- ❌ Cannot publish products
- ❌ Cannot assign products to collections
- ❌ Cannot manage facets
- ✅ Can complete profile and StockLocation setup

---

### 2. StockLocation Setup (Mandatory)

Before activation, a seller must:

- Create **at least one StockLocation**
- Provide:
- Postal code
- Latitude
- Longitude

This ensures:

- Products can later qualify for the 5 km visibility rule
- Elasticsearch indexing will be valid

No StockLocation → no operational readiness.

---

### 3. Platform Admin Approval

A **Portal Admin (SuperAdmin)** reviews the seller and performs:

- Data validation (business info, compliance, etc.)
- Operational readiness check (StockLocations exist)
- Manual approval

Upon approval:

```

seller.isVerified = true

```

This is an **administrative milestone only**.

---

## Permission Model (v1)

### Core Principle

**Visibility rules are NOT enforced via permissions.**

Permissions only control **what sellers can manage**, not **what customers see**.

---

### Seller Permissions (Pre-Verification)

| Capability | Allowed |
|----------|--------|
| Edit seller profile | ✅ |
| Create StockLocations | ✅ |
| Upload products | ❌ |
| Assign collections | ❌ |
| Assign facets | ❌ |
| Publish products | ❌ |

---

### Seller Permissions (Post-Verification)

After `isVerified = true`, the seller gains:

| Capability | Allowed |
|----------|--------|
| Create & manage products | ✅ |
| Assign products to approved collections | ✅ |
| Use approved facets | ✅ |
| Manage stock levels | ✅ |

---

## Collections & Facets Governance

### Collection Ownership

- **Collections are owned and curated by the Platform Admin**
- Sellers have **read-only access** to collections
- Admin explicitly enrolls sellers into:
  - Allowed collections
  - Allowed facets

This ensures:

- Catalog consistency
- Controlled taxonomy
- No seller-driven fragmentation

---

### Enforcement Mechanism

- Use Vendure’s **role-based permissions**
- Restrict mutation resolvers for:
  - Collection creation
  - Facet creation
- Allow sellers to:
  - Assign products only to whitelisted collections/facets

No custom visibility logic is added.

---

## Explicit Non-Goals (v1)

The following are **not implemented**:

- Seller-specific collections
- Seller-defined facets
- Verification-based visibility
- Location-based onboarding differences
- Auto-approval or workflow engines

---

## Relationship to ADR-001

This ADR **intentionally does not overlap** with:

- Location-based visibility
- Distance calculations
- Elasticsearch filtering
- Cart or checkout logic

A seller may be **verified** and still invisible to a customer
if they fail the **5 km + stock rule** defined in ADR-001.

---

## Consequences

### Positive Outcomes

- Clean separation of concerns
- Predictable seller onboarding
- No accidental v2 leakage
- Simple admin workflows
- Safe multi-vendor catalog control

---

### Trade-offs

- Manual admin intervention required
- Sellers cannot self-publish immediately
- Discovery depends on admin curation

These are acceptable in v1.

---

## Future Considerations (v2 – Not Implemented)

Potential future enhancements (explicitly deferred):

- Automated seller approval workflows
- Tiered seller permissions
- Verified seller discovery boosts
- Seller-owned collections
- Cross-city seller expansion

All future changes must preserve v1 invariants.

---

**Decision Finalized.**
```

---

## ✅ Next Recommended Commits

```bash
git add docs/adr/ADR-002-seller-onboarding-and-permissions-v1.md
git commit -m "docs(adr): define seller onboarding and permission model v1"
```

---

## If You Want, I Can Next

* Generate **ADR-003: Cart & Checkout Invariants**
* Audit your **seller-verification plugin** against this ADR
* Provide **Admin UI permission wiring examples**
* Design a **v2 onboarding workflow without touching v1 code**

Just tell me which one.
