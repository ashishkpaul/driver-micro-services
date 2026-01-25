# 📋 V1 CONSTRAINTS DOCUMENT

## 🚫 WHAT THIS SERVICE MUST NEVER DO

### 1. NEVER touch Vendure Fulfillment FSM

- No calls to AdminApi.transitionFulfillmentToState()
- No direct updates to Fulfillment.state

### 2. NEVER mutate Order state

- No Order modifications
- No automatic cancellations/refunds

### 3. NEVER implement driver acceptance workflow in v1

- Assignment is immediate and final
- No PENDING → ACCEPTED → REJECTED states

### 4. NEVER expose IN_TRANSIT state to Vendure

- Keep internally for ops visibility
- Never emit as webhook

### 5. NEVER guarantee delivery SLAs

- No ETA promises
- No penalty calculations

## ✅ WHAT THIS SERVICE DOES IN V1

1. Records delivery lifecycle events
2. Assigns nearest available driver
3. Stores proof of fulfillment
4. Emits failure events as facts
5. Maintains audit trail

## 🔒 V1 FROZEN BOUNDARIES

Effective: 2026-01-23
Frozen until: ADR-v2 formal approval

## 🎯 FINAL v1 BEHAVIOR SPEC

### **Inputs (Vendure → Driver)**

```
POST /events/seller-order-ready
{
  "sellerOrderId": "uuid",
  "channelId": "uuid",
  "pickup": { "lat": 12.97, "lon": 77.59 },
  "drop": { "lat": 12.93, "lon": 77.62 }
}
```

### **Outputs (Driver → Vendure)**

Only these events:

```
DELIVERY_ASSIGNED_V1
DELIVERY_PICKED_UP_V1
DELIVERY_DELIVERED_V1
DELIVERY_FAILED_V1
```

### **Internal States (Ops only)**

```
PENDING → ASSIGNED → PICKED_UP → [IN_TRANSIT] → DELIVERED
```

## ✅ V1 COMPLIANCE MATRIX

| ADR | Status | Implementation |
|-----|--------|----------------|
| ADR-005 | ✅ | Separate delivery domain |
| ADR-006 | ✅ | Event-driven integration |
| ADR-007 | ✅ | Nearest driver algorithm |
| ADR-008 | ✅ | Webhook contracts |
| ADR-009 | ✅ | Lifecycle events + proof |
| ADR-010 | ✅ | Failure as facts, not states |
| ADR-012 | ✅ | No fulfillment automation |

## 🚀 DEPLOYMENT CHECKLIST

1. [x] Implement TypeORM-safe health check
2. [x] Remove driver acceptance workflow from v1
3. [x] Add V1-CONSTRAINTS.md document
4. [x] Lock delivery states to v1 set
5. [x] Ensure webhook idempotency documented
6. [x] Freeze API contracts

## 🏁 FINAL VERDICT

**This driver microservice is now v1-complete and ready for production.**

You have successfully:

1. **Avoided** the "Vendure as logistics engine" trap
2. **Preserved** all ADR boundaries
3. **Maintained** strict v1 simplicity
4. **Created** clean upgrade path to v2
5. **Built** production-grade service with proper constraints

The service is **frozen in v1 state** and ready to deploy. Any expansion (driver acceptance, SLAs, routing) requires explicit **ADR-v2 approval**.

## 📚 NEXT STEPS (OPTIONAL)

When ready for v2, create:

1. `ADR-013: Driver Mobile App Contract`
2. `ADR-014: SLA & ETA Framework`
3. `ADR-015: Advanced Routing & Batching`

But for now: **v1 is complete. Ship it.** 🚀
