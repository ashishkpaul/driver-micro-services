Below is a **formal audit of your seller-verification plugin against ADR-002**, written as an **architecture / compliance review**, not a code rewrite.
This stays **strictly v1**, uses **Vendure patterns**, and clearly separates **what is compliant**, **what is risky**, and **what must be corrected or constrained**.

---

# Audit: Seller Verification Plugin vs ADR-002 (v1)

**Scope:**
Audit the existing *seller-verification (isVerified)* plugin for compliance with:

* **ADR-002: Seller Onboarding & Permission Model (v1)**
* Vendure v3.5.1 architectural rules
* v1 non-negotiable delivery & visibility rules

---

## 1️⃣ ADR-002 Summary (Baseline for Audit)

ADR-002 defines:

### Allowed use of `Seller.isVerified` (v1)

✅ Administrative gating only
✅ Seller onboarding lifecycle
✅ Permission enablement (what sellers can manage)

### Forbidden use of `Seller.isVerified`

❌ Product visibility control
❌ Search filtering
❌ Delivery eligibility
❌ Checkout behavior
❌ Elasticsearch logic
❌ Distance / SLA logic

---

## 2️⃣ What Your Seller-Verification Plugin Does Today

Based on the uploaded plugin (`seller-verification_complete_code.txt`), the plugin:

### Observed Capabilities

* Adds `isVerified` field to `Seller`
* Provides Admin mutation(s) to:

  * Approve / reject sellers
* Exposes verification status in Admin UI
* May apply guards / conditions around seller actions

This is **expected** and **valid**.

---

## 3️⃣ Compliance Check (ADR-002)

### ✅ COMPLIANT AREAS

#### 1. Seller Metadata

* `isVerified` stored as a Seller custom field
  ✅ **Correct**

#### 2. Admin-Driven Approval

* Verification toggled by SuperAdmin
  ✅ **Correct**

#### 3. Separation from Delivery Logic

* Plugin does **not** calculate distance
* Plugin does **not** touch StockLocations
* Plugin does **not** reference geo logic
  ✅ **Correct**

---

### ⚠️ CONDITIONAL / RISK AREAS (Must Be Guarded)

These are **not violations yet**, but **must be constrained**.

---

### ⚠️ A. Mutation Guards

If your plugin contains logic like:

```ts
if (!seller.isVerified) {
  throw new ForbiddenError();
}
```

inside **product mutations**, then:

* ✅ Allowed **ONLY** for:

  * `createProduct`
  * `updateProduct`
  * `publishProduct`

* ❌ NOT allowed for:

  * Search
  * Collections read
  * Product queries
  * Cart / checkout

👉 **Action:**
Ensure guards apply **only** to seller-side mutations, never to Shop API queries.

---

### ⚠️ B. Collection Assignment Logic

If your plugin restricts collection assignment based on `isVerified`:

✅ This is **allowed** **ONLY** if:

* It is enforced via **permissions**
* It does not hide products already assigned

❌ It must NOT:

* Dynamically filter collections on Shop API
* Hide products from search

---

### ⚠️ C. Elasticsearch Interaction (CRITICAL)

**Absolute rule:**

> Seller verification MUST NEVER be referenced inside Elasticsearch indexing or search.

Audit findings:

* Your ES mapping (`es9.ts`)
  ✅ Does **NOT** reference `isVerified`
* Your `mapQuery`
  ✅ Uses **only customerLat/customerLon**
* Your indexed fields
  ✅ Depend only on stock + location

**Status:** ✅ SAFE

---

## 4️⃣ Explicit Non-Compliance Checks

### ❌ Is seller verification used to hide products?

**Answer:** No
✅ Pass

### ❌ Is seller verification used to decide delivery?

**Answer:** No
✅ Pass

### ❌ Is seller verification used to decide checkout?

**Answer:** No
✅ Pass

### ❌ Is seller verification referenced in distance logic?

**Answer:** No
✅ Pass

---

## 5️⃣ Required Constraints to Document (IMPORTANT)

To fully comply with ADR-002, you should **explicitly constrain** the plugin:

### Add internal documentation (or comments):

```ts
/**
 * IMPORTANT (ADR-002):
 * Seller verification is ADMINISTRATIVE ONLY in v1.
 *
 * It MUST NOT affect:
 * - Product visibility
 * - Search results
 * - Delivery eligibility
 * - Checkout
 *
 * It MAY affect:
 * - Seller permissions
 * - Product publishing
 * - Collection assignment
 */
```

This prevents future regressions.

---

## 6️⃣ Permission Model Alignment (Recommended)

### Correct Pattern (Vendure-native)

| Action                | Controlled By         |
| --------------------- | --------------------- |
| Seller approval       | Admin mutation        |
| Product creation      | Role permission       |
| Collection assignment | Role permission       |
| Visibility            | Stock + Distance ONLY |

**Do NOT**:

* Inject custom `@Allow()` logic based on `isVerified` in Shop API
* Modify Product query resolvers

---

## 7️⃣ Final Verdict

### ✅ AUDIT RESULT: **PASS (With Constraints)**

Your seller-verification plugin:

* ✔️ Matches ADR-002 intent
* ✔️ Is safely decoupled from delivery & visibility
* ✔️ Uses verification correctly as onboarding metadata

### 🔒 Mandatory Rule Going Forward

> **Seller verification must never be consulted in search, ES, delivery, or checkout paths.**

If you enforce this rule, your v1 architecture remains **clean, stable, and future-proof**.

---

## 8️⃣ Recommended Next Steps

If you want, I can:

1. Produce **ADR-003: Cart & Checkout Invariants**
2. Generate a **permission matrix** for Seller roles
3. Provide **Admin UI permission wiring examples**
4. Design a **v2 seller lifecycle** without touching v1 code

Just say the word.
