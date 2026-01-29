# Quick Reference: How to Use These ADRs

**Created:** January 28, 2026  
**For:** Marketplace Delivery Platform (Vendure + Driver Service)  
**Total Reading Time:** ~80 minutes  
**Implementation Time:** ~10-15 hours

---

## The 4 ADRs You Now Have

### For Context/History (Read First)

**ADR-005: Delivery Logistics System Separation**
- **Purpose:** Why delivery is a separate system from Vendure
- **Audience:** Everyone
- **Length:** 3,000 words
- **Key Takeaway:** Vendure = commerce, Driver Service = logistics, never mix them

**Start here if:** You're new to the project

---

### For Implementation (Core Documentation)

**ADR-021: Vendure Plugin Architecture & Design Patterns**
- **Purpose:** How to build Vendure plugins correctly
- **Audience:** Vendure developers, architects
- **Length:** 5,000 words
- **Key Takeaway:** Thin plugins, thick services, event-driven coupling
- **Covers:** seller-store-info, driver-integration, webhook, elasticsearch plugins

**Read this if:** You're working on Vendure plugin code

---

**ADR-022: Driver Microservice Architecture**
- **Purpose:** How the Driver Service is designed and operates
- **Audience:** Backend engineers, DevOps, SRE
- **Length:** 6,500 words
- **Key Takeaway:** Stateless NestJS service, PostgreSQL truth, Redis performance
- **Covers:** Modules, database, Redis, PM2, Docker, health checks

**Read this if:** You're working on driver service code or operations

---

**ADR-023: Vendure ↔ Driver Service Integration Contract**
- **Purpose:** How the two systems communicate
- **Audience:** Integration engineers, QA, DevOps
- **Length:** 4,000 words
- **Key Takeaway:** Versioned webhooks, idempotent operations, fire-and-forget
- **Covers:** Payload schemas, error handling, retries, testing

**Read this if:** You're testing integration or troubleshooting issues

---

## Decision Tree: Which ADR to Read?

```
Am I new to the project?
  YES → Read ADR-005 (why separation)
        Then pick path below
  NO → Skip to your role

Am I working on Vendure plugins?
  YES → ADR-021 (plugin architecture)

Am I working on driver service backend?
  YES → ADR-022 (microservice design)

Am I working on integration/webhooks?
  YES → ADR-023 (integration contract)

Am I responsible for operations?
  YES → ADR-022 (deployment section)
        + ADR-023 (monitoring section)

Am I writing tests?
  YES → ADR-023 (contract testing)
        + ADR-022 (unit/integration tests)

Am I code reviewing?
  YES → All 3 (ADR-021, 022, 023)
```

---

## How The ADRs Relate

```
ADR-005: Delivery System Separation
    ↓
    ├─→ ADR-021: How Vendure Plugins Work
    │     └─→ Covers: seller-store-info, driver-integration, webhook, es9
    │
    ├─→ ADR-022: How Driver Microservice Works
    │     └─→ Covers: NestJS structure, PostgreSQL, Redis, deployment
    │
    └─→ ADR-023: How They Communicate
          └─→ Covers: Webhook payloads, retries, idempotency, testing
```

---

## Each ADR's Key Sections

### ADR-021 (Vendure Plugins)

```
1. Design Principles
   → Thin plugins, smart services
   → Event bus for decoupling
   → Service layer isolation

2. Plugin Responsibilities & Boundaries
   → seller-store-info (what it owns/doesn't own)
   → driver-integration (what it owns/doesn't own)
   → webhook plugin
   → elasticsearch plugin

3. Cross-Plugin Integration Patterns
   → Event-based coupling
   → Service accessor pattern
   → Custom fields

4. Implementation Patterns
   → OnApplicationBootstrap
   → OnModuleInit with event subscription
   → GraphQL resolvers with permission guards
   → RequestTransformer for webhook serialization

5. Database Layer Patterns
   → Custom fields (simple extensions)
   → Custom entities (complex data)

6. Testing & Performance & Error Handling & Security
```

**Reference this when:** Writing a Vendure plugin or reviewing plugin code

---

### ADR-022 (Driver Microservice)

```
1. Architecture Overview
   → Module organization diagram

2. Module Organization
   → Health Module (/health endpoint)
   → Driver Module (CRUD)
   → Assignment Module (algorithm)
   → Delivery Module (state machine)
   → Events Module (webhooks)
   → Config Module (environment variables)

3. Data Layer
   → PostgreSQL tables & indexes
   → Redis keys & structures
   → The critical invariant: drivers:geo contains ONLY AVAILABLE

4. Request/Response Patterns
   → POST /drivers (register)
   → PATCH /drivers/{id}/location (update)
   → POST /deliveries (create with assignment)

5. PM2 Cluster Configuration
6. Docker & Deployment
7. Graceful Shutdown
8. Testing Strategy
9. Observability & Monitoring

```

**Reference this when:** Writing driver service code or deploying

---

### ADR-023 (Integration Contract)

```
1. Integration Flows
   → Order → Delivery flow (visual)
   → Status updates flow (visual)

2. Webhook Payloads (All Versioned)
   → SELLER_ORDER_READY_FOR_DISPATCH_V1
   → DELIVERY_ASSIGNED_V1
   → DELIVERY_PICKED_UP_V1
   → DELIVERY_DELIVERED_V1
   → DELIVERY_FAILED_V1

3. Headers & Authentication
   → Secret validation (webhook secret)

4. Error Handling & Resilience
   → HTTP status codes
   → Retry strategy
   → Idempotency enforcement

5. Versioning Strategy
   → How to add v2 without breaking v1

6. Testing the Contract
   → Unit tests (payload validation)
   → Integration tests (end-to-end)
   → Contract tests (payload schemas)

7. Deployment Checklist
   → Pre-flight checks
   → Monitoring alerts
```

**Reference this when:** Testing integration or writing webhook handlers

---

## Real-World Scenarios

### Scenario 1: "Adding a new field to the webhook payload"

**Steps:**
1. Read ADR-023 section "Versioning Strategy"
2. Decide: Is it required? → New major version
3. Create new payload version (v2)
4. Update RequestTransformer in driver-integration plugin (ADR-021)
5. Update Driver Service webhook handler (ADR-022)
6. Write contract tests (ADR-023)
7. Deploy Driver Service first, then Vendure

---

### Scenario 2: "Driver service crashed, how do I recover?"

**Steps:**
1. Check ADR-022 section "Graceful Shutdown"
2. Check ADR-022 section "Health Checks"
3. Verify:
   - PostgreSQL is running (`curl /health`)
   - Redis is running (`curl /health`)
4. Check logs: `pm2 logs driver-service`
5. Restart: `pm2 restart driver-service`
6. Verify assignments still work (idempotent on sellerOrderId)

---

### Scenario 3: "Assignment failed, debugging"

**Steps:**
1. Check error in driver service logs
2. Read ADR-022 section "Assignment Algorithm"
   - Is Redis down? → Uses PostgreSQL fallback
   - Are there no drivers? → Expected behavior (success: false)
3. Check Redis GEO set: `redis-cli ZCARD drivers:geo`
4. Check AVAILABLE drivers in DB:
   ```sql
   SELECT COUNT(*) FROM drivers WHERE status = 'AVAILABLE';
   ```
5. If counts don't match → Redis invariant violated
6. Read ADR-022 section "Redis Availability Model"

---

### Scenario 4: "Webhook payload validation failed"

**Steps:**
1. Check ADR-023 section "SELLER_ORDER_READY_FOR_DISPATCH_V1"
2. Compare actual payload to schema in ADR-023
3. Check ADR-023 section "Headers & Authentication"
   - Is webhook secret correct?
4. Check ADR-023 section "Error Handling"
   - HTTP 400 = bad payload (don't retry)
   - HTTP 401 = bad secret (don't retry)
   - HTTP 500 = server error (retry)

---

### Scenario 5: "I need to modify the seller-store-info plugin"

**Steps:**
1. Read ADR-021 section "seller-store-info Plugin"
2. Understand: What does it own? (stock location geo, distance calc)
3. Read ADR-021 section "Implementation Patterns"
4. Modify service layer (not plugin level)
5. Read ADR-021 section "Testing Patterns"
6. Write tests for your changes
7. Verify integration with Elasticsearch (ADR-021 → service accessor pattern)

---

## Common Questions Answered

**Q: Can I call the driver service directly from a Vendure resolver?**  
A: No. Use event bus instead. See ADR-021 "Event-Based Coupling"

**Q: What if a webhook is sent twice?**  
A: Safe by design. See ADR-023 "Idempotency Key" (sellerOrderId unique constraint)

**Q: What if Redis goes down?**  
A: Driver service continues with PostgreSQL. See ADR-022 "Redis Degradation"

**Q: How do I add a new Vendure plugin?**  
A: Follow patterns in ADR-021 "Implementation Patterns"

**Q: How do I scale the driver service?**  
A: Use PM2 cluster mode. See ADR-022 "PM2 Cluster Configuration"

**Q: What happens if driver service is down during order placement?**  
A: Order completes successfully. Delivery assigned later. See ADR-005 "Fire-and-Forget"

**Q: How is assignment deterministic (no race conditions)?**  
A: PostgreSQL unique constraint + Redis removal atomic. See ADR-022 "Assignment Algorithm"

---

## Checklist: Getting Started with ADRs

- [ ] Read ADR-005 (30 min) — understand why separation exists
- [ ] Pick your role:
  - [ ] Vendure developer → ADR-021 (45 min)
  - [ ] Backend/DevOps → ADR-022 (60 min)
  - [ ] Integration/QA → ADR-023 (45 min)
  - [ ] Everyone → All three (2 hours)
- [ ] Bookmark your main ADR
- [ ] Save this quick reference guide
- [ ] Join team sync to discuss (30 min)
- [ ] Ask questions on Slack/Discord
- [ ] Reference ADRs in code reviews

---

## Navigation Tips

**Finding stuff in ADRs:**

Each ADR has a **Table of Contents** at the top. Use it to jump to sections.

Example searches:
- "How do I test this?" → Search ADR for "Testing" section
- "What's the database schema?" → ADR-022 "Data Layer Patterns"
- "What's the webhook payload?" → ADR-023 "Webhook Payloads"
- "How does assignment work?" → ADR-022 "Assignment Module"
- "What are my plugin responsibilities?" → ADR-021 "Plugin Responsibilities & Boundaries"

---

## Version History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-01-28 | ADR-005, ADR-021, ADR-022, ADR-023 created | GA v1.0 |

---

## Getting Help

**If you're confused about...**

| Topic | ADR | Section |
|-------|-----|---------|
| Architecture rationale | ADR-005 | Context |
| Vendure plugin code | ADR-021 | Plugin Responsibilities |
| Driver service code | ADR-022 | Module Organization |
| How systems communicate | ADR-023 | Integration Flows |
| Deployment | ADR-022 | Docker & Deployment |
| Testing | ADR-021 or ADR-022 | Testing Patterns |
| Troubleshooting | ADR-022 | Error Handling |
| Webhooks | ADR-023 | Webhook Payloads |

---

## Summary

You have **4 complete ADRs** that document:

✅ Why the system is designed this way (ADR-005)  
✅ How Vendure plugins work (ADR-021)  
✅ How the driver microservice works (ADR-022)  
✅ How they communicate (ADR-023)  

**Total reading time:** ~80 minutes  
**Payoff:** Complete architectural understanding  

**Next step:** Pick your ADR(s) and start reading!

---

*Last updated: January 28, 2026*
