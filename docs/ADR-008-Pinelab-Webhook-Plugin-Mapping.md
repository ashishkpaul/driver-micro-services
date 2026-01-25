Perfect — this is the **right next step**, and it’s a purely **configuration + contract mapping task**, not new business logic.

Below is a **precise, v1-strict mapping of ADR-008 payloads to the Pinelab Vendure Webhook Plugin**, written so you can **implement without guessing** and **never break prod**.

---

# ADR-008 → Pinelab Webhook Plugin Mapping

*(Vendure ↔ Driver Service)*

This answers **exactly**:

> “How do ADR-008 events map onto the Pinelab webhook plugin configuration?”

---

## 1️⃣ Why Pinelab Webhook Plugin Is the Correct Choice

The Pinelab plugin aligns with Vendure rules because it:

* Subscribes to **Vendure domain events**
* Emits **signed, versioned webhooks**
* Supports retries & observability
* Avoids ad-hoc HTTP calls inside services
* Keeps Vendure as **event producer**, not orchestrator

This is **strictly preferred** over:

* axios/fetch inside plugins ❌
* cron jobs ❌
* manual controllers ❌

---

## 2️⃣ ADR-008 Event Inventory (LOCKED)

From ADR-008, we have **two directions**:

### Vendure → Driver Service (Outbound)

| Event                                | Purpose                     |
| ------------------------------------ | --------------------------- |
| `SELLER_ORDER_READY_FOR_DISPATCH_V1` | SellerOrder is paid & ready |

### Driver Service → Vendure (Inbound)

| Event                   | Purpose           |
| ----------------------- | ----------------- |
| `DELIVERY_ASSIGNED_V1`  | Driver assigned   |
| `DELIVERY_PICKED_UP_V1` | Proof of pickup   |
| `DELIVERY_DELIVERED_V1` | Proof of delivery |

This step covers **Vendure → Driver Service**.

---

## 3️⃣ Source Vendure Event (Internal)

### Vendure Core Event

```ts
OrderStateTransitionEvent
```

Filtered by:

```ts
event.order.type === OrderType.Seller
event.toState === 'PaymentSettled'
```

This is **canonical** and matches:

* Vendure multivendor example
* SellerOrder lifecycle
* v1 dispatch timing

---

## 4️⃣ ADR-008 Payload (Canonical JSON)

This payload is **locked** and **versioned**.

```json
{
  "event": "SELLER_ORDER_READY_FOR_DISPATCH_V1",
  "version": 1,
  "timestamp": "2026-01-22T10:45:00.000Z",
  "sellerOrderId": "uuid",
  "channelId": "uuid",
  "pickup": {
    "stockLocationId": "uuid",
    "lat": 12.9716,
    "lon": 77.5946
  },
  "drop": {
    "lat": 12.9352,
    "lon": 77.6245
  }
}
```

**Rules (ADR-008 enforced):**

* No optional fields
* No nested business logic
* No SLA, ETA, or pricing
* Stable field names forever

---

## 5️⃣ Pinelab Webhook Plugin – Conceptual Wiring

### Flow

```
OrderStateTransitionEvent
        ↓
Vendure EventBus
        ↓
Pinelab Webhook Plugin
        ↓
POST https://driver-service/events/seller-order-ready
```

Vendure **does not** know or care if the Driver Service is up.

---

## 6️⃣ Pinelab Webhook Plugin Configuration (Vendure)

### Plugin Registration

```ts
import { WebhookPlugin } from '@pinelab/vendure-plugin-webhook';

WebhookPlugin.init({
  endpoint: process.env.DRIVER_SERVICE_WEBHOOK_URL!,
  secret: process.env.DRIVER_SERVICE_WEBHOOK_SECRET!,
  events: [
    {
      event: 'OrderStateTransitionEvent',
      filter: ({ event }) =>
        event.order.type === 'Seller' &&
        event.toState === 'PaymentSettled',
      transformer: ({ event }) => ({
        event: 'SELLER_ORDER_READY_FOR_DISPATCH_V1',
        version: 1,
        timestamp: new Date().toISOString(),
        sellerOrderId: event.order.id,
        channelId: event.ctx.channelId,
        pickup: {
          stockLocationId: event.order.customFields.stockLocationId,
          lat: event.order.customFields.stockLocationLat,
          lon: event.order.customFields.stockLocationLon,
        },
        drop: {
          lat: event.order.customFields.customerLat,
          lon: event.order.customFields.customerLon,
        },
      }),
    },
  ],
});
```

### Why this is correct

* Uses **Vendure EventBus**
* No HTTP calls in domain services
* Payload is **explicitly transformed**
* Versioned (`_V1`)
* Signed via plugin secret

---

## 7️⃣ Required SellerOrder Custom Fields (Vendure)

These **must already exist** (flat, not JSON):

```ts
customFields: {
  SellerOrder: [
    { name: 'stockLocationId', type: 'string' },
    { name: 'stockLocationLat', type: 'float' },
    { name: 'stockLocationLon', type: 'float' },
    { name: 'customerLat', type: 'float' },
    { name: 'customerLon', type: 'float' },
  ],
}
```

This **reuses your SellerStoreInfoPlugin**:

* pickup comes from `StockLocation`
* drop comes from customer geo cache

No duplication.

---

## 8️⃣ Driver Service Endpoint Contract

Pinelab will POST to:

```
POST /events/seller-order-ready
```

Driver Service must accept:

```ts
{
  event: 'SELLER_ORDER_READY_FOR_DISPATCH_V1';
  version: 1;
  sellerOrderId: string;
  channelId: string;
  pickup: { lat: number; lon: number };
  drop: { lat: number; lon: number };
}
```

Nothing else.

---

## 9️⃣ Failure Semantics (v1-Correct)

| Scenario               | Behavior                  |
| ---------------------- | ------------------------- |
| Driver service down    | Webhook retries (Pinelab) |
| Driver service rejects | Logged, retried           |
| Vendure unaffected     | ✅ Always                  |

Checkout, catalog, search are **never blocked**.

---

## 🔒 What Is Explicitly NOT Done Here

* ❌ No inbound webhooks yet
* ❌ No delivery lifecycle handling
* ❌ No retries coded manually
* ❌ No email notifications
* ❌ No ETA/SLA logic

All of that comes **after** this mapping.

---

## ✅ Outcome

After this step you have:

✔ ADR-008 payloads locked
✔ Vendure emits dispatch events correctly
✔ Driver Service decoupled
✔ Production-safe retries
✔ No rule violations

---

## ➡️ Next (Choose One, Cleanly)

1. **Map inbound events (`DELIVERY_ASSIGNED_V1`, etc.) → Pinelab inbound webhook**
2. Add **EmailEventHandler** for seller/customer notifications
3. Implement **signature verification** on Driver Service
4. Produce **ADR-010: Delivery Failure & Reassignment**

Tell me the number — we proceed precisely.
