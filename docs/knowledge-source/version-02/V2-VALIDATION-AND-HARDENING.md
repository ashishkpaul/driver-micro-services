# V2 Roadmap Validation & Production Hardening

**Date:** January 31, 2026  
**Status:** Validated & Refined  
**Reviewer Assessment:** Senior Architecture Review (PASSED)  

---

## ✅ Validation Summary

### Review Outcome: **APPROVED FOR EXECUTION**

The V2 roadmap documents have been reviewed against:
- Current `driver-micro-services` codebase (7,700+ lines)
- Production deployment patterns
- Real marketplace constraints
- Team execution capability

**Verdict:** The roadmap is **well-aligned, achievable, and non-disruptive**.

---

## Why V2 Is The Right Next Step

### 1. Technical Alignment (Not Fighting Your Code)

Your v1 driver service is **architecturally clean**:
- ✅ Domain events (OrderStateTransitionEvent, etc.)
- ✅ WebSocket contracts (versioned)
- ✅ Driver status enums (AVAILABLE, BUSY, OFFLINE)
- ✅ City/zone awareness (built-in)
- ✅ NestJS module boundaries (strict)
- ✅ Database migrations (disciplined)
- ✅ E2E test coverage (real)

**V2 does NOT require rewrites because it extends, not replaces:**

| v1 Component | v2 Extension | Impact |
|---|---|---|
| DriverStatus enum | → Add ON_BREAK, SHIFT_ENDED, PAUSED | Additive, backward-compatible |
| Assignment service | → Add Offer creation & acceptance | Service composition |
| Events system | → Add offer_accepted, offer_rejected events | Uses existing event bus |
| Driver model | → Add availability_until, availability_reason | Schema extension |
| Redis drivers:geo | → Remove non-AVAILABLE drivers automatically | Invariant strengthening |
| Logging | → Add audit trail table | New entity, no breaking changes |
| API | → Add /drivers/:id/availability/* endpoints | New routes, existing patterns |

**This is evolution, not rewrite.** Your team can ship Phase 1 without touching the core assignment logic.

---

### 2. Honest Phasing (No Fake Promises)

Most roadmaps lie about sequencing. This one doesn't:

**Phase 1 = Survive (Week 1-2 post-GA)**
- Explicit: "make operations bearable"
- Honest: "firefighting will still happen, but less"
- Realistic: "3 engineers, 2 weeks, rough"

**Phase 2 = Stop Firefighting (Week 3-4)**
- Explicit: "automate what Phase 1 created"
- Honest: "some edge cases will still be manual"
- Realistic: "ops can now sleep"

**Phase 3 = Customer Trust (Week 5-6)**
- Explicit: "customers see ETA + live tracking"
- Honest: "this is where retention improves"
- Realistic: "build after reliability is solid"

**Phase 4 = Profitability (Week 7+)**
- Explicit: "understand unit economics"
- Honest: "cost model is approximate"
- Realistic: "optimize after you have data"

This phasing is **the strongest part of the roadmap**. It doesn't pretend everything is equally important.

---

### 3. Non-Negotiable Alignment with Current Codebase

Every V2 feature was checked against your actual code:

**Driver Offer + Accept (ADR-024):**
- Uses your existing WebhookService pattern
- Extends your driver notification infrastructure
- Respects your idempotency guarantees (sellerOrderId as key)
- ✅ **Can start Week 1**

**Availability States (ADR-025):**
- Extends your DriverStatus enum cleanly
- Fits into your existing location-update workflow
- Uses your Redis + PostgreSQL dual model
- ✅ **Can start Week 1**

**Escalation & Observability (ADR-027):**
- Plugs into your existing cron infrastructure
- Uses your NotificationService
- Respects your structured logging (Winston)
- ✅ **Can start Week 1**

**Auto-Reassignment (ADR-026):**
- Reuses your AssignmentService logic
- Extends your delivery state machine
- Respects your idempotency constraints
- ✅ **Can start Week 2**

**Audit Trail (ADR-028):**
- New table, zero impact on existing logic
- Formalizes what you already log
- Queryable for support + compliance
- ✅ **Can start Week 3**

**ETA + Tracking (ADR-029):**
- Depends on maps API (external)
- Extends your delivery model
- Uses your WebSocket infrastructure
- ✅ **Can start Week 5** (maps API setup takes time)

---

## 🔧 Production Hardening: 3 Suggested Refinements

These are **additions to make V2 even more bulletproof**, not replacements:

---

### Refinement 1: Explicit Backward-Compatibility Policy

**Add to ADR-023 or create new section:**

```markdown
# Backward-Compatibility Policy for V2

## Driver Client Compatibility

### v2 Does NOT Break v1 Clients

All driver app clients running v1.x can continue operating during v2 rollout.

### How We Maintain Compatibility

#### 1. WebSocket Event Versioning
- v1 events continue working
- v2 events added alongside (not replacing)
- Servers handle both simultaneously

Example:
```typescript
// v1 event (continues to work)
{ 
  event: 'DELIVERY_ASSIGNED',
  deliveryId, driverId 
}

// v2 event (new)
{ 
  event: 'DELIVERY_OFFERED_V2',
  offerId, deliveryId, driverId,
  expiresAt, offerPayload
}

// Both events emitted during Phase 1
// Once all clients upgraded to v2, deprecate v1 event
```

#### 2. REST API Versioning
- Existing endpoints preserved
- New endpoints under `/v2/` prefix
- Graceful sunset of `/v1/` (6-month window minimum)

Example:
```
POST /drivers/:id/location  // v1, continues forever
POST /v2/drivers/:id/location  // v2, same functionality
POST /drivers/:id/availability  // v2 only (new feature)
```

#### 3. Database Schema Compatibility
- Add new columns (never remove)
- Add new tables (never delete existing)
- Nullable by default (no forced migrations)

Example:
```sql
-- GOOD: Add column, nullable
ALTER TABLE drivers ADD COLUMN availability_until TIMESTAMP;

-- BAD: Don't force existing rows
ALTER TABLE drivers ADD COLUMN offer_version INT NOT NULL DEFAULT 1;

-- Instead: Nullable, backfill over time
ALTER TABLE drivers ADD COLUMN offer_version INT;
-- Backfill in background job
UPDATE drivers SET offer_version = 1 WHERE offer_version IS NULL;
```

#### 4. Rollback Capability

Every V2 feature has a **feature flag** for instant disable:

```typescript
// In config service
ENABLE_DRIVER_OFFERS=true  // Can flip to false instantly
ENABLE_AVAILABILITY_STATES=true
ENABLE_ESCALATION=true

// In code
if (config.isFeatureEnabled('driver_offers')) {
  // Use offer workflow
} else {
  // Fall back to v1 auto-assignment
}
```

#### 5. Rollback Procedure (SOP)

If a feature breaks:
1. Set feature flag to `false` (30 seconds)
2. All new deliveries use v1 logic immediately
3. Continue serving existing offers/assignments gracefully
4. Investigate and redeploy without rush

```bash
# Rollback example
kubectl set env deployment/driver-service \
  ENABLE_DRIVER_OFFERS=false \
  --all-pods=true

# Takes effect within 1 cycle (< 1 min)
```

## Migration Window

- **v2.0.0 launch:** New features available (feature-flagged off by default)
- **v2.0.1 - v2.1:** Enable features city-by-city
- **v2.2:** Mandatory for new drivers, optional for existing
- **v3.0 (Month 6+):** Deprecate v1 patterns, require v2

This ensures **zero forced upgrades** before teams are ready.
```

**Why This Matters:**

1. **Reduces risk:** Can enable Phase 1 in one city, observe, then roll out
2. **Respects teams:** Driver app team gets 6+ months notice for mandatory upgrades
3. **Operational safety:** Can disable any feature in 30 seconds if needed
4. **Customer trust:** Staged rollout reduces blast radius

---

### Refinement 2: Operational Ownership & Escalation Matrix

**Add to SRE-RUNBOOK or create new section:**

```markdown
# Operational Ownership & Alert Routing

## V2 Feature Ownership (Who Gets Paged?)

### Phase 1 Features

| Feature | Owner | Primary Metric | Alert Threshold | Action |
|---------|-------|---|---|---|
| **Driver Offers** | Backend Lead | Offer creation latency (p99) | > 500ms | Page Backend |
| **Driver Offers** | Backend Lead | Offer acceptance rate | < 70% (sudden drop) | Investigate + alert Product |
| **Availability States** | Infra/SRE | Break expiration job success | 100% (any failure) | Page SRE immediately |
| **Escalation Job** | SRE | Unassigned orders not escalated | > 5% miss rate | Page SRE |
| **Escalation Job** | Support | Escalation queue size | > 50 unresolved | Alert Support Manager |

### Phase 2 Features

| Feature | Owner | Primary Metric | Alert Threshold | Action |
|---|---|---|---|---|
| **Auto-Reassignment** | Backend | Reassignment success rate | < 90% | Page Backend Lead |
| **Auto-Reassignment** | Backend | Reassignment latency (p99) | > 2000ms | Monitor, not page |
| **Audit Trail** | DBA | Audit log lag | > 1 second | Alert SRE |
| **Audit Log Queries** | Support | Query latency (for investigations) | > 5 seconds | Not critical, just monitor |

### Phase 3 Features

| Feature | Owner | Primary Metric | Alert Threshold | Action |
|---|---|---|---|---|
| **ETA Calculation** | Maps Team | Maps API errors | > 1% | Page Maps integration engineer |
| **ETA Calculation** | Backend | ETA stale (not updated in 30s) | Any | Page Backend |
| **Live Tracking** | Frontend | WebSocket connection drop | > 10% per city | Page Frontend Lead |
| **Live Tracking** | SRE | WebSocket server memory | > 80% | Scale horizontally |

### Phase 4 Features

| Feature | Owner | Primary Metric | Alert Threshold | Action |
|---|---|---|---|---|
| **Cost Analytics** | Finance/Data | Cost calculation lag | > 24 hours | Not urgent, monitor daily |
| **Cost Analytics** | Data | Cost query accuracy | Spot-check weekly | Not alerting, manual review |

---

## On-Call Handoff

Every on-call rotation should include this matrix.

**Weekly standup items:**
- Are all Phase 1 alerts healthy?
- Any Phase 2 features degrading?
- Upcoming Phase 3 launch readiness?

---

## Escalation Paths (Who Calls Who)

### Severity Levels

**SEV-1 (Page immediately):**
- Offers not being created (backend down)
- Escalation job failing (unassigned orders pile up)
- Auto-reassignment broken (deliveries stuck)
- WebSocket connections dropping > 10%

**SEV-2 (Page within 5 min):**
- Offer acceptance rate drops 20% in 1 hour (possible driver UX issue)
- Reassignment latency degrading
- Audit trail queries slow (support investigating, not blocking)

**SEV-3 (Monitor, morning standup):**
- Availability state job running slow
- Cost analytics lag
- Non-critical observability issues

### Who to Call

```
SRE on-call (pager): Infrastructure + jobs
Backend lead (pager): Assignment logic + APIs
Support manager (slack): Escalation queue overflow
Maps API team (slack): ETA calculation issues
Frontend lead (slack): WebSocket/tracking issues
```

---

## Test This Matrix Quarterly

Every quarter, run a **failure scenario drill**:

1. Simulate offer creation breaking (feature flag off)
2. Verify: Backend team paged, rollback completed in < 2 min
3. Simulate escalation job failing
4. Verify: SRE team paged, manual escalation runbook works
5. Document learnings

This prevents "who owns this?" surprises in production.
```

**Why This Matters:**

1. **Removes ambiguity:** Clear owner means faster response
2. **Right alerts:** Not paging humans for non-critical issues
3. **Operational trust:** Every engineer knows their sphere of responsibility
4. **Scaling:** Works with growing teams (one SRE → five SREs)

---

### Refinement 3: Feature Flags & Kill-Switch SOP

**Add to deployment procedures or create dedicated section:**

```markdown
# Feature Flags & Kill-Switches for V2

## Why Feature Flags Matter for V2

Each Phase 1 feature touches:
- Driver state machines
- Customer-visible status
- Assignment logic
- Notifications

If something breaks, you need **instant disable** capability, not "investigate then patch."

---

## Feature Flag Specification

### Implementation

Use your existing config service pattern:

```typescript
// src/config/features.config.ts
export const FEATURES = {
  DRIVER_OFFERS: {
    name: 'driver_offers',
    enabled: process.env.ENABLE_DRIVER_OFFERS === 'true',
    rolloutPercent: parseInt(process.env.DRIVER_OFFERS_ROLLOUT || '0'),
    description: 'Driver offer + accept workflow'
  },
  AVAILABILITY_STATES: {
    name: 'availability_states',
    enabled: process.env.ENABLE_AVAILABILITY_STATES === 'true',
    rolloutPercent: 100,
    description: 'Driver can set ON_BREAK, SHIFT_ENDED, etc.'
  },
  ESCALATION: {
    name: 'escalation',
    enabled: process.env.ENABLE_ESCALATION === 'true',
    rolloutPercent: 100,
    description: 'Auto-escalation for unassigned orders'
  }
}

// Usage in code
if (this.featureService.isEnabled('driver_offers')) {
  // Use offer workflow
  const offer = await this.offerService.createOffer(delivery, driver)
  return offer
} else {
  // Fallback to v1 auto-assignment
  const assignment = await this.assignmentService.assignNearestDriver(delivery)
  return assignment
}
```

### Rollout Percentage

Use gradual rollout to catch issues early:

```
Day 1 (Phase 1 launch):
  ENABLE_DRIVER_OFFERS=true
  DRIVER_OFFERS_ROLLOUT=5  // Only 5% of deliveries use offers

Day 2:
  DRIVER_OFFERS_ROLLOUT=25

Day 3:
  DRIVER_OFFERS_ROLLOUT=50

Day 4:
  DRIVER_OFFERS_ROLLOUT=100
```

If issue detected at any point:
```
  DRIVER_OFFERS_ROLLOUT=0  // Instantly disabled
  // Investigate with 5% of traffic unaffected
```

### Environment Variables (Prod Deployment)

```bash
# Phase 1 Feature Flags
ENABLE_DRIVER_OFFERS=true
DRIVER_OFFERS_ROLLOUT=100
DRIVER_OFFERS_TIMEOUT_SECONDS=30

ENABLE_AVAILABILITY_STATES=true
AVAILABILITY_STATES_ROLLOUT=100

ENABLE_ESCALATION=true
ESCALATION_CHECK_INTERVAL_MINUTES=2
ESCALATION_LEVEL_1_THRESHOLD_MINUTES=5
ESCALATION_LEVEL_2_THRESHOLD_MINUTES=15
ESCALATION_LEVEL_3_THRESHOLD_MINUTES=30

# Feature-specific configuration
OFFER_EXPIRATION_SECONDS=30
BREAK_MAX_DURATION_MINUTES=120
BREAK_MIN_DURATION_MINUTES=5
```

---

## Kill-Switch Procedures

### For Each Phase 1 Feature

#### Driver Offers Kill-Switch

```bash
# IMMEDIATE: Disable offer creation (all new deliveries auto-assign)
kubectl set env deployment/driver-service \
  ENABLE_DRIVER_OFFERS=false \
  --record

# Wait 30 seconds for pods to restart
kubectl rollout status deployment/driver-service

# Verify: Check logs for "driver_offers disabled"
kubectl logs -l app=driver-service --tail=100 | grep "disabled"

# In-flight offers (already created): Continue gracefully
# Drivers can still accept existing offers
# New offers not created
```

#### Availability States Kill-Switch

```bash
# IMMEDIATE: Drivers revert to AVAILABLE/OFFLINE only
kubectl set env deployment/driver-service \
  ENABLE_AVAILABILITY_STATES=false \
  --record

# Effect: ON_BREAK drivers marked OFFLINE instead
# They'll be removed from GEO, which is correct fallback
# Manual restart their availability after fix deployed
```

#### Escalation Kill-Switch

```bash
# IMMEDIATE: Stop escalation job (manual assignment remains possible)
kubectl set env deployment/driver-service \
  ENABLE_ESCALATION=false \
  --record

# Effect: Unassigned orders no longer auto-escalate
# Support team can still manually reassign
# Re-enable after investigation
```

---

## Full Rollback (If Multiple Features Break)

```bash
# Option 1: Disable all Phase 1 features
kubectl set env deployment/driver-service \
  ENABLE_DRIVER_OFFERS=false \
  ENABLE_AVAILABILITY_STATES=false \
  ENABLE_ESCALATION=false \
  --record

# Option 2: Rollback to previous deployment
kubectl rollout undo deployment/driver-service
kubectl rollout status deployment/driver-service

# Verify rollback successful
curl http://localhost:3001/health
# Should show v1.x features healthy

# Then: Investigate root cause (20+ min)
# Then: Deploy fixed version (10+ min)
# Then: Re-enable features gradually
```

---

## Testing Kill-Switches (Quarterly Drill)

Every quarter, **simulate** each kill-switch in staging:

```bash
# 1. Deploy Phase 1 with all features enabled
kubectl set env staging/driver-service ENABLE_DRIVER_OFFERS=true

# 2. Create test deliveries (verify offers work)

# 3. Execute kill-switch
kubectl set env staging/driver-service ENABLE_DRIVER_OFFERS=false

# 4. Verify: New deliveries auto-assign (no offers)
# 5. Verify: Logs show "driver_offers disabled"
# 6. Verify: Existing offers still accepted by drivers
# 7. Document: Time to disable (should be < 1 minute)

# 8. Recovery test: Re-enable feature
kubectl set env staging/driver-service ENABLE_DRIVER_OFFERS=true
# 9. Verify: New offers created normally

# Result: Document in runbook
# "Offer kill-switch tested 2026-Q1: Works correctly, 30 sec restart time"
```

---

## Monitoring Kill-Switch Health

Add to your prometheus dashboard:

```
feature_flags_enabled{feature="driver_offers"}
feature_flags_rollout_percent{feature="driver_offers"}
feature_flag_toggles_total{feature="driver_offers", action="disabled"}
```

**Alert if:**
- Any feature flag disabled for > 1 hour (alert ops that it's still off)
- Multiple features disabled simultaneously (possible cascading failure)
- Rollout percentage not progressing as planned

---

## SOP: When to Use Kill-Switch vs. Fix

| Scenario | Action |
|----------|--------|
| Offer creation throwing errors | Kill-switch immediately (ENABLE_DRIVER_OFFERS=false) |
| Offer acceptance latency high | Investigate (check database, logs) - don't kill-switch |
| Escalation job not running | Kill-switch (ENABLE_ESCALATION=false), then fix |
| Availability state transitions broken | Kill-switch (ENABLE_AVAILABILITY_STATES=false), then fix |
| Issue fixed, need to re-enable | Increase ROLLOUT gradually (5% → 25% → 100%) |

**Rule:** Kill-switch for **hard failures**. Degradation doesn't require kill-switch.
```

**Why This Matters:**

1. **Operational confidence:** Know you can disable any Phase 1 feature in < 1 minute
2. **Gradual rollout:** Catch 5% issues before they hit 100%
3. **Team safety:** Engineers aren't afraid to deploy if they know kill-switch exists
4. **Learning culture:** Quarterly drills build muscle memory

---

## 🧪 How These Refinements Integrate

### Into Your Current Deployment

```
Current: v1.0.0 GA deployment
  ├─ Single feature set (driver assignment)
  ├─ All-or-nothing upgrade
  ├─ No gradual rollout
  └─ Kill-switch: Revert entire service

With Refinements: v2.0.0 Deployment
  ├─ Multiple feature flags (offers, availability, escalation)
  ├─ Gradual rollout per feature (0% → 5% → 25% → 50% → 100%)
  ├─ Operational ownership matrix (clear who owns what)
  ├─ Backward compatibility policy (old clients still work)
  └─ Kill-switch per feature (5% issue doesn't kill 100%)
```

### Into Your Runbook

Add three new sections:
1. "Backward Compatibility Policy" (for PRs / upgrades)
2. "Operational Ownership Matrix" (for on-call)
3. "Feature Flags & Kill-Switches" (for deployments)

### Into Your Deployment CI/CD

```yaml
# Helm values for v2.0.0
features:
  driverOffers:
    enabled: true
    rolloutPercent: 5    # Start at 5%, increase daily
    timeoutSeconds: 30
  
  availabilityStates:
    enabled: true
    rolloutPercent: 100  # Less risky, can be 100% day 1
  
  escalation:
    enabled: true
    rolloutPercent: 100  # Critical for ops, enable fully

# Deploy:
helm upgrade driver-service charts/driver-service \
  --values values-v2.0.0.yaml
```

---

## ✅ Production Readiness Checklist (Updated)

Before deploying Phase 1:

- [ ] All feature flags implemented and tested
- [ ] Kill-switch procedures documented in runbook
- [ ] Operational ownership matrix communicated to on-call team
- [ ] Backward compatibility tests (v1 clients + v2 features together)
- [ ] Gradual rollout plan defined (5% → 25% → 100%)
- [ ] Rollback procedure tested in staging
- [ ] Feature flag quarterly drill completed
- [ ] Deployment SOP updated to include flag management

---

## Summary: Why These 3 Refinements Matter

1. **Backward Compatibility:** Safe upgrades, no forced client updates
2. **Operational Ownership:** Right people paged for right issues, faster MTTR
3. **Feature Flags & Kill-Switches:** Reduces fear, enables faster shipping

These aren't "nice to have" docs. They're what separates **shipping fast** from **shipping recklessly**.

All three can be implemented **in parallel with Phase 1 coding** (no blockers).
```

**Impact:**

- **Risk:** Reduced from "one bug affects everyone" to "one bug affects < 5%"
- **Speed:** Team confidence to ship faster (kill-switch exists)
- **Learning:** Quarterly drills build operational muscle memory
- **Scaling:** Works with small teams (2 engineers) and large teams (10+ engineers)

---

## Integration into V2 Deliverables

Add these three refinement sections to:

1. **V2-ROADMAP-PRACTICAL-GAPS.md** → Add section "Production Hardening" at end
2. **ADR-023 (Integration Contract)** → Add "Backward Compatibility Policy" section
3. **GA-grade-SRE-Runbook.md** → Add "Operational Ownership Matrix" and "Feature Flags SOP"

This keeps everything **modular and discoverable**.

---

## Final Validation

### After Adding These 3 Refinements:

✅ **Backward Compatibility:** Explicit policy, rollback procedures, old clients supported 6+ months  
✅ **Operational Safety:** Clear ownership, alert routing, monthly drills  
✅ **Shipping Confidence:** Feature flags, gradual rollout, instant kill-switches  

### Readiness for Phase 1 Launch (Week 1 post-GA)

**Before:** Technical v2 docs only (good)  
**After:** Technical + operational + deployment hardening (excellent)

**Recommendation:** Add these refinements to V2 package **before** sharing with leadership.

They convert v2 from "good plan" to "production-hardened plan."

---

**Status:** V2 Roadmap now includes production hardening.  
**Next Step:** Leadership review and Phase 1 funding decision.
