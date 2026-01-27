Perfect — let’s lock this in properly. Below is a **clean, production-grade Redis availability design** tailored exactly to your **driver-micro-services** architecture, load profile (10k–100k drivers), and NestJS stack.

I’ll structure this as a **design document** you could almost drop into `/docs/redis-availability.md`.

---

# Redis Availability Layer – Design

## 1. Problem Statement

PostgreSQL is the **source of truth**, but it is **not suitable** for:

* real-time driver availability
* geo-spatial queries under load
* frequent location updates (seconds-level)

We need Redis to act as a **real-time availability engine**.

---

## 2. Design Goals

✔ O(1) reads for available drivers
✔ Geo-search (nearest drivers)
✔ Safe under crashes & restarts
✔ Works with PM2 cluster mode
✔ Eventual consistency with Postgres
✔ Simple, debuggable keys

---

## 3. What Goes Where

### Redis (volatile, fast)

* Driver availability
* Driver geo location
* Online heartbeat

### PostgreSQL (authoritative)

* Driver profile
* Vehicle info
* History & reporting

Redis is **derived state**, not authoritative.

---

## 4. Redis Key Model (Core)

### 4.1 Geo Index (PRIMARY)

```
Key: drivers:geo
Type: GEOSET (internally ZSET)
```

Stores **only AVAILABLE drivers**.

```redis
GEOADD drivers:geo <lon> <lat> driver:<driverId>
```

Example:

```redis
GEOADD drivers:geo 77.5946 12.9716 driver:9b2e…
```

Why:

* Native geo queries
* Extremely fast (log N)
* Memory efficient

---

### 4.2 Driver Status Map

```
Key: drivers:status
Type: HASH
```

```redis
HSET drivers:status <driverId> AVAILABLE
```

Values:

```
AVAILABLE | BUSY | OFFLINE
```

Why:

* Single lookup
* Useful for debugging
* Guards against stale geo entries

---

### 4.3 Driver Heartbeat (Liveness)

```
Key: driver:online:<driverId>
Type: STRING
TTL: 30–60 seconds
```

```redis
SET driver:online:<driverId> 1 EX 60
```

Why:

* Automatic cleanup
* No cron jobs
* Crash-safe

---

## 5. Write Paths (Critical)

### 5.1 Driver Location Update

Triggered by:

* `PATCH /drivers/:id/location`
* driver webhook event

#### Redis First (always)

```redis
GEOADD drivers:geo lon lat driver:<id>
HSET drivers:status <id> AVAILABLE
SET driver:online:<id> 1 EX 60
```

#### Then Postgres

* Update `drivers.current_lat`
* Update `drivers.current_lon`
* Update `last_active_at`

> Redis is the **hot path**, Postgres is durability.

---

### 5.2 Driver Goes BUSY

Triggered by:

* delivery assignment

```redis
ZREM drivers:geo driver:<id>
HSET drivers:status <id> BUSY
DEL driver:online:<id>
```

---

### 5.3 Driver Goes OFFLINE

Triggered by:

* explicit logout
* heartbeat TTL expiry

```redis
ZREM drivers:geo driver:<id>
HSET drivers:status <id> OFFLINE
DEL driver:online:<id>
```

TTL expiry alone is enough to hide drivers.

---

## 6. Read Path – Find Available Drivers

### API

```
GET /drivers/available?lat=12.9&lon=77.5&radius=5&limit=50
```

### Redis Query

```redis
GEOSEARCH drivers:geo
  FROMLONLAT 77.5 12.9
  BYRADIUS 5 km
  WITHDIST
  COUNT 50
```

Returns:

```
driver:uuid-1 0.8
driver:uuid-2 1.2
```

### Filter Step (in code)

For each driverId:

* `HGET drivers:status`
* `EXISTS driver:online:<id>`

Only return:

```
status === AVAILABLE && online === true
```

---

## 7. Consistency Model (Important)

This system is **eventually consistent**, by design.

### Failure Scenarios

| Scenario          | Result                             |
| ----------------- | ---------------------------------- |
| App crash         | TTL removes driver                 |
| Redis restart     | Drivers reappear on next heartbeat |
| Postgres lag      | No impact on availability          |
| Duplicate updates | Idempotent                         |

---

## 8. Memory Sizing (10k → 100k drivers)

### Rough estimate per driver

| Item        | Bytes          |
| ----------- | -------------- |
| GEO entry   | ~100           |
| Status hash | ~50            |
| TTL key     | ~60            |
| **Total**   | **~210 bytes** |

### Usage

| Drivers | Memory  |
| ------- | ------- |
| 10k     | ~2 MB   |
| 100k    | ~21 MB  |
| 1M      | ~210 MB |

👉 Redis 1–2 GB is more than enough.

---

## 9. Redis Config Recommendations

```conf
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

Persistence is optional but recommended.

---

## 10. NestJS Integration (Conceptual)

### RedisService responsibilities

* `updateLocation(driverId, lat, lon)`
* `markBusy(driverId)`
* `markOffline(driverId)`
* `findAvailable(lat, lon, radius, limit)`

No business logic in controllers.

---

## 11. PM2 / Cluster Safety

✔ Redis is shared
✔ No in-memory state
✔ Safe for `pm2 start --instances max`

**Important**: limit DB pool per instance.

---

## 12. Key Summary (One Page)

```text
drivers:geo               -> GEOSET (available drivers only)
drivers:status            -> HASH (driverId → status)
driver:online:{driverId}  -> STRING (TTL heartbeat)
```

That’s the entire availability system.

---

## 13. What NOT to Do (Common Mistakes)

❌ Store full driver JSON in Redis
❌ Use Redis as source of truth
❌ Use in-memory JS Maps
❌ Skip TTL heartbeats
❌ Geo queries from Postgres

---

## 14. Next Logical Steps (Optional)

If you want, next we can:

* implement **RedisService.ts**
* wire `/drivers/available` to Redis
* add **region-based sharding**
* add **priority scoring**
* design **failover fallback to Postgres**

Just tell me 👍
