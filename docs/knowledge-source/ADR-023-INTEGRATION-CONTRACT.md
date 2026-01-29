# ADR-023: Vendure ↔ Driver Service Integration Contract

**Status:** Accepted  
**Date:** 2026-01-28  
**Scope:** Webhook & REST API contracts between systems  
**Version:** v1.0

---

## Context

Two independent systems must communicate reliably:
- **Vendure Core** (commerce platform) — source of orders
- **Driver Service** (microservice) — manages deliveries

Requirements:
✅ Versioned contracts (safe evolution)  
✅ Idempotent operations (safe retries)  
✅ Fire-and-forget semantics (no blocking)  
✅ Clear error handling  
✅ Observability (correlation IDs optional)

---

## Integration Flows

### Flow 1: Order → Delivery (Vendure → Driver Service)

```
1. Customer places order in Vendure
2. Order transitions to PaymentSettled
3. driver-integration plugin emits SellerOrderReadyForDispatchEvent
4. WebhookPlugin transforms event to versioned payload
5. HTTP POST to Driver Service /events/seller-order-ready
6. Driver Service assigns driver
7. Delivery status webhook sent back to Vendure
8. driver-integration plugin records delivery status on Order
```

### Flow 2: Delivery Status Updates (Driver Service → Vendure)

```
1. Driver picks up / delivers order
2. Driver Service publishes webhook (DELIVERY_PICKED_UP_V1, etc.)
3. HTTP POST to Vendure /webhooks/driver
4. driver-integration plugin records event as Order.customFields
5. Order detail page displays delivery status (eventual consistency)
```

---

## Webhook Payloads (Versioned)

### ✅ SELLER_ORDER_READY_FOR_DISPATCH_V1

**Direction:** Vendure → Driver Service  
**Endpoint:** `POST https://driver-service.example.com/events/seller-order-ready`  
**Trigger:** Order state transitions to PaymentSettled (seller order)

**Payload Schema:**
```json
{
  "version": "v1",
  "event": "SELLER_ORDER_READY_FOR_DISPATCH_V1",
  "timestamp": "2026-01-28T10:15:00Z",
  "sellerOrderId": "ORD-12345-001",
  "channelId": "default",
  "pickup": {
    "stockLocationId": "SL-99",
    "lat": 12.9735,
    "lon": 77.5937,
    "address": "123 Main St, Bangalore"
  },
  "drop": {
    "lat": 13.0,
    "lon": 77.7,
    "address": "Customer address from shipping"
  }
}
```

**Field Descriptions:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| version | string | ✓ | Always "v1" for this payload |
| event | string | ✓ | Event name & version: SELLER_ORDER_READY_FOR_DISPATCH_V1 |
| timestamp | ISO8601 | ✓ | When order became ready in Vendure |
| sellerOrderId | string | ✓ | Unique order ID, used for idempotency |
| channelId | string | ✓ | Channel context (for multi-channel Vendure) |
| pickup | object | ✓ | Stock location coordinates & address |
| drop | object | ✓ | Customer delivery coordinates & address |

**Idempotency Key:** `sellerOrderId`

**Expected Response (Success):**
```json
{
  "success": true,
  "sellerOrderId": "ORD-12345-001",
  "assignedDriverId": "DRV-abc123",
  "deliveryId": "DEL-xyz789",
  "estimatedPickupTime": "2026-01-28T10:30:00Z",
  "estimatedDeliveryTime": "2026-01-28T10:45:00Z"
}
```

**Expected Response (No Driver Available):**
```json
{
  "success": false,
  "sellerOrderId": "ORD-12345-001",
  "reason": "NO_AVAILABLE_DRIVERS_WITHIN_RADIUS",
  "estimatedRetryTime": "2026-01-28T10:20:00Z"
}
```

**HTTP Status Codes:**
| Code | Meaning | Vendure Action |
|------|---------|----------------|
| 200 | Success (driver assigned or no-op) | Mark order ASSIGNED or leave READY |
| 200 | No drivers available | Leave order in READY state |
| 400 | Bad payload | Log error, don't retry |
| 401 | Unauthorized (webhook secret) | Log error, don't retry |
| 500 | Server error | Retry with exponential backoff |
| Timeout | Network issue | Retry with exponential backoff |

**Retry Strategy (Vendure side):**
```typescript
// Attempt 1: Immediate
// Attempt 2: 1 second delay
// Attempt 3: 5 seconds delay
// Attempt 4: 30 seconds delay
// Max retries: 4

// If order still in READY after retries:
// - Manual assignment by staff later
// - Or automatic retry when next driver comes online
```

---

### ✅ DELIVERY_ASSIGNED_V1

**Direction:** Driver Service → Vendure  
**Endpoint:** `POST https://vendure.example.com/webhooks/driver`  
**Trigger:** Driver assigned to delivery

**Payload Schema:**
```json
{
  "version": "v1",
  "event": "DELIVERY_ASSIGNED_V1",
  "timestamp": "2026-01-28T10:15:30Z",
  "sellerOrderId": "ORD-12345-001",
  "deliveryId": "DEL-xyz789",
  "assignedDriver": {
    "id": "DRV-abc123",
    "name": "John Smith",
    "phone": "+919876543210",
    "rating": 4.8
  },
  "pickupEta": "2026-01-28T10:30:00Z",
  "deliveryEta": "2026-01-28T10:45:00Z"
}
```

**Idempotency Key:** `deliveryId` (unique per order)

**Expected Response:**
```json
{
  "success": true,
  "message": "Delivery status updated"
}
```

---

### ✅ DELIVERY_PICKED_UP_V1

**Direction:** Driver Service → Vendure  
**Endpoint:** `POST https://vendure.example.com/webhooks/driver`  
**Trigger:** Driver confirms items picked up at stock location

**Payload Schema:**
```json
{
  "version": "v1",
  "event": "DELIVERY_PICKED_UP_V1",
  "timestamp": "2026-01-28T10:32:00Z",
  "sellerOrderId": "ORD-12345-001",
  "deliveryId": "DEL-xyz789",
  "proofUrl": "https://delivery-service-cdn.example.com/proof-123.jpg",
  "proofType": "photo",
  "driverNotes": "Items confirmed and packed"
}
```

**Idempotency Key:** `deliveryId + event type`

---

### ✅ DELIVERY_DELIVERED_V1

**Direction:** Driver Service → Vendure  
**Endpoint:** `POST https://vendure.example.com/webhooks/driver`  
**Trigger:** Driver confirms delivery to customer

**Payload Schema:**
```json
{
  "version": "v1",
  "event": "DELIVERY_DELIVERED_V1",
  "timestamp": "2026-01-28T10:47:00Z",
  "sellerOrderId": "ORD-12345-001",
  "deliveryId": "DEL-xyz789",
  "proofUrl": "https://delivery-service-cdn.example.com/delivery-proof-456.jpg",
  "proofType": "photo",
  "driverNotes": "Delivered to customer",
  "deliveryTime": 32 // minutes from pickup to delivery
}
```

---

### ✅ DELIVERY_FAILED_V1

**Direction:** Driver Service → Vendure  
**Endpoint:** `POST https://vendure.example.com/webhooks/driver`  
**Trigger:** Delivery could not be completed

**Payload Schema:**
```json
{
  "version": "v1",
  "event": "DELIVERY_FAILED_V1",
  "timestamp": "2026-01-28T10:47:00Z",
  "sellerOrderId": "ORD-12345-001",
  "deliveryId": "DEL-xyz789",
  "reason": "CUSTOMER_NOT_AVAILABLE",
  "driverNotes": "Customer not at location, will retry tomorrow",
  "nextRetryTime": "2026-01-29T10:00:00Z",
  "failureCode": "CUSTOMER_NOT_AVAILABLE"
}
```

**Failure Codes:**
| Code | Meaning | Retry? |
|------|---------|--------|
| DRIVER_UNAVAILABLE | Driver went offline | Yes |
| CUSTOMER_NOT_AVAILABLE | Customer not at location | Yes |
| ADDRESS_INVALID | Bad coordinates | No (manual fix needed) |
| TRAFFIC_DELAY | Late but still attempting | Yes |
| DELIVERY_REFUSED | Customer refused | No |
| ACCIDENT | Delivery vehicle damaged | No |
| OTHER | Unspecified failure | No |

---

## Headers & Authentication

### Request Headers (All Webhooks)

```
POST /events/seller-order-ready HTTP/1.1
Host: driver-service.example.com
Content-Type: application/json
Content-Length: 1024
X-Webhook-Secret: <shared-secret>
X-Request-ID: vendure-uuid-12345 (optional, for correlation)
User-Agent: VendureWebhookPlugin/1.0
```

### Response Headers (Expected)

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 256
```

### Secret Validation (Driver Service)

```typescript
@Post('/events/seller-order-ready')
async handleSellerOrderReady(
  @Body() payload: any,
  @Headers('x-webhook-secret') secret: string
) {
  const expectedSecret = process.env.VENDURE_WEBHOOK_SECRET;
  
  if (expectedSecret && secret !== expectedSecret) {
    throw new UnauthorizedException('Invalid webhook secret');
  }

  // Process payload
}
```

---

## Error Handling & Resilience

### Driver Service Responsibilities

1. **Validate Payload**
   ```typescript
   if (!payload.sellerOrderId) {
     return { success: false, error: 'Missing sellerOrderId' };
   }
   ```

2. **Check Idempotency**
   ```typescript
   const existing = await deliveryRepository.findOne({
     where: { seller_order_id: payload.sellerOrderId }
   });

   if (existing) {
     return { success: true, deliveryId: existing.id };
   }
   ```

3. **Attempt Assignment**
   ```typescript
   try {
     const assignment = await assignmentService.assignNearestDriver(...);
     return { success: true, assignedDriverId: assignment.driverId };
   } catch (error) {
     if (error.message === 'NO_AVAILABLE_DRIVERS') {
       return { success: false, reason: 'NO_AVAILABLE_DRIVERS' };
     }
     throw error; // 500 error
   }
   ```

4. **Always Return 2xx** (even when no driver)
   - ✅ `200 OK` with `success: true`
   - ✅ `200 OK` with `success: false, reason: ...`
   - ❌ `500 Internal Server Error` only for actual failures

### Vendure Responsibilities

1. **Fire-and-Forget Pattern**
   ```typescript
   async handleSellerOrderReady(order) {
     try {
       const response = await httpClient.post(
         'https://driver-service.example.com/events/seller-order-ready',
         payload,
         { timeout: 5000 }
       );

       if (!response.success) {
         this.logger.warn(
           `Driver assignment failed: ${response.reason}`,
           { orderId: order.id }
         );
         // Order stays in READY state
         // Manual assignment or retry later
       }
     } catch (error) {
       this.logger.error('Webhook dispatch failed', error);
       // Retry will be handled by WebhookPlugin
     }
   }
   ```

2. **Don't Block Order Placement**
   - Order placement must succeed even if driver service is down
   - Delivery assignment is an async, best-effort operation

3. **Handle Eventual Consistency**
   - Order may show delivery status with 10-30s delay
   - This is acceptable for v1

---

## Versioning Strategy

### Major Version Changes (Breaking)

**Example: v2 adds new required field `serviceLevel`**

```json
{
  "version": "v2",
  "event": "SELLER_ORDER_READY_FOR_DISPATCH_V2",
  "serviceLevel": "EXPRESS" | "STANDARD",
  // ... other fields
}
```

**Transition Plan:**
1. Deploy Driver Service with v2 support (still accepts v1)
2. Update Vendure plugins to emit v2
3. After 1 week: Remove v1 support in Driver Service
4. Monitor error logs for v1 rejections (should be 0)

### Minor Version Changes (Compatible)

**Example: v1.1 adds optional field `packageType`**

```json
{
  "version": "v1",
  "event": "SELLER_ORDER_READY_FOR_DISPATCH_V1",
  "packageType": "BOX" | "BAG", // optional, new in v1.1
  // ... other fields
}
```

**Handling:**
- Driver Service ignores unknown fields
- Backward compatible automatically

---

## Testing the Contract

### Unit Test (Vendure Plugin)

```typescript
describe('SellerOrderReadyDispatchTransformer', () => {
  it('should produce valid v1 payload', () => {
    const event = new SellerOrderReadyForDispatchEvent(
      ctx,
      mockOrder,
      mockPickup,
      mockDrop
    );

    const result = transformer.transform(event);
    const payload = JSON.parse(result.body);

    expect(payload.version).toBe('v1');
    expect(payload.event).toBe('SELLER_ORDER_READY_FOR_DISPATCH_V1');
    expect(payload.sellerOrderId).toBe(mockOrder.id);
    expect(payload.pickup.lat).toBeGreaterThan(-180);
    expect(payload.pickup.lon).toBeGreaterThan(-180);
  });
});
```

### Integration Test (Driver Service)

```typescript
describe('POST /events/seller-order-ready', () => {
  it('should accept valid v1 payload', async () => {
    const payload = {
      version: 'v1',
      event: 'SELLER_ORDER_READY_FOR_DISPATCH_V1',
      sellerOrderId: 'ORD-12345',
      // ...
    };

    const response = await request(app.getHttpServer())
      .post('/events/seller-order-ready')
      .set('x-webhook-secret', process.env.VENDURE_WEBHOOK_SECRET)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBeDefined();
  });

  it('should be idempotent on sellerOrderId', async () => {
    const payload = { sellerOrderId: 'ORD-12345', /* ... */ };

    const res1 = await request(app.getHttpServer())
      .post('/events/seller-order-ready')
      .send(payload);

    const res2 = await request(app.getHttpServer())
      .post('/events/seller-order-ready')
      .send(payload);

    expect(res1.body.assignedDriverId).toBe(res2.body.assignedDriverId);
  });

  it('should reject webhook without secret', async () => {
    const payload = { /* ... */ };

    const response = await request(app.getHttpServer())
      .post('/events/seller-order-ready')
      .send(payload);

    expect(response.status).toBe(401);
  });
});
```

### Contract Test (End-to-End)

```typescript
describe('Vendure ↔ Driver Service Contract', () => {
  it('should complete full order-to-delivery flow', async () => {
    // 1. Place order in Vendure
    const order = await vendureAPI.createOrder(cartItems);

    // 2. Transition to PaymentSettled
    await vendureAPI.settlePayment(order.id);

    // 3. Wait for webhook dispatch (may have retries)
    await waitFor(async () => {
      const delivery = await driverServiceDB.getDelivery({
        sellerOrderId: order.id
      });
      expect(delivery).toBeDefined();
    });

    // 4. Verify driver was assigned
    const delivery = await driverServiceDB.getDelivery({
      sellerOrderId: order.id
    });
    expect(delivery.assignedDriverId).toBeDefined();

    // 5. Simulate driver action (pickup)
    await driverServiceAPI.markPickedUp(delivery.id, proofUrl);

    // 6. Wait for webhook back to Vendure
    await waitFor(async () => {
      const orderData = await vendureAPI.getOrder(order.id);
      expect(orderData.customFields.lastDeliveryEvent)
        .toBe('DELIVERY_PICKED_UP_V1');
    });
  });
});
```

---

## Deployment Checklist

### Before Going Live

- [ ] Webhook secrets configured in both systems
- [ ] SSL certificates valid (HTTPS required for production)
- [ ] Retry logic tested (simulate network failures)
- [ ] Idempotency verified (send same webhook twice, same result)
- [ ] Load testing completed (concurrent deliveries)
- [ ] Monitoring alerts configured (webhook failures, latency)
- [ ] Runbooks written (failure scenarios, manual recovery)
- [ ] Team trained on troubleshooting

### Monitoring Alerts

```yaml
alerts:
  - name: "High webhook failure rate"
    condition: "webhookFailures / webhookAttempts > 0.05"
    action: "Page on-call engineer"

  - name: "Driver assignment latency"
    condition: "p95(assignmentLatency) > 1000ms"
    action: "Create incident, investigate"

  - name: "No drivers available for >30min"
    condition: "failedAssignments > threshold for duration"
    action: "Notify operations team"
```

---

## Summary

This contract provides:

✅ **Versioned payloads** (safe evolution)  
✅ **Idempotent operations** (safe retries)  
✅ **Fire-and-forget semantics** (no blocking)  
✅ **Clear error handling** (expected failures)  
✅ **Testable interface** (contract tests)  
✅ **Observable flows** (logging & tracing)  

Both systems can:
- Deploy independently
- Upgrade independently
- Fail independently
- Scale independently

This is a **production-grade integration contract**.

---

## References

- Webhook Best Practices: https://zapier.com/engineering/webhook-best-practices/
- Idempotency in APIs: https://stripe.com/blog/idempotency
- Event Versioning: https://martinfowler.com/articles/schema-versioning.html
