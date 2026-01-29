Perfect — this is exactly the right artifact to add to `/docs` and reference from `README.md`.

Below is a **clean, copy-pasteable Mermaid diagram** that matches **your GA architecture and actual runtime behavior** (no fantasy flows).

You can put this in:

* `docs/sequence-vendure-driver.mmd`
* or inline in `README.md` / `docs/ARCHITECTURE.md`

---

## 📐 Mermaid Sequence Diagram

### **Vendure → Driver Microservice (GA v1)**

```mermaid
sequenceDiagram
    autonumber

    participant C as Customer
    participant V as Vendure Core
    participant S as seller-store-info Plugin
    participant D as driver-integration Plugin
    participant M as Driver Microservice
    participant R as Redis
    participant P as PostgreSQL

    %% Order creation
    C ->> V: Place Order
    V ->> S: Validate seller + stock location
    S -->> V: Fulfillment metadata attached

    %% Order ready event
    V ->> D: SellerOrderReady event
    D ->> M: POST /events/seller-order-ready\n{sellerOrderId, pickupLat, pickupLon}

    %% Driver lookup
    M ->> R: GEOSEARCH drivers:geo\n(lat, lon, radius)
    alt Redis available
        R -->> M: [driverId, distance]
        M ->> R: ZREM drivers:geo driver:{id}
        M ->> R: HSET drivers:status BUSY
        M ->> R: DEL driver:online:{id}
    else Redis unavailable
        M ->> P: Query AVAILABLE drivers\nwith location
        M ->> M: In-memory distance calculation
    end

    %% Assignment persistence
    M ->> P: Create assignment record
    P -->> M: Assignment saved

    %% Notify Vendure
    M ->> D: Webhook delivery.assigned\n{sellerOrderId, driverId}
    D ->> V: Update order state to ASSIGNED

    %% Driver location updates
    Note over M,P: Driver location heartbeat (continuous)
    M ->> R: GEOADD drivers:geo\n(driver location)
    M ->> R: HSET drivers:status AVAILABLE
    M ->> R: SET driver:online:{id} TTL
    M ->> P: Update last_active_at
```

---

## 🔒 Guaranteed Invariants (Document These Near the Diagram)

You should **explicitly document these below the diagram**:

```text
Invariant 1:
Redis GEO set (drivers:geo) contains ONLY AVAILABLE drivers.

Invariant 2:
BUSY or OFFLINE drivers are removed immediately from GEO index.

Invariant 3:
PostgreSQL remains the source of truth.
Redis is a performance layer only.

Invariant 4:
Redis failure does NOT block driver assignment.
System falls back to PostgreSQL safely.
```

---

## 📄 Optional: Add a Failure Path Diagram (Highly Recommended)

If you want a **second diagram**, add this right below.

### ❌ No Driver Available Path

```mermaid
sequenceDiagram
    autonumber

    participant V as Vendure
    participant D as driver-integration
    participant M as Driver Microservice
    participant R as Redis
    participant P as PostgreSQL

    V ->> D: SellerOrderReady
    D ->> M: POST /events/seller-order-ready

    M ->> R: GEOSEARCH drivers:geo
    R -->> M: empty

    M ->> P: Query AVAILABLE drivers
    P -->> M: empty

    M -->> D: 200 OK\n{assigned: false}
    Note over V,D: Order remains READY\nNo mutation
```

---

## 📌 Where to Reference This

I recommend adding this to `README.md`:

```markdown
## Architecture & Flow

See the full Vendure → Driver Service sequence diagram:

📄 docs/sequence-vendure-driver.mmd
```

---

## ✅ Why This Diagram Is Correct

✔ Matches your **actual code paths**
✔ Respects **microservice boundaries**
✔ Reflects **Redis invariants you enforce in tests**
✔ Safe under failure
✔ Future-proof for v2 (driver acceptance, batching, retries)

---

If you want next:

* 📘 **ARCHITECTURE.md (formal doc)**
* 🧪 **Contract test spec (Vendure ↔ Driver)**
* 🚦 **Retry & idempotency diagram**
* 🔄 **v2 extension diagram (driver acceptance)**

Just say which one.
