# Driver Microservice Logging Architecture Rules

## Purpose

Ensure logs remain:

- Readable
- Operationally useful
- Noise-free
- Consistent
- Safe for production debugging

These rules apply to **all future code changes**.

---

## Rule 1 — One Event = One Log

### Never do

```ts
logger.log("Worker started");

console.log(`
⚙ WORKER
Worker started
`);
```

This creates:

- Duplicate information
- Log fatigue
- Confusing searches

### Always do

Either structured console log:

```ts
ConsoleUILogger.worker("Outbox Worker","RUNNING");
```

OR machine JSON log.

**Never both.**

---

## Rule 2 — Framework logs must stay hidden

Never allow INFO level logs from:

- `InstanceLoader`
- `RouterExplorer`
- `RoutesResolver`
- `NestApplication`

These are framework noise.

### Rule

- Framework logs: **DEBUG only**
- Business logs: **INFO**

---

## Rule 3 — Boot logs must stay structured

Boot logs must always follow:

### Required boot structure

```text
SERVICE HEADER

INFRASTRUCTURE
WORKERS
API
OBSERVABILITY

SYSTEM WARNINGS (optional)

SYSTEM READY
```

Never insert random logs between sections.

---

## Rule 4 — No random console.log allowed

This is critical.

Never allow:

```ts
console.log("debugging something");
console.log("test");
console.log("here");
```

Allowed only through approved logging utilities:

- `console-ui.logger.ts`
- `advanced.logger.ts`
- `elite.logger.ts`
- `boot-phase.logger.ts`

### Team rule

If someone adds raw `console.log`, it must be removed in review.

---

## Rule 5 — Logs must answer operational questions

Every log must answer one of:

- Is system healthy?
- Did state change?
- Did something fail?
- Is performance degraded?
- Did something start?

If not: **Do not log it.**

---

## Rule 6 — Never log internal implementation steps

Avoid:

```ts
logger.log("Entered function");
logger.log("Processing loop");
logger.log("Value is X");
```

These are debugging logs. They belong in **DEBUG level only**.

---

## Rule 7 — Use correct severity levels

### Correct mapping

**INFO**: Service state changes

```text
Worker started
Service ready
Feature enabled
```

**WARN**: Degraded but functional

```text
Push disabled
Cache miss
Retry triggered
```

**ERROR**: Failures

```text
DB connection failed
Worker crashed
Event publish failed
```

**DEBUG**: Developer info only.

---

## Rule 8 — No business logic inside logging

Never:

```ts
if(error){
  logger.warn();
  retry();
}
```

Logging must never change behavior. Logging must be **side effect only**.

---

## Rule 9 — Group related logs

Never:

```ts
logger.warn("Push disabled");
logger.warn("Firebase missing");
logger.warn("Notifications off");
```

Instead:

```text
⚠ SYSTEM WARNINGS
Push disabled
Firebase missing
Notifications off
```

Group related issues.

---

## Rule 10 — Protect log readability

Avoid long JSON dumps:

```ts
logger.log(JSON.stringify(bigObject));
```

Instead, log only useful fields:

```ts
logger.log({
  driverId,
  deliveryId,
  status
});
```

Never dump entire objects.

---

## Rule 11 — Never log secrets

Absolutely forbidden:

- Passwords
- JWT tokens
- API keys
- Private keys
- Access tokens
- Session cookies

If logging requests, mask:

```ts
token: "***"
```

---

## Rule 12 — Request logs must stay compact

Request logs must stay single line:

```text
POST /drivers/location 200 42ms trace:abcd1234
```

Never expand unless failure.

---

## Rule 13 — Failures must be loud

Errors must always show:

- What failed
- Where
- Trace id
- Duration

Example:

```text
REQUEST FAILED
POST /offers/accept
trace:abc123
Error: Driver not found
```

Never silent failures.

---

## Rule 14 — Boot must always end with SYSTEM READY

Every boot must end with:

```text
SYSTEM READY
```

If not: System is considered unhealthy. This is important for operators.

---

## Rule 15 — Never remove observability logs without replacement

If removing:

```ts
logger.log("Worker started");
```

You must replace with structured equivalent.

Never reduce visibility.

---

## Rule 16 — Logging utilities are infrastructure

Treat these files as **core infra**:

- `console-ui.logger.ts`
- `advanced.logger.ts`
- `boot-phase.logger.ts`
- `system-readiness.service.ts`

Changes require careful review.

---

## Rule 17 — Logging changes must follow "No Behavior Change" rule

Every logging PR must guarantee:

- No service logic changes
- No execution order changes
- No retries changed
- No error handling changed

Logging must remain **passive**.

---

## Rule 18 — No logging inside hot paths unless needed

Avoid logging inside:

- Dispatch scoring loops
- Location updates
- Event loops
- High frequency flows

Unless: Error or Performance issue

Logging in hot paths kills performance.

---

## Rule 19 — Performance logs must be meaningful

Allowed:

```text
DB query 12ms
Dispatch scoring 18ms
Request 42ms
```

Not allowed:

```text
Timer started
Timer ended
```

---

## Rule 20 — Future improvements must follow this priority

If improving logs later, priority order:

1. Remove noise
2. Improve clarity
3. Improve grouping
4. Improve performance signals
5. Improve failure signals

Never add logs before removing noise.

---

## Approved Logging Utilities

### Primary (actively used)

- `boot-phase.logger.ts`
- `system-readiness.service.ts`
- Winston logger config

### Secondary (available, optional)

- `console-ui.logger.ts`
- `advanced.logger.ts`
- `elite.logger.ts`
- `boot-reporter.ts`
- `system-summary.ts`

---

## No Duplicate Log Events

Never:

```ts
// Legacy log
logger.warn("Firebase not configured...");

// + Structured log
console.log('┌─ ⚠ PUSH SERVICE...');
```

This creates duplicate information. Keep only one.

---

## PR Logging Checklist

```markdown
## LOGGING CHECKLIST

- [ ] No duplicate event logs
- [ ] No framework noise added
- [ ] No raw console.log
- [ ] Correct severity used
- [ ] No secrets logged
- [ ] No behavior changes
- [ ] Uses approved logging utilities
```

---

## Final Maturity Model

| Level | Description |
|-------|-------------|
| 3 | Basic logs |
| 5 | Structured logs |
| 7 | Production readable |
| 9 | Operational UX |
| 10 | Observability aware |

**Current target: Level 9–10**

Beyond this: Only centralized observability improves things.

---

## Final Rule

**"Logs are a product."**

Not debugging leftovers.

If you treat logs like UI: They stay clean.
If you treat logs like debugging: They decay.
