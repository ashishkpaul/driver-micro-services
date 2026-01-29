Below is a **GA-grade SRE Runbook** for your **Driver Management & Delivery Orchestration Microservice**.

This is written the way SREs actually expect it:

* **Actionable**
* **Incident-driven**
* **Clear ownership boundaries**
* **Zero theory fluff**

You can place this as:

```
docs/SRE-RUNBOOK.md
```

or keep it alongside `ARCHITECTURE.md`.

---

# 🛠️ SRE RUNBOOK

**Driver Management & Delivery Orchestration Microservice**
**Version:** v1.0.0 (GA)
**Service Port:** 3001

---

## 1. Service Overview

### Purpose

This service:

* Manages delivery drivers
* Tracks real-time availability and location
* Assigns the nearest available driver to deliveries
* Integrates with Vendure via webhooks

### Critical Dependencies

| Dependency | Role                      | Criticality          |
| ---------- | ------------------------- | -------------------- |
| PostgreSQL | Source of truth           | **Hard dependency**  |
| Redis      | Availability + GEO search | **Soft dependency**  |
| PM2        | Process manager           | **Required in prod** |

---

## 2. Service-Level Objectives (SLOs)

| Metric                     | Target                      |
| -------------------------- | --------------------------- |
| API Availability           | ≥ 99.9%                     |
| Assignment Latency (p95)   | < 200 ms                    |
| Redis Degradation Recovery | < 5 min                     |
| Data Consistency           | 100% (no stale assignments) |

---

## 3. Health Checks

### Endpoint

```
GET /health
```

### Expected Healthy Response

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

### Interpretation

| Status           | Meaning       | Action           |
| ---------------- | ------------- | ---------------- |
| `ok`             | Fully healthy | None             |
| `database: down` | Hard outage   | Page immediately |
| `redis: down`    | Degraded mode | Monitor, no page |

---

## 4. Startup & Shutdown

### Start (Production)

```bash
npm run build
pm2 start ecosystem.config.cjs
```

### Stop (Graceful)

```bash
pm2 stop driver-service
```

### Signals

* **SIGTERM supported**
* Service stops accepting traffic
* In-flight requests finish
* Redis + DB connections closed cleanly

---

## 5. PM2 Operations

### Check Status

```bash
pm2 list
```

### View Logs

```bash
pm2 logs driver-service
```

### Restart Cluster

```bash
pm2 restart driver-service
```

### Expected Configuration

* `exec_mode: cluster`
* `instances: max`
* `kill_timeout: 5000ms`
* `max_memory_restart: 512MB`

⚠️ **Never run in fork mode in production**

---

## 6. Redis Failure Handling

### Expected Behavior

If Redis is unavailable:

* Service **continues operating**
* Driver lookup falls back to PostgreSQL
* Latency increases, correctness preserved

### Verify Redis Status

```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
```

### Redis Restart (Safe)

```bash
docker restart redis
# or
systemctl restart redis
```

### No Data Loss Risk

Redis is:

* Rebuildable
* Non-authoritative
* Safe to flush if required

---

## 7. PostgreSQL Failure Handling

### Symptoms

* `/health` reports database down
* API returns 500s
* Assignments fail

### Immediate Actions

1. **Page on-call**
2. Verify DB connectivity:

   ```bash
   pg_isready -h $DB_HOST -p $DB_PORT
   ```
3. Check DB logs
4. Restore connectivity or failover

⚠️ **Do NOT restart app repeatedly** if DB is down

---

## 8. Assignment Failures

### Common Causes

| Cause                  | Detection            |
| ---------------------- | -------------------- |
| No available drivers   | Empty GEO result     |
| Redis stale data       | Caught by invariants |
| DB transaction failure | Error logs           |

### Debug Steps

```bash
# Check drivers
curl http://localhost:3001/drivers

# Check available drivers
curl "http://localhost:3001/drivers/available?lat=12.9&lon=77.6&radiusKm=5"
```

### Safe Recovery

* Redis invariant enforcement prevents bad assignments
* No manual cleanup usually required

---

## 9. Webhook Failures (Vendure)

### Incoming Webhooks

* `POST /events/seller-order-ready`

### Idempotency Guarantee

* Duplicate events **do not create duplicate deliveries**
* Based on `sellerOrderId`

### Retry Behavior

Vendure may retry — safe by design.

### Debug

```bash
grep sellerOrderId logs/out.log
```

---

## 10. Logs

### Locations

| Type     | File             |
| -------- | ---------------- |
| Combined | `logs/out.log`   |
| Errors   | `logs/error.log` |

### What to Look For

* Redis connection warnings (degraded mode)
* Assignment failures
* Migration or schema errors

---

## 11. Database Migrations

### Run (One-Time)

```bash
npm run migration:run
```

### Rules

* Never run migrations automatically on startup
* Always run **before** scaling pods / processes
* Verify schema after migration:

  ```sql
  \d drivers;
  ```

---

## 12. Known Failure Modes

| Scenario          | Impact             | Handling           |
| ----------------- | ------------------ | ------------------ |
| Redis down        | Slower assignments | Automatic fallback |
| Redis stale GEO   | Empty results      | Invariant cleanup  |
| DB down           | Hard outage        | Page               |
| PM2 worker crash  | None               | Auto-restart       |
| Duplicate webhook | None               | Idempotent         |

---

## 13. Safe Manual Actions

✅ Restart Redis
✅ Restart PM2 workers
✅ Flush Redis keys
✅ Scale PM2 instances

❌ Manually edit DB rows
❌ Force assignments
❌ Disable health checks

---

## 14. Escalation Policy

| Severity | Condition                 | Action           |
| -------- | ------------------------- | ---------------- |
| SEV-1    | DB unavailable            | Page immediately |
| SEV-2    | Redis unavailable >10 min | Investigate      |
| SEV-3    | Increased latency         | Monitor          |

---

## 15. Operational Principles

* **Correctness > Speed**
* **Fail safe, not fail silent**
* **PostgreSQL decides**
* **Redis accelerates**
* **Every invariant is test-protected**

---

## 16. References

* `ARCHITECTURE.md`
* `INSTALLATION-CONFIGURATION.md`
* ADR-002 … ADR-010
* `ecosystem.config.cjs`

---

If you want next, I can:

* Convert this into a **pager-ready checklist**
* Add **Grafana-style alert thresholds**
* Produce a **Chaos test playbook**
* Align this with **Kubernetes readiness/liveness probes**

This runbook is already **on-call ready**.
