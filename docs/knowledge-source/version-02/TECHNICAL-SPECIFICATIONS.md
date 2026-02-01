# V2 Technical Specifications: Detailed Implementation Guide

**Date:** February 1, 2026  
**Status:** Technical Design Phase  
**Scope:** Detailed technical specifications for ADR-024 through ADR-031

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Schema Specifications](#database-schema-specifications)
3. [API Endpoints](#api-endpoints)
4. [WebSocket Events](#websocket-events)
5. [Service Implementations](#service-implementations)
6. [Data Models](#data-models)
7. [Integration Patterns](#integration-patterns)
8. [Error Handling](#error-handling)
9. [Testing Specifications](#testing-specifications)
10. [Performance Considerations](#performance-considerations)

---

## System Architecture

### Microservice Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Driver Service                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Driver API    │  │  Assignment API │  │   Delivery API  │  │
│  │                 │  │                 │  │                 │  │
│  │ • Create Driver │  │ • Assign Driver │  │ • Create Delivery│  │
│  │ • Update Status │  │ • Reassign      │  │ • Update Status │  │
│  │ • Get Location  │  │ • Get Assignment│  │ • Get ETA       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Offer Service │  │  Availability   │  │   Escalation    │  │
│  │                 │  │   Service       │  │   Service       │  │
│  │ • Create Offer  │  │ • Update State  │  │ • Monitor Orders│  │
│  │ • Accept Offer  │  │ • Break Management││ • Auto-Reassign │  │
│  │ • Reject Offer  │  │ • State Tracking│  │ • Escalate      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Audit Service │  │   ETA Service   │  │  Zone Service   │  │
│  │                 │  │                 │  │                 │  │
│  │ • Log Events    │  │ • Calculate ETA │  │ • Zone Health   │  │
│  │ • Query Logs    │  │ • Track Location│  │ • Smart Assign  │  │
│  │ • Compliance    │  │ • Live Updates  │  │ • Balance Load  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Analytics      │  │  Notification   │  │   WebSocket     │  │
│  │  Service        │  │  Service        │  │   Gateway       │  │
│  │                 │  │                 │  │                 │  │
│  │ • Metrics       │  │ • Push Messages │  │ • Real-time     │  │
│  │ • Reports       │  │ • Email/ SMS    │  │ • Driver Updates│  │
│  │ • Dashboards    │  │ • In-app        │  │ • Customer Track│  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │
┌─────────────────────────────────────────────────────────────────┐
│                        External Services                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Maps API      │  │  Notification   │  │   Monitoring    │  │
│  │   (Google/Mapbox)│ │  Service        │  │   (Prometheus)  │  │
│  │                 │  │                 │  │                 │  │
│  │ • Distance Calc │  │ • Push Service  │  │ • Metrics       │  │
│  │ • ETA Calculation│ │ • Email Service │  │ • Alerts        │  │
│  │ • Route Planning│  │ • SMS Service   │  │ • Dashboards    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Module Dependencies

```typescript
// Module dependency graph
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Driver, Delivery, Assignment, DriverOffer, 
      DriverAvailabilityHistory, UnassignedOrder, 
      DeliveryAuditLog, DeliveryZone, DriverZonePreference
    ]),
    RedisModule,
    ConfigModule,
    HttpModule, // For Maps API
    EventEmitterModule.forRoot()
  ],
  controllers: [
    DriversController,
    DeliveriesController,
    AssignmentsController,
    OffersController,
    AvailabilityController,
    EscalationController,
    AuditController,
    AnalyticsController
  ],
  providers: [
    DriversService,
    DeliveriesService,
    AssignmentsService,
    OfferService,
    AvailabilityService,
    EscalationService,
    AuditService,
    AnalyticsService,
    MapsService,
    NotificationService,
    ZoneService
  ]
})
export class DriverModule {}
```

---

## Database Schema Specifications

### Core Tables

#### 1. Driver Offers Table
```sql
CREATE TABLE driver_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING, ACCEPTED, REJECTED, EXPIRED
  
  offer_payload JSONB NOT NULL,
  -- {
  --   "pickupLocation": {"lat": 12.9, "lon": 77.6},
  --   "pickupStoreName": "Store Name",
  --   "estimatedPickupTimeMin": 15,
  --   "estimatedDeliveryTime": "2026-02-01T10:30:00Z",
  --   "estimatedDistanceKm": 2.5,
  --   "estimatedEarning": 150.0
  -- }
  
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  
  notification_sent_at TIMESTAMP,
  notification_method VARCHAR(20) DEFAULT 'push',
  -- 'push', 'websocket', 'both'
  
  driver_response_time_ms INTEGER,
  -- Time taken by driver to respond
  
  INDEX idx_delivery_pending ON driver_offers(delivery_id) 
    WHERE status = 'PENDING',
  INDEX idx_driver_pending ON driver_offers(driver_id) 
    WHERE status = 'PENDING',
  INDEX idx_expires_at ON driver_offers(expires_at),
  INDEX idx_created_at ON driver_offers(created_at)
);

-- Add to deliveries table
ALTER TABLE deliveries ADD COLUMN current_offer_id UUID REFERENCES driver_offers(id);
ALTER TABLE deliveries ADD COLUMN accepted_offer_id UUID REFERENCES driver_offers(id);
ALTER TABLE deliveries ADD COLUMN offer_acceptance_count INTEGER DEFAULT 0;
```

#### 2. Driver Availability History Table
```sql
CREATE TABLE driver_availability_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  from_state VARCHAR(20) NOT NULL,
  to_state VARCHAR(20) NOT NULL,
  reason VARCHAR(255),
  actor_id UUID,
  actor_type VARCHAR(20),
  -- 'driver', 'admin', 'system'
  timestamp TIMESTAMP NOT NULL DEFAULT now(),
  
  INDEX idx_driver_timestamp ON driver_availability_history(driver_id, timestamp),
  INDEX idx_actor_type ON driver_availability_history(actor_type),
  INDEX idx_reason ON driver_availability_history(reason)
);

-- Extend drivers table
ALTER TABLE drivers ADD COLUMN availability VARCHAR(20) DEFAULT 'available';
ALTER TABLE drivers ADD COLUMN availability_until TIMESTAMP;
ALTER TABLE drivers ADD COLUMN availability_reason VARCHAR(255);
ALTER TABLE drivers ADD COLUMN last_availability_change TIMESTAMP;
ALTER TABLE drivers ADD COLUMN availability_change_actor UUID;
ALTER TABLE drivers ADD COLUMN availability_change_actor_type VARCHAR(20);
```

#### 3. Unassigned Orders Table
```sql
CREATE TABLE unassigned_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id),
  seller_order_id VARCHAR(255),
  location POINT,
  failure_reason VARCHAR(50),
  -- 'no_available_drivers', 'all_drivers_busy', 'distance_exceeded', 
  -- 'redis_timeout', 'zone_empty'
  
  first_attempt_at TIMESTAMP NOT NULL,
  last_attempt_at TIMESTAMP NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  escalation_level INTEGER DEFAULT 0,
  -- 0=none, 1=ticket, 2=retry, 3=cancel
  
  escalation_status VARCHAR(50) DEFAULT 'PENDING',
  -- 'PENDING', 'NOTIFIED', 'REASSIGNED', 'CANCELLED'
  
  support_ticket_id VARCHAR(255),
  notification_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  
  INDEX idx_escalation_level ON unassigned_orders(escalation_level),
  INDEX idx_delivery_id ON unassigned_orders(delivery_id),
  INDEX idx_failure_reason ON unassigned_orders(failure_reason),
  INDEX idx_escalation_status ON unassigned_orders(escalation_status)
);
```

#### 4. Delivery Audit Logs Table
```sql
CREATE TABLE delivery_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id),
  timestamp TIMESTAMP NOT NULL DEFAULT now(),
  event_type VARCHAR(50) NOT NULL,
  -- 'created', 'assignment_started', 'driver_candidates_found',
  -- 'driver_assigned', 'driver_offer_sent', 'driver_accepted',
  -- 'driver_rejected', 'assignment_reassigned', 'pickup_started',
  -- 'pickup_completed', 'delivery_started', 'delivery_completed',
  -- 'delivery_failed'
  
  actor_id UUID,
  actor_type VARCHAR(20),
  -- 'driver', 'system', 'admin'
  
  details JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  
  INDEX idx_delivery_timestamp ON delivery_audit_logs(delivery_id, timestamp),
  INDEX idx_event_type ON delivery_audit_logs(event_type),
  INDEX idx_actor_type ON delivery_audit_logs(actor_type),
  INDEX idx_timestamp ON delivery_audit_logs(timestamp)
);
```

#### 5. Delivery Zones Table
```sql
CREATE TABLE delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  geometry GEOMETRY(POLYGON, 4326),
  -- GIS polygon for zone boundary
  
  priority_level INTEGER DEFAULT 3,
  -- 1 (highest) to 5 (lowest)
  
  min_drivers_online INTEGER DEFAULT 5,
  current_drivers_online INTEGER DEFAULT 0,
  avg_wait_time_seconds INTEGER DEFAULT 300,
  target_wait_time_seconds INTEGER DEFAULT 300,
  last_updated TIMESTAMP DEFAULT now(),
  
  INDEX idx_priority_level ON delivery_zones(priority_level),
  INDEX idx_min_drivers_online ON delivery_zones(min_drivers_online),
  INDEX idx_geometry ON delivery_zones USING GIST(geometry)
);

CREATE TABLE driver_zone_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  zone_id UUID NOT NULL REFERENCES delivery_zones(id),
  preference VARCHAR(20) DEFAULT 'AVAILABLE',
  -- 'PREFERRED', 'AVAILABLE', 'UNAVAILABLE'
  
  distance_to_zone_center NUMERIC(10, 2),
  -- Distance in kilometers from driver's home to zone center
  
  UNIQUE(driver_id, zone_id),
  INDEX idx_driver_id ON driver_zone_preferences(driver_id),
  INDEX idx_zone_id ON driver_zone_preferences(zone_id),
  INDEX idx_preference ON driver_zone_preferences(preference)
);
```

#### 6. Delivery Costs and Revenue Tables
```sql
CREATE TABLE delivery_costs (
  delivery_id UUID PRIMARY KEY REFERENCES deliveries(id),
  postgres_cost NUMERIC(10, 2) DEFAULT 0.0,
  redis_cost NUMERIC(10, 2) DEFAULT 0.0,
  api_calls_cost NUMERIC(10, 2) DEFAULT 0.0,
  driver_payment NUMERIC(10, 2) NOT NULL,
  platform_fee NUMERIC(10, 2) DEFAULT 0.0,
  total_cost NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE delivery_revenue (
  delivery_id UUID PRIMARY KEY REFERENCES deliveries(id),
  commission NUMERIC(10, 2) NOT NULL,
  delivery_fee NUMERIC(10, 2) NOT NULL,
  total_revenue NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Add to deliveries table
ALTER TABLE deliveries ADD COLUMN cost_id UUID REFERENCES delivery_costs(id);
ALTER TABLE deliveries ADD COLUMN revenue_id UUID REFERENCES delivery_revenue(id);
```

---

## API Endpoints

### Driver Offers API

#### POST /v2/deliveries/:id/offers
**Create Offer for Delivery**
```typescript
interface CreateOfferRequest {
  driverId: string;
  expiresInSeconds?: number; // Default: 30
}

interface CreateOfferResponse {
  success: boolean;
  offerId: string;
  expiresAt: string;
  payload: {
    pickupLocation: { lat: number; lon: number };
    pickupStoreName: string;
    estimatedPickupTimeMin: number;
    estimatedDeliveryTime: string;
    estimatedDistanceKm: number;
    estimatedEarning: number;
  };
}

// Example Response
{
  "success": true,
  "offerId": "offer-123",
  "expiresAt": "2026-02-01T10:00:30Z",
  "payload": {
    "pickupLocation": { "lat": 12.9, "lon": 77.6 },
    "pickupStoreName": "Downtown Market",
    "estimatedPickupTimeMin": 15,
    "estimatedDeliveryTime": "2026-02-01T10:20:00Z",
    "estimatedDistanceKm": 2.5,
    "estimatedEarning": 150.0
  }
}
```

#### GET /v2/drivers/:id/offers
**Get Driver's Active Offers**
```typescript
interface GetOffersResponse {
  offers: Array<{
    id: string;
    deliveryId: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
    payload: OfferPayload;
    createdAt: string;
    expiresAt: string;
    responseTimeMs?: number;
  }>;
}

// Example Response
{
  "offers": [
    {
      "id": "offer-123",
      "deliveryId": "delivery-456",
      "status": "PENDING",
      "payload": { /* same as above */ },
      "createdAt": "2026-02-01T09:59:30Z",
      "expiresAt": "2026-02-01T10:00:00Z"
    }
  ]
}
```

#### POST /v2/drivers/:id/offers/:offerId/accept
**Accept Offer**
```typescript
interface AcceptOfferRequest {
  acceptedAt: string; // ISO timestamp
}

interface AcceptOfferResponse {
  success: boolean;
  assignmentId: string;
  deliveryId: string;
  driverId: string;
  responseTimeMs: number;
}

// Example Response
{
  "success": true,
  "assignmentId": "assign-789",
  "deliveryId": "delivery-456",
  "driverId": "driver-123",
  "responseTimeMs": 5000
}
```

#### POST /v2/drivers/:id/offers/:offerId/reject
**Reject Offer**
```typescript
interface RejectOfferRequest {
  reason?: string;
  // 'too_far', 'no_time', 'bad_area', 'other'
}

interface RejectOfferResponse {
  success: boolean;
  nextOfferId?: string;
  reason: string;
}

// Example Response
{
  "success": true,
  "nextOfferId": "offer-456",
  "reason": "too_far"
}
```

### Availability States API

#### POST /v2/drivers/:id/availability/take-break
**Take Break**
```typescript
interface TakeBreakRequest {
  durationMinutes: number;
  reason?: string;
}

interface TakeBreakResponse {
  success: boolean;
  status: 'on_break';
  breakUntil: string;
  driverId: string;
}

// Example Response
{
  "success": true,
  "status": "on_break",
  "breakUntil": "2026-02-01T10:30:00Z",
  "driverId": "driver-123"
}
```

#### POST /v2/drivers/:id/availability/end-shift
**End Shift**
```typescript
interface EndShiftResponse {
  success: boolean;
  status: 'shift_ended';
  driverId: string;
}

// Example Response
{
  "success": true,
  "status": "shift_ended",
  "driverId": "driver-123"
}
```

#### POST /v2/drivers/:id/availability/resume
**Resume Work**
```typescript
interface ResumeResponse {
  success: boolean;
  status: 'available';
  driverId: string;
}

// Example Response
{
  "success": true,
  "status": "available",
  "driverId": "driver-123"
}
```

### Escalation API

#### GET /v2/admin/unassigned-orders
**Get Unassigned Orders**
```typescript
interface GetUnassignedOrdersResponse {
  orders: Array<{
    id: string;
    deliveryId: string;
    sellerOrderId: string;
    location: { lat: number; lon: number };
    failureReason: string;
    firstAttemptAt: string;
    lastAttemptAt: string;
    attemptCount: number;
    escalationLevel: number;
    escalationStatus: string;
    supportTicketId?: string;
  }>;
  summary: {
    total: number;
    byEscalationLevel: { [level: number]: number };
    byFailureReason: { [reason: string]: number };
  };
}

// Example Response
{
  "orders": [
    {
      "id": "unassigned-123",
      "deliveryId": "delivery-456",
      "sellerOrderId": "ORD-789",
      "location": { "lat": 12.9, "lon": 77.6 },
      "failureReason": "no_available_drivers",
      "firstAttemptAt": "2026-02-01T09:55:00Z",
      "lastAttemptAt": "2026-02-01T10:00:00Z",
      "attemptCount": 1,
      "escalationLevel": 1,
      "escalationStatus": "NOTIFIED",
      "supportTicketId": "ticket-123"
    }
  ],
  "summary": {
    "total": 5,
    "byEscalationLevel": { "0": 2, "1": 2, "2": 1 },
    "byFailureReason": { "no_available_drivers": 3, "distance_exceeded": 2 }
  }
}
```

#### POST /v2/admin/unassigned-orders/:id/escalate
**Manual Escalation**
```typescript
interface EscalateRequest {
  level: number;
  reason: string;
  notes?: string;
}

interface EscalateResponse {
  success: boolean;
  escalatedAt: string;
  newEscalationLevel: number;
  supportTicketId?: string;
}

// Example Response
{
  "success": true,
  "escalatedAt": "2026-02-01T10:05:00Z",
  "newEscalationLevel": 2,
  "supportTicketId": "ticket-456"
}
```

### Audit Trail API

#### GET /v2/admin/deliveries/:id/audit
**Get Delivery Audit Trail**
```typescript
interface GetAuditResponse {
  deliveryId: string;
  events: Array<{
    id: string;
    timestamp: string;
    eventType: string;
    actorId?: string;
    actorType?: string;
    details: any;
    version: number;
  }>;
  summary: {
    totalEvents: number;
    byEventType: { [eventType: string]: number };
    byActorType: { [actorType: string]: number };
  };
}

// Example Response
{
  "deliveryId": "delivery-123",
  "events": [
    {
      "id": "audit-123",
      "timestamp": "2026-02-01T09:30:00Z",
      "eventType": "created",
      "actorType": "system",
      "details": { "sellerOrderId": "ORD-456" },
      "version": 1
    },
    {
      "id": "audit-456",
      "timestamp": "2026-02-01T09:31:00Z",
      "eventType": "assignment_started",
      "actorType": "system",
      "details": { "searchRadiusKm": 5 },
      "version": 1
    }
  ],
  "summary": {
    "totalEvents": 8,
    "byEventType": { "created": 1, "assignment_started": 1, "driver_assigned": 1 },
    "byActorType": { "system": 8 }
  }
}
```

### ETA & Tracking API

#### GET /v2/orders/:orderId/delivery-status
**Get Customer Delivery Status**
```typescript
interface GetDeliveryStatusResponse {
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
  driver?: {
    name: string;
    rating: number;
    vehicle: string;
    phone: string; // Masked
  };
  location?: {
    lat: number;
    lon: number;
    accuracyMeters: number;
    lastUpdated: string;
  };
  estimatedPickupTime?: string;
  estimatedDeliveryTime?: string;
  estimatedPrepTimeMinutes?: number;
  trackingUrl?: string;
  deliveryId?: string;
}

// Example Response
{
  "status": "assigned",
  "driver": {
    "name": "John D.",
    "rating": 4.8,
    "vehicle": "Honda Civic, Blue",
    "phone": "***-***-1234"
  },
  "location": {
    "lat": 12.9123,
    "lon": 77.6123,
    "accuracyMeters": 50,
    "lastUpdated": "2026-02-01T09:45:00Z"
  },
  "estimatedPickupTime": "2026-02-01T09:50:00Z",
  "estimatedDeliveryTime": "2026-02-01T10:05:00Z",
  "estimatedPrepTimeMinutes": 5,
  "trackingUrl": "https://marketplace.com/track/order-abc123?token=xyz",
  "deliveryId": "delivery-123"
}
```

---

## WebSocket Events

### Driver Offer Events

#### offer_created
**Sent when a new offer is created for a driver**
```typescript
interface OfferCreatedEvent {
  type: 'offer_created';
  offerId: string;
  deliveryId: string;
  payload: {
    pickupLocation: { lat: number; lon: number };
    pickupStoreName: string;
    estimatedPickupTimeMin: number;
    estimatedDeliveryTime: string;
    estimatedDistanceKm: number;
    estimatedEarning: number;
  };
  expiresAt: string;
  createdAt: string;
}

// Example Event
{
  "type": "offer_created",
  "offerId": "offer-123",
  "deliveryId": "delivery-456",
  "payload": {
    "pickupLocation": { "lat": 12.9, "lon": 77.6 },
    "pickupStoreName": "Downtown Market",
    "estimatedPickupTimeMin": 15,
    "estimatedDeliveryTime": "2026-02-01T10:20:00Z",
    "estimatedDistanceKm": 2.5,
    "estimatedEarning": 150.0
  },
  "expiresAt": "2026-02-01T10:00:30Z",
  "createdAt": "2026-02-01T09:59:30Z"
}
```

#### offer_accepted
**Sent when a driver accepts an offer**
```typescript
interface OfferAcceptedEvent {
  type: 'offer_accepted';
  offerId: string;
  driverId: string;
  deliveryId: string;
  responseTimeMs: number;
  assignmentId: string;
  acceptedAt: string;
}

// Example Event
{
  "type": "offer_accepted",
  "offerId": "offer-123",
  "driverId": "driver-456",
  "deliveryId": "delivery-789",
  "responseTimeMs": 5000,
  "assignmentId": "assign-123",
  "acceptedAt": "2026-02-01T10:00:00Z"
}
```

#### offer_rejected
**Sent when a driver rejects an offer**
```typescript
interface OfferRejectedEvent {
  type: 'offer_rejected';
  offerId: string;
  driverId: string;
  deliveryId: string;
  reason: string;
  rejectedAt: string;
}

// Example Event
{
  "type": "offer_rejected",
  "offerId": "offer-123",
  "driverId": "driver-456",
  "deliveryId": "delivery-789",
  "reason": "too_far",
  "rejectedAt": "2026-02-01T09:59:45Z"
}
```

#### offer_expired
**Sent when an offer expires without response**
```typescript
interface OfferExpiredEvent {
  type: 'offer_expired';
  offerId: string;
  driverId: string;
  deliveryId: string;
  expiresAt: string;
}

// Example Event
{
  "type": "offer_expired",
  "offerId": "offer-123",
  "driverId": "driver-456",
  "deliveryId": "delivery-789",
  "expiresAt": "2026-02-01T10:00:30Z"
}
```

### Availability Events

#### availability_changed
**Sent when driver availability changes**
```typescript
interface AvailabilityChangedEvent {
  type: 'availability_changed';
  driverId: string;
  fromState: string;
  toState: string;
  reason?: string;
  until?: string;
  changedAt: string;
}

// Example Event
{
  "type": "availability_changed",
  "driverId": "driver-123",
  "fromState": "available",
  "toState": "on_break",
  "reason": "lunch_break",
  "until": "2026-02-01T10:30:00Z",
  "changedAt": "2026-02-01T10:00:00Z"
}
```

#### break_expired
**Sent when driver's break expires**
```typescript
interface BreakExpiredEvent {
  type: 'break_expired';
  driverId: string;
  breakDurationMinutes: number;
  expiredAt: string;
}

// Example Event
{
  "type": "break_expired",
  "driverId": "driver-123",
  "breakDurationMinutes": 30,
  "expiredAt": "2026-02-01T10:30:00Z"
}
```

### Escalation Events

#### unassigned_order_escalated
**Sent when an unassigned order is escalated**
```typescript
interface UnassignedOrderEscalatedEvent {
  type: 'unassigned_order_escalated';
  deliveryId: string;
  sellerOrderId: string;
  level: number;
  reason: string;
  escalatedAt: string;
  supportTicketId?: string;
}

// Example Event
{
  "type": "unassigned_order_escalated",
  "deliveryId": "delivery-123",
  "sellerOrderId": "ORD-456",
  "level": 1,
  "reason": "no_available_drivers",
  "escalatedAt": "2026-02-01T10:05:00Z",
  "supportTicketId": "ticket-123"
}
```

#### support_ticket_created
**Sent when a support ticket is created**
```typescript
interface SupportTicketCreatedEvent {
  type: 'support_ticket_created';
  ticketId: string;
  deliveryId: string;
  sellerOrderId: string;
  priority: string;
  title: string;
  description: string;
  createdAt: string;
}

// Example Event
{
  "type": "support_ticket_created",
  "ticketId": "ticket-123",
  "deliveryId": "delivery-456",
  "sellerOrderId": "ORD-789",
  "priority": "high",
  "title": "Order unassigned for 5+ minutes",
  "description": "Delivery in downtown zone has been waiting for assignment",
  "createdAt": "2026-02-01T10:05:00Z"
}
```

### ETA & Tracking Events

#### delivery_eta_updated
**Sent when delivery ETA is updated**
```typescript
interface DeliveryEtaUpdatedEvent {
  type: 'delivery_eta_updated';
  deliveryId: string;
  estimatedPickupTime: string;
  estimatedDeliveryTime: string;
  confidence: number;
  updatedAt: string;
}

// Example Event
{
  "type": "delivery_eta_updated",
  "deliveryId": "delivery-123",
  "estimatedPickupTime": "2026-02-01T09:50:00Z",
  "estimatedDeliveryTime": "2026-02-01T10:05:00Z",
  "confidence": 0.85,
  "updatedAt": "2026-02-01T09:45:00Z"
}
```

#### delivery_location_updated
**Sent when driver location is updated**
```typescript
interface DeliveryLocationUpdatedEvent {
  type: 'delivery_location_updated';
  deliveryId: string;
  location: {
    lat: number;
    lon: number;
    accuracyMeters: number;
  };
  speed?: number; // km/h
  heading?: number; // degrees
  updatedAt: string;
}

// Example Event
{
  "type": "delivery_location_updated",
  "deliveryId": "delivery-123",
  "location": {
    "lat": 12.9123,
    "lon": 77.6123,
    "accuracyMeters": 50
  },
  "speed": 35.5,
  "heading": 180,
  "updatedAt": "2026-02-01T09:45:00Z"
}
```

### Analytics Events

#### zone_health_updated
**Sent when zone health metrics are updated**
```typescript
interface ZoneHealthUpdatedEvent {
  type: 'zone_health_updated';
  zoneId: string;
  zoneName: string;
  metrics: {
    currentDriversOnline: number;
    minDriversRequired: number;
    avgWaitTimeSeconds: number;
    targetWaitTimeSeconds: number;
    demandLevel: number; // 1-10
    healthScore: number; // 0-100
  };
  updatedAt: string;
}

// Example Event
{
  "type": "zone_health_updated",
  "zoneId": "zone-123",
  "zoneName": "Downtown",
  "metrics": {
    "currentDriversOnline": 8,
    "minDriversRequired": 5,
    "avgWaitTimeSeconds": 240,
    "targetWaitTimeSeconds": 300,
    "demandLevel": 7,
    "healthScore": 85
  },
  "updatedAt": "2026-02-01T09:45:00Z"
}
```

#### driver_performance_updated
**Sent when driver performance metrics are updated**
```typescript
interface DriverPerformanceUpdatedEvent {
  type: 'driver_performance_updated';
  driverId: string;
  driverName: string;
  metrics: {
    deliveriesCompleted: number;
    acceptanceRate: number; // 0-1
    onTimeRate: number; // 0-1
    customerRating: number; // 1-5
    avgResponseTimeMs: number;
    totalEarnings: number;
  };
  updatedAt: string;
}

// Example Event
{
  "type": "driver_performance_updated",
  "driverId": "driver-123",
  "driverName": "John D.",
  "metrics": {
    "deliveriesCompleted": 15,
    "acceptanceRate": 0.85,
    "onTimeRate": 0.92,
    "customerRating": 4.8,
    "avgResponseTimeMs": 8500,
    "totalEarnings": 2250.0
  },
  "updatedAt": "2026-02-01T09:45:00Z"
}
```

---

## Service Implementations

### Offer Service

```typescript
@Injectable()
export class OfferService {
  constructor(
    private readonly db: DatabaseService,
    private readonly driverService: DriverService,
    private readonly deliveryService: DeliveryService,
    private readonly assignmentService: AssignmentService,
    private readonly notificationService: NotificationService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService
  ) {}

  async createOfferForDriver(
    delivery: Delivery,
    driver: Driver,
    expiresInSeconds = 30
  ): Promise<DriverOffer> {
    // 1. Calculate offer payload
    const payload = await this.calculateOfferPayload(delivery, driver);

    // 2. Create offer in database
    const offer = await this.db.driverOffers.create({
      deliveryId: delivery.id,
      driverId: driver.id,
      status: 'PENDING',
      offerPayload: payload,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      notificationSentAt: null
    });

    // 3. Send notification to driver
    await this.notificationService.sendOffer({
      driverId: driver.id,
      offerId: offer.id,
      payload: payload,
      expiresAt: offer.expiresAt
    });

    // 4. Set Redis key for quick lookup
    await this.redis.setex(
      `offer:${offer.id}`,
      expiresInSeconds,
      JSON.stringify({ driverId: driver.id, deliveryId: delivery.id })
    );

    // 5. Log audit event
    await this.logAuditEvent(delivery.id, 'offer_created', {
      offerId: offer.id,
      driverId: driver.id,
      payload,
      expiresAt: offer.expiresAt
    });

    return offer;
  }

  async acceptOffer(
    offerId: string,
    driverId: string,
    acceptedAt: Date
  ): Promise<DriverOffer> {
    const offer = await this.db.driverOffers.findOne(offerId);
    
    if (!offer || offer.driverId !== driverId) {
      throw new BadRequestException('Invalid offer or driver');
    }

    if (offer.status !== 'PENDING') {
      throw new BadRequestException('Offer already processed');
    }

    // 1. Update offer status
    offer.status = 'ACCEPTED';
    offer.acceptedAt = acceptedAt;
    offer.driverResponseTimeMs = acceptedAt.getTime() - offer.createdAt.getTime();
    await this.db.driverOffers.update(offer.id, offer);

    // 2. Create assignment
    const assignment = await this.assignmentService.createFromOffer(offer);

    // 3. Mark driver BUSY
    await this.driverService.updateStatus(driverId, 'BUSY');

    // 4. Remove from Redis GEO
    await this.redis.zrem('drivers:geo', driverId);

    // 5. Log audit event
    await this.logAuditEvent(offer.deliveryId, 'offer_accepted', {
      offerId: offer.id,
      driverId,
      responseTimeMs: offer.driverResponseTimeMs,
      assignmentId: assignment.id
    });

    return offer;
  }

  async rejectOffer(
    offerId: string,
    driverId: string,
    reason?: string
  ): Promise<DriverOffer> {
    const offer = await this.db.driverOffers.findOne(offerId);
    
    if (!offer || offer.driverId !== driverId) {
      throw new BadRequestException('Invalid offer or driver');
    }

    if (offer.status !== 'PENDING') {
      throw new BadRequestException('Offer already processed');
    }

    // 1. Update offer status
    offer.status = 'REJECTED';
    offer.rejectedAt = new Date();
    offer.rejectionReason = reason;
    await this.db.driverOffers.update(offer.id, offer);

    // 2. Trigger next candidate
    await this.triggerNextCandidate(offer.deliveryId);

    // 3. Log audit event
    await this.logAuditEvent(offer.deliveryId, 'offer_rejected', {
      offerId: offer.id,
      driverId,
      reason
    });

    return offer;
  }

  private async calculateOfferPayload(
    delivery: Delivery,
    driver: Driver
  ): Promise<any> {
    const travelTime = await this.calculateTravelTime(
      driver.currentLocation,
      delivery.pickupLocation
    );
    const prepTime = await this.getSellerPrepTime(delivery.sellerId);

    return {
      pickupLocation: delivery.pickupLocation,
      pickupStoreName: delivery.storeName,
      estimatedPickupTimeMin: Math.ceil((travelTime + prepTime) / 60),
      estimatedDeliveryTime: new Date(
        Date.now() + (travelTime + prepTime + 600) * 1000 // +10 min est
      ),
      estimatedDistanceKm: this.calculateDistance(
        driver.currentLocation,
        delivery.pickupLocation
      ),
      estimatedEarning: this.calculateDriverPayment(delivery)
    };
  }

  private async triggerNextCandidate(deliveryId: string): Promise<void> {
    // Logic to find next available driver and create offer
    // This would integrate with the assignment service
  }

  private async logAuditEvent(
    deliveryId: string,
    eventType: string,
    details: any
  ): Promise<void> {
    await this.db.deliveryAuditLogs.create({
      deliveryId,
      eventType,
      actorType: 'system',
      details,
      timestamp: new Date()
    });
  }
}
```

### Availability Service

```typescript
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService
  ) {}

  async updateAvailability(
    driverId: string,
    newAvailability: DriverAvailability,
    options?: {
      duration?: number;
      reason?: string;
      actorId?: string;
      actorType?: 'driver' | 'admin' | 'system';
    }
  ): Promise<void> {
    const driver = await this.db.drivers.findOne(driverId);
    const previousAvailability = driver.availability;

    // 1. Update database
    const availabilityUntil = options?.duration
      ? new Date(Date.now() + options.duration * 1000)
      : null;

    await this.db.drivers.update(driverId, {
      availability: newAvailability,
      availabilityUntil,
      availabilityReason: options?.reason,
      lastAvailabilityChange: new Date(),
      availabilityChangeActor: options?.actorId,
      availabilityChangeActorType: options?.actorType || 'system'
    });

    // 2. Update Redis (remove from GEO if not AVAILABLE)
    if (newAvailability !== DriverAvailability.AVAILABLE) {
      await this.redis.zrem('drivers:geo', driverId);
    } else {
      // Add back to GEO
      await this.redis.geoadd(
        'drivers:geo',
        driver.currentLat,
        driver.currentLon,
        driverId
      );
    }

    // 3. Update status cache
    await this.redis.hset('drivers:status', driverId, newAvailability);

    // 4. Log state transition
    await this.db.driverAvailabilityHistory.create({
      driverId,
      fromState: previousAvailability,
      toState: newAvailability,
      reason: options?.reason,
      actorId: options?.actorId,
      actorType: options?.actorType || 'system',
      timestamp: new Date()
    });

    // 5. Log audit event
    await this.logAuditEvent(driverId, 'availability_changed', {
      from: previousAvailability,
      to: newAvailability,
      reason: options?.reason,
      until: availabilityUntil
    });

    this.logger.info('driver_availability_changed', {
      driverId,
      from: previousAvailability,
      to: newAvailability,
      reason: options?.reason
    });
  }

  async handleBreakExpiration(): Promise<void> {
    // Find all drivers with expired breaks
    const expiredBreaks = await this.db.drivers.find({
      availability: DriverAvailability.ON_BREAK,
      availabilityUntil: { $lt: new Date() }
    });

    for (const driver of expiredBreaks) {
      await this.updateAvailability(
        driver.id,
        DriverAvailability.AVAILABLE,
        {
          reason: 'break_expired',
          actorType: 'system'
        }
      );

      // Send notification to driver
      await this.notificationService.sendBreakExpired(driver.id);
    }
  }

  private async logAuditEvent(
    driverId: string,
    eventType: string,
    details: any
  ): Promise<void> {
    // Log to audit trail
  }
}
```

### Escalation Service

```typescript
@Injectable()
export class EscalationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notificationService: NotificationService,
    private readonly supportService: SupportService,
    private readonly logger: LoggerService
  ) {}

  async checkUnassignedOrders(): Promise<void> {
    // Find all orders unassigned for > 5 minutes
    const unassignedOrders = await this.db.deliveries.find({
      status: 'READY',
      createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
    });

    for (const order of unassignedOrders) {
      const unassignedRecord = await this.db.unassignedOrders.findOne({
        deliveryId: order.id
      });

      if (!unassignedRecord) {
        // First time we've noticed this
        await this.createUnassignedRecord(order);
      } else {
        // Update existing record and check escalation
        await this.handleExistingUnassignedRecord(unassignedRecord);
      }
    }
  }

  private async createUnassignedRecord(order: Delivery): Promise<void> {
    await this.db.unassignedOrders.create({
      deliveryId: order.id,
      sellerOrderId: order.sellerOrderId,
      location: order.pickupLocation,
      failureReason: 'unassigned',
      firstAttemptAt: order.createdAt,
      lastAttemptAt: new Date(),
      attemptCount: 1,
      escalationLevel: 0,
      notificationSentAt: null
    });

    this.logger.warn('unassigned_order_detected', {
      deliveryId: order.id,
      minutesSinceCreation: 5
    });
  }

  private async handleExistingUnassignedRecord(
    unassignedRecord: UnassignedOrder
  ): Promise<void> {
    const order = await this.db.deliveries.findOne(unassignedRecord.deliveryId);
    const minutesUnassigned = (Date.now() - order.createdAt.getTime()) / 60000;

    if (minutesUnassigned > 5 && unassignedRecord.escalationLevel < 1) {
      await this.escalateToLevel1(unassignedRecord);
    } else if (minutesUnassigned > 15 && unassignedRecord.escalationLevel < 2) {
      await this.escalateToLevel2(unassignedRecord);
    } else if (minutesUnassigned > 30 && unassignedRecord.escalationLevel < 3) {
      await this.escalateToLevel3(unassignedRecord);
    }
  }

  private async escalateToLevel1(unassignedRecord: UnassignedOrder): Promise<void> {
    // Create support ticket
    const ticket = await this.supportService.createTicket({
      type: 'unassigned_delivery',
      priority: 'high',
      title: `Order ${unassignedRecord.sellerOrderId} unassigned for 5+ minutes`,
      description: `Delivery ${unassignedRecord.deliveryId} in zone ${unassignedRecord.location} has been waiting for assignment.`,
      zone: unassignedRecord.location,
      actionUrl: `/admin/orders/${unassignedRecord.sellerOrderId}`
    });

    // Notify ops team
    await this.notificationService.notifyOps({
      message: `⚠️ Order unassigned: ${unassignedRecord.sellerOrderId}`,
      severity: 'warning',
      link: `/admin/unassigned-orders/${unassignedRecord.deliveryId}`
    });

    // Update escalation
    await this.db.unassignedOrders.update(unassignedRecord.id, {
      escalationLevel: 1,
      supportTicketId: ticket.id,
      notificationSentAt: new Date()
    });

    // Log audit event
    await this.logAuditEvent(unassignedRecord.deliveryId, 'escalation_triggered', {
      level: 1,
      reason: '5_min_unassigned',
      ticketId: ticket.id
    });
  }

  private async escalateToLevel2(unassignedRecord: UnassignedOrder): Promise<void> {
    // Retry with wider radius (10km instead of 5km)
    const delivery = await this.db.deliveries.findOne(unassignedRecord.deliveryId);

    try {
      await this.assignmentService.assignNearestDriver(delivery, {
        maxRadiusKm: 10,
        reason: 'escalation_wide_search'
      });

      // If successful, mark as resolved
      await this.db.unassignedOrders.update(unassignedRecord.id, {
        escalationLevel: 2,
        escalationStatus: 'REASSIGNED'
      });

      this.logger.info('escalation_reassignment_success', {
        deliveryId: delivery.id
      });
    } catch (error) {
      // Still no drivers, move to level 3
      await this.escalateToLevel3(unassignedRecord);
    }
  }

  private async escalateToLevel3(unassignedRecord: UnassignedOrder): Promise<void> {
    // 30 min: Critical level, needs immediate attention
    await this.notificationService.notifyOps({
      message: `🚨 CRITICAL: Order ${unassignedRecord.sellerOrderId} unassigned for 30+ min`,
      severity: 'critical',
      link: `/admin/unassigned-orders/${unassignedRecord.deliveryId}`
    });

    // Update escalation
    await this.db.unassignedOrders.update(unassignedRecord.id, {
      escalationLevel: 3,
      notificationSentAt: new Date()
    });

    // Log audit event
    await this.logAuditEvent(unassignedRecord.deliveryId, 'escalation_critical', {
      level: 3,
      reason: '30_min_unassigned'
    });
  }

  private async logAuditEvent(
    deliveryId: string,
    eventType: string,
    details: any
  ): Promise<void> {
    await this.db.deliveryAuditLogs.create({
      deliveryId,
      eventType,
      actorType: 'system',
      details,
      timestamp: new Date()
    });
  }
}
```

---

## Data Models

### TypeScript Interfaces

```typescript
// Driver Status Enum
export enum DriverAvailability {
  AVAILABLE = 'available',
  BUSY = 'busy',
  ON_BREAK = 'on_break',
  SHIFT_ENDED = 'shift_ended',
  OFFLINE = 'offline',
  PAUSED = 'paused'
}

// Driver Offer Model
export interface DriverOffer {
  id: string;
  deliveryId: string;
  driverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  offerPayload: {
    pickupLocation: { lat: number; lon: number };
    pickupStoreName: string;
    estimatedPickupTimeMin: number;
    estimatedDeliveryTime: string;
    estimatedDistanceKm: number;
    estimatedEarning: number;
  };
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  notificationSentAt?: Date;
  notificationMethod?: string;
  driverResponseTimeMs?: number;
}

// Unassigned Order Model
export interface UnassignedOrder {
  id: string;
  deliveryId: string;
  sellerOrderId: string;
  location: { lat: number; lon: number };
  failureReason: string;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  attemptCount: number;
  escalationLevel: number;
  escalationStatus: string;
  supportTicketId?: string;
  notificationSentAt?: Date;
  createdAt: Date;
}

// Delivery Audit Log Model
export interface DeliveryAuditLog {
  id: string;
  deliveryId: string;
  timestamp: Date;
  eventType: string;
  actorId?: string;
  actorType?: string;
  details: any;
  version: number;
}

// Zone Model
export interface DeliveryZone {
  id: string;
  name: string;
  geometry: any; // GIS polygon
  priorityLevel: number;
  minDriversOnline: number;
  currentDriversOnline: number;
  avgWaitTimeSeconds: number;
  targetWaitTimeSeconds: number;
  lastUpdated: Date;
}

export interface DriverZonePreference {
  id: string;
  driverId: string;
  zoneId: string;
  preference: 'PREFERRED' | 'AVAILABLE' | 'UNAVAILABLE';
  distanceToZoneCenter: number;
}

// ETA Model
export interface ETA {
  pickupETA: Date;
  deliveryETA: Date;
  confidence: number;
  calculatedAt: Date;
}

// Performance Metrics
export interface DriverPerformance {
  driverId: string;
  deliveriesCompleted: number;
  acceptanceRate: number;
  onTimeRate: number;
  customerRating: number;
  avgResponseTimeMs: number;
  totalEarnings: number;
  updatedAt: Date;
}

// Zone Health Metrics
export interface ZoneHealth {
  zoneId: string;
  currentDriversOnline: number;
  minDriversRequired: number;
  avgWaitTimeSeconds: number;
  targetWaitTimeSeconds: number;
  demandLevel: number;
  healthScore: number;
  updatedAt: Date;
}
```

---

## Integration Patterns

### Event-Driven Architecture

```typescript
// Event Bus Integration
@Injectable()
export class EventService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService
  ) {}

  // Emit domain events
  emitOfferCreated(offer: DriverOffer) {
    this.eventEmitter.emit('offer.created', offer);
    this.auditService.logEvent('offer_created', {
      offerId: offer.id,
      deliveryId: offer.deliveryId,
      driverId: offer.driverId
    });
  }

  emitOfferAccepted(offer: DriverOffer) {
    this.eventEmitter.emit('offer.accepted', offer);
    this.auditService.logEvent('offer_accepted', {
      offerId: offer.id,
      driverId: offer.driverId,
      responseTimeMs: offer.driverResponseTimeMs
    });
  }

  emitAvailabilityChanged(driverId: string, from: string, to: string) {
    this.eventEmitter.emit('driver.availability_changed', {
      driverId,
      from,
      to
    });
    this.auditService.logEvent('availability_changed', {
      driverId,
      from,
      to
    });
  }

  emitEscalationTriggered(deliveryId: string, level: number) {
    this.eventEmitter.emit('escalation.triggered', {
      deliveryId,
      level
    });
    this.auditService.logEvent('escalation_triggered', {
      deliveryId,
      level
    });
  }
}

// Event Listeners
@OnEvent('offer.created')
handleOfferCreated(offer: DriverOffer) {
  // Send push notification
  this.notificationService.sendOffer(offer);
  
  // Start expiration timer
  this.startOfferExpirationTimer(offer);
}

@OnEvent('offer.accepted')
handleOfferAccepted(offer: DriverOffer) {
  // Cancel expiration timer
  this.cancelOfferExpirationTimer(offer.id);
  
  // Update driver status
  this.driverService.markBusy(offer.driverId);
  
  // Remove from Redis GEO
  this.redisService.removeFromGeo(offer.driverId);
}

@OnEvent('driver.availability_changed')
handleAvailabilityChanged(event: { driverId: string; from: string; to: string }) {
  if (event.to === 'AVAILABLE') {
    // Add back to Redis GEO
    this.redisService.addToGeo(event.driverId);
  } else {
    // Remove from Redis GEO
    this.redisService.removeFromGeo(event.driverId);
  }
}
```

### CQRS Pattern

```typescript
// Command Handlers
@CommandHandler(CreateOfferCommand)
export class CreateOfferHandler implements ICommandHandler<CreateOfferCommand> {
  constructor(
    private readonly offerService: OfferService,
    private readonly eventService: EventService
  ) {}

  async execute(command: CreateOfferCommand): Promise<void> {
    const { deliveryId, driverId } = command;
    
    const delivery = await this.offerService.getDelivery(deliveryId);
    const driver = await this.offerService.getDriver(driverId);
    
    const offer = await this.offerService.createOfferForDriver(delivery, driver);
    
    this.eventService.emitOfferCreated(offer);
  }
}

@CommandHandler(AcceptOfferCommand)
export class AcceptOfferHandler implements ICommandHandler<AcceptOfferCommand> {
  constructor(
    private readonly offerService: OfferService,
    private readonly eventService: EventService
  ) {}

  async execute(command: AcceptOfferCommand): Promise<void> {
    const { offerId, driverId, acceptedAt } = command;
    
    const offer = await this.offerService.acceptOffer(offerId, driverId, acceptedAt);
    
    this.eventService.emitOfferAccepted(offer);
  }
}

// Query Handlers
@QueryHandler(GetDriverOffersQuery)
export class GetDriverOffersHandler implements IQueryHandler<GetDriverOffersQuery> {
  constructor(private readonly offerService: OfferService) {}

  async execute(query: GetDriverOffersQuery): Promise<DriverOffer[]> {
    return this.offerService.getDriverOffers(query.driverId);
  }
}

@QueryHandler(GetUnassignedOrdersQuery)
export class GetUnassignedOrdersHandler implements IQueryHandler<GetUnassignedOrdersQuery> {
  constructor(private readonly escalationService: EscalationService) {}

  async execute(query: GetUnassignedOrdersQuery): Promise<UnassignedOrder[]> {
    return this.escalationService.getUnassignedOrders(query.filters);
  }
}
```

### Repository Pattern

```typescript
// Base Repository
export abstract class BaseRepository<T> {
  protected abstract entityClass: new () => T;

  async create(data: Partial<T>): Promise<T> {
    return this.db.save(this.entityClass, data);
  }

  async findById(id: string): Promise<T | null> {
    return this.db.findOne(this.entityClass, { id });
  }

  async find(filters: any): Promise<T[]> {
    return this.db.find(this.entityClass, filters);
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    await this.db.update(this.entityClass, { id }, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.entityClass, { id });
  }
}

// Specific Repositories
@Injectable()
export class DriverOfferRepository extends BaseRepository<DriverOffer> {
  protected entityClass = DriverOffer;

  async findByDeliveryId(deliveryId: string): Promise<DriverOffer[]> {
    return this.find({ deliveryId });
  }

  async findByDriverId(driverId: string): Promise<DriverOffer[]> {
    return this.find({ driverId });
  }

  async findPendingByDriverId(driverId: string): Promise<DriverOffer[]> {
    return this.find({ driverId, status: 'PENDING' });
  }

  async expireOffers(offerIds: string[]): Promise<void> {
    await this.db.update(this.entityClass, 
      { id: In(offerIds) }, 
      { status: 'EXPIRED', expiresAt: new Date() }
    );
  }
}

@Injectable()
export class UnassignedOrderRepository extends BaseRepository<UnassignedOrder> {
  protected entityClass = UnassignedOrder;

  async findByEscalationLevel(level: number): Promise<UnassignedOrder[]> {
    return this.find({ escalationLevel: level });
  }

  async incrementAttemptCount(deliveryId: string): Promise<void> {
    await this.db.increment(this.entityClass, 
      { deliveryId }, 
      'attemptCount', 
      1
    );
  }
}
```

---

## Error Handling

### Global Exception Filters

```typescript
@Catch(BadRequestException)
export class BadRequestExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception.getStatus();
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
      error: 'Bad Request'
    };

    // Log error
    Logger.error(
      `Bad Request: ${exception.message}`,
      exception.stack,
      'BadRequestException'
    );

    response.status(status).json(errorResponse);
  }
}

@Catch(NotFoundException)
export class NotFoundExceptionFilter implements ExceptionFilter {
  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception.getStatus();
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
      error: 'Not Found'
    };

    response.status(status).json(errorResponse);
  }
}

@Catch(ConflictException)
export class ConflictExceptionFilter implements ExceptionFilter {
  catch(exception: ConflictException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception.getStatus();
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
      error: 'Conflict'
    };

    response.status(status).json(errorResponse);
  }
}

@Catch(Exception)
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Internal Server Error',
      error: 'Something went wrong'
    };

    // Log unexpected errors
    Logger.error(
      `Unexpected Error: ${exception.message}`,
      exception.stack,
      'AllExceptionsFilter'
    );

    response.status(status).json(errorResponse);
  }
}
```

### Custom Exceptions

```typescript
export class OfferAlreadyProcessedException extends BadRequestException {
  constructor(offerId: string) {
    super(`Offer ${offerId} has already been processed`);
  }
}

export class DriverNotAvailableException extends ConflictException {
  constructor(driverId: string) {
    super(`Driver ${driverId} is not available for assignment`);
  }
}

export class NoDriversAvailableException extends NotFoundException {
  constructor() {
    super('No drivers available for assignment');
  }
}

export class EscalationLevelExceededException extends BadRequestException {
  constructor(level: number) {
    super(`Escalation level ${level} exceeded maximum allowed level`);
  }
}

export class ZoneNotFoundException extends NotFoundException {
  constructor(zoneId: string) {
    super(`Zone ${zoneId} not found`);
  }
}

export class AssignmentNotFoundException extends NotFoundException {
  constructor(assignmentId: string) {
    super(`Assignment ${assignmentId} not found`);
  }
}
```

### Validation Pipes

```typescript
// Custom Validation Pipe
@PipeTransform()
export class OfferValidationPipe implements PipeTransform {
  async transform(value: any, metadata: ArgumentMetadata) {
    if (!value.driverId || !value.deliveryId) {
      throw new BadRequestException('driverId and deliveryId are required');
    }

    // Validate driver exists and is available
    const driver = await this.driverService.findOne(value.driverId);
    if (!driver) {
      throw new NotFoundException(`Driver ${value.driverId} not found`);
    }

    if (driver.availability !== 'AVAILABLE') {
      throw new ConflictException(`Driver ${value.driverId} is not available`);
    }

    // Validate delivery exists
    const delivery = await this.deliveryService.findOne(value.deliveryId);
    if (!delivery) {
      throw new NotFoundException(`Delivery ${value.deliveryId} not found`);
    }

    if (delivery.status !== 'READY') {
      throw new ConflictException(`Delivery ${value.deliveryId} is not ready for assignment`);
    }

    return value;
  }
}

// DTO Validation
export class CreateOfferDto {
  @IsUUID()
  @ApiProperty({ description: 'Driver ID' })
  driverId: string;

  @IsUUID()
  @ApiProperty({ description: 'Delivery ID' })
  deliveryId: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  @ApiPropertyOptional({ description: 'Offer expiration time in seconds' })
  expiresInSeconds?: number;
}

export class AcceptOfferDto {
  @IsUUID()
  @ApiProperty({ description: 'Offer ID' })
  offerId: string;

  @IsUUID()
  @ApiProperty({ description: 'Driver ID' })
  driverId: string;

  @IsISO8601()
  @ApiProperty({ description: 'Acceptance timestamp' })
  acceptedAt: string;
}
```

---

## Testing Specifications

### Unit Testing Strategy

```typescript
// Offer Service Unit Tests
describe('OfferService', () => {
  let offerService: OfferService;
  let driverService: MockProxy<DriverService>;
  let deliveryService: MockProxy<DeliveryService>;
  let assignmentService: MockProxy<AssignmentService>;
  let notificationService: MockProxy<NotificationService>;
  let redisService: MockProxy<RedisService>;
  let db: MockProxy<DatabaseService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OfferService,
        {
          provide: DriverService,
          useValue: mock<DriverService>()
        },
        {
          provide: DeliveryService,
          useValue: mock<DeliveryService>()
        },
        {
          provide: AssignmentService,
          useValue: mock<AssignmentService>()
        },
        {
          provide: NotificationService,
          useValue: mock<NotificationService>()
        },
        {
          provide: RedisService,
          useValue: mock<RedisService>()
        },
        {
          provide: DatabaseService,
          useValue: mock<DatabaseService>()
        }
      ]
    }).compile();

    offerService = module.get<OfferService>(OfferService);
    driverService = module.get(DriverService);
    deliveryService = module.get(DeliveryService);
    assignmentService = module.get(AssignmentService);
    notificationService = module.get(NotificationService);
    redisService = module.get(RedisService);
    db = module.get(DatabaseService);
  });

  describe('createOfferForDriver', () => {
    it('should create offer with correct payload', async () => {
      // Arrange
      const delivery = createTestDelivery();
      const driver = createTestDriver();
      
      const mockOffer = {
        id: 'offer-123',
        deliveryId: delivery.id,
        driverId: driver.id,
        status: 'PENDING',
        offerPayload: {
          pickupLocation: { lat: 12.9, lon: 77.6 },
          pickupStoreName: 'Test Store',
          estimatedPickupTimeMin: 15,
          estimatedDeliveryTime: new Date(),
          estimatedDistanceKm: 2.5,
          estimatedEarning: 150.0
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      };

      db.driverOffers.create.mockResolvedValue(mockOffer);
      notificationService.sendOffer.mockResolvedValue();
      redisService.setex.mockResolvedValue();

      // Act
      const result = await offerService.createOfferForDriver(delivery, driver);

      // Assert
      expect(result).toEqual(mockOffer);
      expect(db.driverOffers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: delivery.id,
          driverId: driver.id,
          status: 'PENDING',
          createdAt: expect.any(Date),
          expiresAt: expect.any(Date)
        })
      );
      expect(notificationService.sendOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: driver.id,
          offerId: mockOffer.id,
          payload: mockOffer.offerPayload,
          expiresAt: mockOffer.expiresAt
        })
      );
    });

    it('should throw error if driver is not available', async () => {
      // Arrange
      const delivery = createTestDelivery();
      const driver = createTestDriver();
      driver.availability = 'BUSY';

      // Act & Assert
      await expect(
        offerService.createOfferForDriver(delivery, driver)
      ).rejects.toThrow(DriverNotAvailableException);
    });
  });

  describe('acceptOffer', () => {
    it('should accept offer and create assignment', async () => {
      // Arrange
      const offer = createTestOffer();
      const acceptedAt = new Date();

      db.driverOffers.findOne.mockResolvedValue(offer);
      db.driverOffers.update.mockResolvedValue();
      assignmentService.createFromOffer.mockResolvedValue(createTestAssignment());
      driverService.updateStatus.mockResolvedValue();
      redisService.zrem.mockResolvedValue();

      // Act
      const result = await offerService.acceptOffer(offer.id, offer.driverId, acceptedAt);

      // Assert
      expect(result.status).toBe('ACCEPTED');
      expect(result.acceptedAt).toEqual(acceptedAt);
      expect(db.driverOffers.update).toHaveBeenCalledWith(offer.id, expect.objectContaining({
        status: 'ACCEPTED',
        acceptedAt,
        driverResponseTimeMs: expect.any(Number)
      }));
      expect(assignmentService.createFromOffer).toHaveBeenCalledWith(offer);
      expect(driverService.updateStatus).toHaveBeenCalledWith(offer.driverId, 'BUSY');
      expect(redisService.zrem).toHaveBeenCalledWith('drivers:geo', offer.driverId);
    });

    it('should throw error if offer not found', async () => {
      // Arrange
      db.driverOffers.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        offerService.acceptOffer('invalid-offer-id', 'driver-123', new Date())
      ).rejects.toThrow(BadRequestException);
    });
  });
});
```

### Integration Testing

```typescript
// Integration Test Setup
describe('Driver Offers Integration', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [DriverModule, DatabaseModule, RedisModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    db = moduleFixture.get<DatabaseService>(DatabaseService);
    redisService = moduleFixture.get<RedisService>(RedisService);

    await app.init();
    await db.clear(); // Clean slate for tests
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v2/deliveries/:id/offers', () => {
    it('should create offer for available driver', async () => {
      // Arrange
      const driver = await createTestDriver({ availability: 'AVAILABLE' });
      const delivery = await createTestDelivery({ status: 'READY' });

      // Act
      const response = await request(app.getHttpServer())
        .post(`/v2/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver.id })
        .expect(201);

      // Assert
      expect(response.body).toMatchObject({
        success: true,
        offerId: expect.any(String),
        expiresAt: expect.any(String),
        payload: {
          pickupLocation: expect.any(Object),
          pickupStoreName: expect.any(String),
          estimatedPickupTimeMin: expect.any(Number),
          estimatedDeliveryTime: expect.any(String),
          estimatedDistanceKm: expect.any(Number),
          estimatedEarning: expect.any(Number)
        }
      });

      // Verify in database
      const offer = await db.driverOffers.findOne(response.body.offerId);
      expect(offer).toBeDefined();
      expect(offer.status).toBe('PENDING');
    });

    it('should return 400 if driver not available', async () => {
      // Arrange
      const driver = await createTestDriver({ availability: 'BUSY' });
      const delivery = await createTestDelivery({ status: 'READY' });

      // Act & Assert
      await request(app.getHttpServer())
        .post(`/v2/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver.id })
        .expect(400);
    });
  });

  describe('POST /v2/drivers/:id/offers/:offerId/accept', () => {
    it('should accept offer and create assignment', async () => {
      // Arrange
      const driver = await createTestDriver({ availability: 'AVAILABLE' });
      const delivery = await createTestDelivery({ status: 'READY' });
      const offer = await createTestOffer({ driverId: driver.id, deliveryId: delivery.id });

      // Act
      const response = await request(app.getHttpServer())
        .post(`/v2/drivers/${driver.id}/offers/${offer.id}/accept`)
        .send({ acceptedAt: new Date().toISOString() })
        .expect(200);

      // Assert
      expect(response.body).toMatchObject({
        success: true,
        assignmentId: expect.any(String),
        deliveryId: delivery.id,
        driverId: driver.id,
        responseTimeMs: expect.any(Number)
      });

      // Verify state changes
      const updatedOffer = await db.driverOffers.findOne(offer.id);
      expect(updatedOffer.status).toBe('ACCEPTED');
      expect(updatedOffer.acceptedAt).toBeDefined();

      const updatedDriver = await db.drivers.findOne(driver.id);
      expect(updatedDriver.availability).toBe('BUSY');
    });
  });
});
```

### E2E Testing

```typescript
// E2E Test Suite
describe('Driver Service E2E', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    db = moduleFixture.get<DatabaseService>(DatabaseService);

    await app.init();
    await setupTestDatabase(); // Seed test data
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestDatabase();
  });

  describe('Complete Driver Offer Flow', () => {
    it('should handle complete offer lifecycle', async () => {
      // 1. Create driver and delivery
      const driver = await createTestDriver({ availability: 'AVAILABLE' });
      const delivery = await createTestDelivery({ status: 'READY' });

      // 2. Create offer
      const offerResponse = await request(app.getHttpServer())
        .post(`/v2/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver.id })
        .expect(201);

      const offerId = offerResponse.body.offerId;

      // 3. Accept offer
      const acceptResponse = await request(app.getHttpServer())
        .post(`/v2/drivers/${driver.id}/offers/${offerId}/accept`)
        .send({ acceptedAt: new Date().toISOString() })
        .expect(200);

      // 4. Verify assignment created
      const assignmentId = acceptResponse.body.assignmentId;
      const assignment = await db.assignments.findOne(assignmentId);
      expect(assignment).toBeDefined();
      expect(assignment.driverId).toBe(driver.id);
      expect(assignment.deliveryId).toBe(delivery.id);

      // 5. Verify driver marked busy
      const updatedDriver = await db.drivers.findOne(driver.id);
      expect(updatedDriver.availability).toBe('BUSY');

      // 6. Verify offer marked accepted
      const updatedOffer = await db.driverOffers.findOne(offerId);
      expect(updatedOffer.status).toBe('ACCEPTED');
      expect(updatedOffer.acceptedAt).toBeDefined();
    });

    it('should handle offer rejection and next candidate', async () => {
      // 1. Create two drivers and one delivery
      const driver1 = await createTestDriver({ availability: 'AVAILABLE' });
      const driver2 = await createTestDriver({ availability: 'AVAILABLE' });
      const delivery = await createTestDelivery({ status: 'READY' });

      // 2. Create offer for driver1
      const offerResponse = await request(app.getHttpServer())
        .post(`/v2/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver1.id })
        .expect(201);

      const offerId = offerResponse.body.offerId;

      // 3. Reject offer
      await request(app.getHttpServer())
        .post(`/v2/drivers/${driver1.id}/offers/${offerId}/reject`)
        .send({ reason: 'too_far' })
        .expect(200);

      // 4. Verify offer marked rejected
      const updatedOffer = await db.driverOffers.findOne(offerId);
      expect(updatedOffer.status).toBe('REJECTED');
      expect(updatedOffer.rejectedAt).toBeDefined();
      expect(updatedOffer.rejectionReason).toBe('too_far');

      // 5. Verify driver1 still available
      const updatedDriver1 = await db.drivers.findOne(driver1.id);
      expect(updatedDriver1.availability).toBe('AVAILABLE');

      // 6. Verify next candidate gets offer (if implemented)
      // This would depend on the triggerNextCandidate implementation
    });
  });

  describe('Escalation Flow', () => {
    it('should escalate unassigned orders', async () => {
      // 1. Create delivery that will fail assignment
      const delivery = await createTestDelivery({ status: 'READY' });

      // 2. Wait 5 minutes (simulate time passing)
      // In real tests, you might use jest.useFakeTimers() or directly create unassigned record

      // 3. Trigger escalation check
      await request(app.getHttpServer())
        .post('/v2/admin/escalation/check')
        .expect(200);

      // 4. Verify escalation record created
      const unassignedRecord = await db.unassignedOrders.findOne({ deliveryId: delivery.id });
      expect(unassignedRecord).toBeDefined();
      expect(unassignedRecord.escalationLevel).toBe(1);

      // 5. Verify support ticket created
      expect(unassignedRecord.supportTicketId).toBeDefined();
    });
  });
});
```

### Load Testing

```typescript
// Artillery.js Configuration
module.exports = {
  config: {
    target: 'http://localhost:3001',
    phases: [
      { duration: 60, arrivalRate: 10 }, // Ramp up
      { duration: 120, arrivalRate: 50 }, // Sustained load
      { duration: 60, arrivalRate: 100 }, // Peak load
      { duration: 60, arrivalRate: 10 } // Ramp down
    ],
    defaults: {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  },
  scenarios: [
    {
      name: 'Driver Offer Flow',
      weight: 70,
      flow: [
        {
          post: {
            url: '/v2/deliveries/{{ $randomUUID }}/offers',
            json: {
              driverId: '{{ $randomUUID }}',
              expiresInSeconds: 30
            },
            expect: [
              { statusCode: 201 }
            ]
          }
        },
        {
          post: {
            url: '/v2/drivers/{{ $randomUUID }}/offers/{{ $previousResponse.body.offerId }}/accept',
            json: {
              acceptedAt: '{{ $timestamp }}'
            },
            expect: [
              { statusCode: 200 }
            ]
          }
        }
      ]
    },
    {
      name: 'Availability Management',
      weight: 20,
      flow: [
        {
          post: {
            url: '/v2/drivers/{{ $randomUUID }}/availability/take-break',
            json: {
              durationMinutes: 30,
              reason: 'lunch'
            },
            expect: [
              { statusCode: 200 }
            ]
          }
        },
        {
          post: {
            url: '/v2/drivers/{{ $randomUUID }}/availability/resume',
            expect: [
              { statusCode: 200 }
            ]
          }
        }
      ]
    },
    {
      name: 'Admin Operations',
      weight: 10,
      flow: [
        {
          get: {
            url: '/v2/admin/unassigned-orders',
            expect: [
              { statusCode: 200 }
            ]
          }
        },
        {
          get: {
            url: '/v2/admin/deliveries/{{ $randomUUID }}/audit',
            expect: [
              { statusCode: 200 }
            ]
          }
        }
      ]
    }
  ]
};
```

---

## Performance Considerations

### Database Optimization

```typescript
// Indexes for Performance
@Entity('driver_offers')
export class DriverOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  deliveryId: string;

  @Column('uuid')
  driverId: string;

  @Column('varchar', { length: 20 })
  status: string;

  @Column('jsonb')
  offerPayload: any;

  @CreateDateColumn()
  createdAt: Date;

  @Column('timestamp')
  expiresAt: Date;

  @Index('idx_delivery_pending')
  @Column('timestamp', { nullable: true })
  acceptedAt: Date;

  @Column('timestamp', { nullable: true })
  rejectedAt: Date;

  @Column('text', { nullable: true })
  rejectionReason: string;

  @Column('timestamp', { nullable: true })
  notificationSentAt: Date;

  @Column('varchar', { length: 20, default: 'push' })
  notificationMethod: string;

  @Column('integer', { nullable: true })
  driverResponseTimeMs: number;
}

// Query Optimization
@Injectable()
export class OfferService {
  async findPendingOffersByDriver(driverId: string): Promise<DriverOffer[]> {
    return this.db.driverOffers.find({
      where: {
        driverId,
        status: 'PENDING',
        expiresAt: MoreThan(new Date())
      },
      order: {
        createdAt: 'DESC'
      },
      take: 10 // Limit results
    });
  }

  async findExpiredOffers(): Promise<DriverOffer[]> {
    return this.db.driverOffers.find({
      where: {
        status: 'PENDING',
        expiresAt: LessThan(new Date())
      },
      take: 100 // Process in batches
    });
  }

  async getDriverAvailabilityHistory(
    driverId: string, 
    limit = 100
  ): Promise<DriverAvailabilityHistory[]> {
    return this.db.driverAvailabilityHistory.find({
      where: { driverId },
      order: { timestamp: 'DESC' },
      take: limit
    });
  }
}
```

### Redis Optimization

```typescript
// Redis Pipeline for Batch Operations
@Injectable()
export class RedisService {
  async batchUpdateDriverStatus(
    updates: Array<{ driverId: string; status: string }>
  ): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const update of updates) {
      pipeline.hset('drivers:status', update.driverId, update.status);
      
      if (update.status !== 'AVAILABLE') {
        pipeline.zrem('drivers:geo', update.driverId);
      }
    }

    await pipeline.exec();
  }

  async getDriverStatusBatch(driverIds: string[]): Promise<{ [driverId: string]: string }> {
    const results = await this.redis.hmget('drivers:status', ...driverIds);
    return driverIds.reduce((acc, driverId, index) => {
      acc[driverId] = results[index];
      return acc;
    }, {} as { [driverId: string]: string });
  }

  async getZoneHealthBatch(zoneIds: string[]): Promise<{ [zoneId: string]: ZoneHealth }> {
    const keys = zoneIds.map(id => `zone:health:${id}`);
    const results = await this.redis.mget(...keys);
    
    return zoneIds.reduce((acc, zoneId, index) => {
      if (results[index]) {
        acc[zoneId] = JSON.parse(results[index]);
      }
      return acc;
    }, {} as { [zoneId: string]: ZoneHealth });
  }
}
```

### Caching Strategy

```typescript
// Cache Service
@Injectable()
export class CacheService {
  constructor(private readonly redis: RedisService) {}

  async getDriverWithCache(driverId: string): Promise<Driver | null> {
    const cacheKey = `driver:${driverId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const driver = await this.db.drivers.findOne(driverId);
    if (driver) {
      await this.redis.setex(cacheKey, 300, JSON.stringify(driver)); // 5 min cache
    }

    return driver;
  }

  async invalidateDriverCache(driverId: string): Promise<void> {
    await this.redis.del(`driver:${driverId}`);
  }

  async getZoneHealthWithCache(zoneId: string): Promise<ZoneHealth | null> {
    const cacheKey = `zone:health:${zoneId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const health = await this.calculateZoneHealth(zoneId);
    if (health) {
      await this.redis.setex(cacheKey, 60, JSON.stringify(health)); // 1 min cache
    }

    return health;
  }

  async updateZoneHealthCache(zoneId: string, health: ZoneHealth): Promise<void> {
    const cacheKey = `zone:health:${zoneId}`;
    await this.redis.setex(cacheKey, 60, JSON.stringify(health));
  }
}
```

### Connection Pooling

```typescript
// Database Connection Configuration
export const databaseConfig = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: false,
  logging: false,
  max: 20, // Maximum connections
  min: 5,  // Minimum connections
  idleTimeoutMillis: 30000, // 30 seconds
  connectionTimeoutMillis: 2000, // 2 seconds
  acquireConnectionTimeout: 60000, // 1 minute
  createTimeoutMillis: 30000, // 30 seconds
  destroyTimeoutMillis: 5000, // 5 seconds
  reapIntervalMillis: 1000, // 1 second
  createRetryIntervalMillis: 200 // 200ms
};
```

### Monitoring and Metrics

```typescript
// Metrics Service
@Injectable()
export class MetricsService {
  private readonly metrics = {
    offerCreationLatency: new Histogram({
      name: 'offer_creation_latency_seconds',
      help: 'Time taken to create an offer',
      buckets: [0.1, 0.5, 1, 2, 5]
    }),
    offerAcceptanceRate: new Gauge({
      name: 'offer_acceptance_rate',
      help: 'Rate of offer acceptance'
    }),
    assignmentLatency: new Histogram({
      name: 'assignment_latency_seconds',
      help: 'Time taken for assignment',
      buckets: [0.1, 0.5, 1, 2, 5, 10]
    }),
    unassignedOrderCount: new Gauge({
      name: 'unassigned_order_count',
      help: 'Number of unassigned orders'
    }),
    driverAvailability: new Gauge({
      name: 'driver_availability_total',
      help: 'Total drivers by availability status',
      labelNames: ['status']
    })
  };

  recordOfferCreationLatency(latency: number) {
    this.metrics.offerCreationLatency.observe(latency);
  }

  recordOfferAcceptanceRate(rate: number) {
    this.metrics.offerAcceptanceRate.set(rate);
  }

  recordAssignmentLatency(latency: number) {
    this.metrics.assignmentLatency.observe(latency);
  }

  recordUnassignedOrderCount(count: number) {
    this.metrics.unassignedOrderCount.set(count);
  }

  recordDriverAvailability(status: string, count: number) {
    this.metrics.driverAvailability.labels(status).set(count);
  }
}
```

This comprehensive technical specification provides detailed implementation guidance for all v2 features, ensuring consistent patterns, proper error handling, thorough testing, and performance optimization.