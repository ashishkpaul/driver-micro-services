Perfect. Now that the driver interaction contract is defined (via ADR-013), the next logical step is to define the **operational promises and measurements** that will govern the delivery experience. This moves the platform from a basic "it gets delivered" model to a managed "it gets delivered **within expectations**" service.

Below is **ADR-014: SLA & ETA Framework**, which establishes the rules for delivery time promises, performance measurement, and accountability in a **v2-and-beyond** context, without altering the frozen v1 foundations.

---

# ADR-014: SLA & ETA Framework (v2)

## Status
**Proposed**

## Date
2026-01-23

## Context
The platform's v1 delivery system is functionally complete: it assigns drivers, records proof, and handles failures as facts. However, it operates without **time-based promises or performance benchmarks**. To evolve into a reliable, customer-centric marketplace, we must establish a framework for:

1.  **ETA (Estimated Time of Arrival)**: Providing customers and sellers with a reliable forecast for delivery completion.
2.  **SLA (Service Level Agreement)**: Defining the platform's commitment for delivery speed and the operational boundaries for success/failure.
3.  **Performance Measurement**: Creating objective metrics to evaluate driver and system performance.

This framework must be built **on top of the v1 event architecture**, must not break existing contracts, and must separate the **calculation of promises** from their **commercial enforcement**.

## Decision

### Core Principle: Promises are Estimates, Not Guarantees
> **The system calculates and communicates ETAs as informed estimates. SLA adherence is measured and reported for operational and financial purposes, but does NOT automatically alter the v1 fulfillment flow (e.g., auto-cancel orders, auto-refund).**

All SLA/ETA logic is owned and enforced by the **Driver Microservice**. Vendure remains a consumer of new event types that **enrich** but do not replace existing v1 events.

---

### 1. ETA Calculation Model (v2)

ETAs are calculated at **two stages** and are **dynamic**, communicated via new, additive events.

| ETA Stage | Trigger | Calculation Inputs | Output Event |
| :--- | :--- | :--- | :--- |
| **Initial ETA** | `DELIVERY_ASSIGNED_V2` | 1. Straight-line distance (pickup→drop)<br>2. Static average speed profile (e.g., 20 km/h in city)<br>3. Fixed buffer for pickup (e.g., 10 mins) | `DELIVERY_ETA_CALCULATED_V2` |
| **Dynamic ETA** | Significant event (e.g., `PICKED_UP`, major traffic delay) | 1. Remaining distance<br>2. Real-time or historical traffic data (v2.1)<br>3. Driver's moving average speed | `DELIVERY_ETA_UPDATED_V2` |

**Example Event:**
```json
{
  "event": "DELIVERY_ETA_CALCULATED_V2",
  "version": 1,
  "sellerOrderId": "uuid",
  "etaType": "INITIAL",
  "estimatedCompletionAt": "2026-01-23T14:30:00.000Z",
  "calculatedAt": "2026-01-23T13:15:00.000Z",
  "basis": { "modelVersion": "v2-static", "estimatedDriveMinutes": 45 }
}
```

### 2. SLA Definition & Tiers (v2)
The SLA is a **time-bound promise** attached to the Seller Order. It is defined by a **tier**, which is determined at checkout based on seller configuration, customer selection, or platform rules.

| SLA Tier | Commitment (from assignment) | Financial Policy (v2) | Operational Goal |
| :--- | :--- | :--- | :--- |
| **STANDARD (Default)** | ≤ 90 minutes | No premium. Small penalty if missed. | Reliability |
| **EXPRESS** | ≤ 45 minutes | Customer pays premium. Higher penalty if missed. | Speed |
| **SCHEDULED** | By a specific clock time (e.g., "by 7 PM") | Possible scheduling fee. | Precision |

**SLA Attachment:** The chosen `slaTier` is added as a field to the `SELLER_ORDER_READY_FOR_DISPATCH_V2` event payload, allowing the Driver Service to accept or reject assignments based on capability (a v2.1 feature).

### 3. SLA Adherence & Measurement
Adherence is measured **after the fact**, as a metric, not a real-time gatekeeper.

*   **Success**: `deliveredAt` < `assignedAt + slaDuration`
*   **Breach**: `deliveredAt` > `assignedAt + slaDuration`

**Event upon completion:**
```json
{
  "event": "DELIVERY_SLA_RESOLVED_V2",
  "version": 1,
  "sellerOrderId": "uuid",
  "slaTier": "EXPRESS",
  "slaOutcome": "MET", // or "BREACHED"
  "slaDurationMinutes": 45,
  "actualDurationMinutes": 52,
  "breachReason": null // or "TRAFFIC", "DELAYED_PICKUP"
}
```

### 4. Integration with Existing Systems (Additive)

*   **Vendure**: Consumes the new `DELIVERY_ETA_*_V2` and `DELIVERY_SLA_RESOLVED_V2` events to populate `SellerOrder.customFields`. This enables:
    *   Customer communication via existing EmailEventHandler.
    *   SLA reporting in the Admin UI.
    *   **Crucially, Vendure still does NOT decide fulfillment state based on SLA.**
*   **Driver Microservice**: Becomes the SLA engine. It:
    1.  Calculates ETAs.
    2.  Monitors timeline adherence.
    3.  Emits the resolution event.
    4.  **Contains the penalty/fee logic internally** (e.g., adjusting driver payout, calculating platform credit).
*   **Driver PWA (ADR-013)**: Displays the ETA countdown and SLA tier to the driver, creating time-awareness.

### 5. Explicit v2 Non-Automation Rule
**SLA breaches do NOT trigger automated order cancellations or refunds in v2.**
Those remain **manual and discretionary** actions, possibly informed by an SLA breach report. This keeps the core fulfillment flow stable and prevents automated financial decisions in the first iteration of this framework.

## Consequences

### Positive
*   **Transparent Operations**: Customers and sellers gain predictable delivery windows.
*   **Measurable Quality**: The platform gains its first key performance indicator (KPI) for delivery quality.
*   **Clean Monetization Path**: Establishes the data model for express delivery premiums and breach penalties.
*   **Incremental Enablement**: Each component (ETA model, SLA tier, penalty logic) can be developed and rolled out independently.

### Trade-offs & Risks
*   **Increased Complexity**: The Driver Service evolves from a task distributor to a time-aware orchestration engine.
*   **Accuracy Challenge**: Poor ETA accuracy can damage trust more than no ETA. The initial static model will have variances.
*   **Driver Pressure**: Displaying countdowns may increase driver stress, requiring careful UI design.
*   **Data Dependency**: More advanced ETA models (v2.1) will require integration with traffic data providers.

## Compliance & Summary
This ADR is **fully additive and backward-compatible** with:
*   **ADR-009 (Lifecycle)**: Adds ETA events alongside `PICKED_UP`/`DELIVERED`.
*   **ADR-010 (Failure)**: SLA breach is a distinct concept from operational failure (`DELIVERY_FAILED`).
*   **ADR-012 (Non-Automation)**: Adherence is measured and reported, but does not trigger automatic fulfillment actions.

> **The SLA & ETA Framework elevates delivery from a recorded fact to a managed service. It introduces time as a first-class citizen in the delivery domain, enabling transparency, measurement, and future monetization, while intentionally keeping financial and fulfillment automation out of scope for v2.**

---
**Proposed Next ADR:** **ADR-015: Advanced Routing & Batching** would define how the dispatch algorithm evolves from "nearest driver" to optimizing for system efficiency, SLA adherence, and multi-order trips. This is the natural progression from defining promises (this ADR) to optimizing how they are fulfilled.