# V2 Quick-Start Implementation Guide

**Date:** January 31, 2026  
**Audience:** Engineering Team  
**Purpose:** Concrete coding patterns & priorities for post-GA v2 features  
**Use:** Week 1-2 of v1.0.0 GA production

---

## Phase 1: Core Reliability (Week 1-2 Post-GA)

These features should start **day 1 after GA launch**, based on immediate production feedback.

### Feature 1.1: Driver Offer + Accept

**Why First:** Drivers will start complaining immediately ("I didn't accept this!")

#### Implementation Pattern (NestJS)

```typescript
// 1. Create offer when assignment needed
// src/deliveries/services/offer.service.ts

@Injectable()
export class OfferService {
  constructor(
    private readonly driverService: DriverService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly db: DatabaseService
  ) {}

  async createOfferForDriver(
    delivery: Delivery,
    driver: Driver,
    expiresInSeconds = 30
  ): Promise<DriverOffer> {
    // Calculate offer payload
    const payload = await this.calculateOfferPayload(delivery, driver)

    // Create offer in DB
    const offer = await this.db.driverOffers.create({
      deliveryId: delivery.id,
      driverId: driver.id,
      status: 'PENDING',
      offerPayload: payload,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      notificationSentAt: null
    })

    // Send notification to driver
    await this.notificationService.sendOffer({
      driverId: driver.id,
      offerId: offer.id,
      payload: payload,
      expiresAt: offer.expiresAt
    })

    // Set Redis key to track offer (for quick lookup)
    await this.redis.setex(
      `offer:${offer.id}`,
      expiresInSeconds,
      JSON.stringify({ driverId: driver.id, deliveryId: delivery.id })
    )

    return offer
  }

  private async calculateOfferPayload(delivery: Delivery, driver: Driver) {
    const travelTime = await this.calculateTravelTime(
      driver.currentLocation,
      delivery.pickupLocation
    )
    const prepTime = await this.getSellerPrepTime(delivery.sellerId)

    return {
      pickupLocation: delivery.pickupLocation,
      pickupStoreName: delivery.storeName,
      estimatedPickupTimeMin: Math.ceil((travelTime + prepTime) / 60),
      estimatedDeliveryTime: new Date(
        Date.now() + (travelTime + prepTime + 600) * 1000  // +10 min est
      ),
      estimatedDistanceKm: this.calculateDistance(
        driver.currentLocation,
        delivery.pickupLocation
      ),
      estimatedEarning: this.calculateDriverPayment(delivery)
    }
  }
}

// 2. Handle offer acceptance (driver clicks "Accept")
@Controller('drivers/:id/offers')
export class OfferController {
  constructor(
    private readonly offerService: OfferService,
    private readonly assignmentService: AssignmentService
  ) {}

  @Post(':offerId/accept')
  @UseGuards(AuthGuard, DriverGuard)
  async acceptOffer(
    @Param('offerId') offerId: string,
    @Param('id') driverId: string,
    @Body() body: { acceptedAt: Date }
  ) {
    // Update offer status
    const offer = await this.offerService.acceptOffer(offerId, driverId, body.acceptedAt)

    // Create assignment from accepted offer
    const assignment = await this.assignmentService.createFromOffer(offer)

    // Mark driver BUSY
    await this.driverService.updateStatus(driverId, 'BUSY')

    // Remove from GEO (Redis)
    await this.redis.zrem('drivers:geo', driverId)

    return { success: true, assignment }
  }

  @Post(':offerId/reject')
  @UseGuards(AuthGuard, DriverGuard)
  async rejectOffer(
    @Param('offerId') offerId: string,
    @Param('id') driverId: string,
    @Body() body: { reason?: string }
  ) {
    // Mark as rejected
    await this.offerService.rejectOffer(offerId, driverId, body.reason)

    // Trigger next candidate
    const offer = await this.offerService.getOffer(offerId)
    await this.assignmentService.offerNext(offer.deliveryId)

    return { success: true }
  }
}

// 3. Handle offer expiration (timeout after 30 sec)
// src/deliveries/jobs/offer-expiration.job.ts

@Injectable()
export class OfferExpirationJob {
  constructor(
    private readonly offerService: OfferService,
    private readonly assignmentService: AssignmentService
  ) {}

  @Cron('*/10 * * * * *')  // Every 10 seconds
  async handleExpiredOffers() {
    const expiredOffers = await this.offerService.findExpiredOffers()

    for (const offer of expiredOffers) {
      // Mark as expired
      offer.status = 'EXPIRED'
      await this.offerService.save(offer)

      // Auto-accept (fallback to old behavior)
      const assignment = await this.assignmentService.createFromOffer(offer)

      // Log for analytics
      logger.info('offer_expired_auto_accepted', {
        offerId: offer.id,
        deliveryId: offer.deliveryId,
        driverId: offer.driverId,
        responseTimeMs: null  // They didn't respond
      })
    }
  }
}
```

#### Database Migration

```sql
CREATE TABLE driver_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED, EXPIRED
  offer_payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  notification_sent_at TIMESTAMP,
  notification_method VARCHAR(20) DEFAULT 'push',
  driver_response_time_ms INTEGER,

  CREATED_INDEX idx_delivery_pending ON driver_offers(delivery_id) WHERE status = 'PENDING',
  INDEX idx_driver_pending ON driver_offers(driver_id) WHERE status = 'PENDING',
  INDEX idx_expires_at ON driver_offers(expires_at)
);

ALTER TABLE deliveries ADD COLUMN current_offer_id UUID REFERENCES driver_offers(id);
ALTER TABLE deliveries ADD COLUMN accepted_offer_id UUID REFERENCES driver_offers(id);
ALTER TABLE deliveries ADD COLUMN offer_acceptance_count INTEGER DEFAULT 0;
```

#### Testing Pattern

```typescript
describe('OfferService', () => {
  it('should create offer with correct payload', async () => {
    const delivery = createTestDelivery()
    const driver = createTestDriver()

    const offer = await offerService.createOfferForDriver(delivery, driver)

    expect(offer.status).toBe('PENDING')
    expect(offer.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(offer.offerPayload).toHaveProperty('estimatedEarning')
  })

  it('should handle offer acceptance', async () => {
    const offer = createTestOffer()
    await offerService.acceptOffer(offer.id, offer.driverId)

    const updated = await offerService.getOffer(offer.id)
    expect(updated.status).toBe('ACCEPTED')
    expect(updated.acceptedAt).toBeDefined()
  })

  it('should auto-accept after timeout', async () => {
    const offer = createTestOffer()
    offer.expiresAt = new Date(Date.now() - 1000)  // Expired

    await expirationJob.handleExpiredOffers()

    const updated = await offerService.getOffer(offer.id)
    expect(updated.status).toBe('EXPIRED')
    // Assignment should be created
  })
})
```

#### Day-1 Validation

```bash
# Test: Driver accepts offer
curl -X POST http://localhost:3001/drivers/driver-123/offers/offer-456/accept \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"acceptedAt": "2026-02-01T10:00:00Z"}'

# Result: Delivery assigned, driver status → BUSY
```

**Effort:** 3-5 days  
**Priority:** **P0** (implement first week of GA)

---

### Feature 1.2: Driver Availability States

**Why First:** Solves "driver taking lunch" problem immediately

#### Implementation Pattern

```typescript
// src/drivers/enums/availability.enum.ts
export enum DriverAvailability {
  AVAILABLE = 'available',
  ON_BREAK = 'on_break',
  SHIFT_ENDED = 'shift_ended',
  OFFLINE = 'offline',
  PAUSED = 'paused'
}

// src/drivers/services/availability.service.ts
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
      duration?: number  // in seconds, for breaks
      reason?: string
      actorId?: string
      actorType?: 'driver' | 'admin' | 'system'
    }
  ): Promise<void> {
    const driver = await this.db.drivers.findOne(driverId)
    const previousAvailability = driver.availability

    // Update database
    const availabilityUntil = options?.duration
      ? new Date(Date.now() + options.duration * 1000)
      : null

    await this.db.drivers.update(driverId, {
      availability: newAvailability,
      availabilityUntil,
      availabilityReason: options?.reason,
      lastAvailabilityChange: new Date()
    })

    // Update Redis (remove from GEO if not AVAILABLE)
    if (newAvailability !== DriverAvailability.AVAILABLE) {
      await this.redis.zrem('drivers:geo', driverId)
    } else {
      // Add back to GEO
      await this.redis.geoadd(
        'drivers:geo',
        driver.currentLat,
        driver.currentLon,
        driverId
      )
    }

    // Update status cache
    await this.redis.hset('drivers:status', driverId, newAvailability)

    // Log state transition
    await this.db.driverAvailabilityHistory.create({
      driverId,
      fromState: previousAvailability,
      toState: newAvailability,
      reason: options?.reason,
      actorId: options?.actorId,
      actorType: options?.actorType || 'system',
      timestamp: new Date()
    })

    this.logger.info('driver_availability_changed', {
      driverId,
      from: previousAvailability,
      to: newAvailability,
      reason: options?.reason
    })
  }

  async handleBreakExpiration(): Promise<void> {
    // Find all drivers with expired breaks
    const expiredBreaks = await this.db.drivers.find({
      availability: DriverAvailability.ON_BREAK,
      availabilityUntil: { $lt: new Date() }
    })

    for (const driver of expiredBreaks) {
      await this.updateAvailability(
        driver.id,
        DriverAvailability.AVAILABLE,
        {
          reason: 'break_expired',
          actorType: 'system'
        }
      )
    }
  }
}

// src/drivers/controllers/availability.controller.ts
@Controller('drivers/:id/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post('take-break')
  @UseGuards(AuthGuard, DriverGuard)
  async takeBreak(
    @Param('id') driverId: string,
    @Body() body: { durationMinutes: number; reason?: string }
  ) {
    if (body.durationMinutes < 5 || body.durationMinutes > 120) {
      throw new BadRequestException('Break must be 5-120 minutes')
    }

    await this.availabilityService.updateAvailability(
      driverId,
      DriverAvailability.ON_BREAK,
      {
        duration: body.durationMinutes * 60,
        reason: body.reason || 'driver_requested',
        actorId: driverId,
        actorType: 'driver'
      }
    )

    return {
      status: 'on_break',
      breakUntil: new Date(Date.now() + body.durationMinutes * 60 * 1000)
    }
  }

  @Post('end-shift')
  @UseGuards(AuthGuard, DriverGuard)
  async endShift(@Param('id') driverId: string) {
    await this.availabilityService.updateAvailability(
      driverId,
      DriverAvailability.SHIFT_ENDED,
      {
        reason: 'driver_shift_end',
        actorId: driverId,
        actorType: 'driver'
      }
    )

    return { status: 'shift_ended' }
  }

  @Post('resume')
  @UseGuards(AuthGuard, DriverGuard)
  async resumeWork(@Param('id') driverId: string) {
    await this.availabilityService.updateAvailability(
      driverId,
      DriverAvailability.AVAILABLE,
      {
        reason: 'driver_resumed',
        actorId: driverId,
        actorType: 'driver'
      }
    )

    return { status: 'available' }
  }
}

// Cron job to handle break expiration
@Injectable()
export class AvailabilityMaintenanceJob {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Cron('*/1 * * * *')  // Every minute
  async handleExpirations() {
    await this.availabilityService.handleBreakExpiration()
  }
}
```

#### Database Migration

```sql
ALTER TABLE drivers ADD COLUMN availability VARCHAR(20) DEFAULT 'available';
ALTER TABLE drivers ADD COLUMN availability_until TIMESTAMP;
ALTER TABLE drivers ADD COLUMN availability_reason VARCHAR(255);

CREATE TABLE driver_availability_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  from_state VARCHAR(20) NOT NULL,
  to_state VARCHAR(20) NOT NULL,
  reason VARCHAR(255),
  actor_id UUID,
  actor_type VARCHAR(20),
  timestamp TIMESTAMP NOT NULL DEFAULT now(),
  INDEX idx_driver_timestamp ON driver_availability_history(driver_id, timestamp)
);
```

**Effort:** 2-3 days  
**Priority:** **P0** (implement week 1)

---

### Feature 1.3: Silent Failure Escalation

**Why First:** Ops will start calling you asking "Why isn't this order assigned?"

#### Implementation Pattern

```typescript
// src/deliveries/services/escalation.service.ts
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
      status: 'READY',  // No assignment yet
      createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
    })

    for (const order of unassignedOrders) {
      const unassignedRecord = await this.db.unassignedOrders.findOne({
        deliveryId: order.id
      })

      if (!unassignedRecord) {
        // First time we've noticed this
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
        })

        this.logger.warn('unassigned_order_detected', {
          deliveryId: order.id,
          minutesSinceCreation: 5
        })
      } else {
        // Update existing record
        const minutesUnassigned = (Date.now() - order.createdAt.getTime()) / 60000

        if (minutesUnassigned > 5 && unassignedRecord.escalationLevel < 1) {
          // 5 min milestone: Create support ticket
          await this.escalateToLevel1(unassignedRecord)
        } else if (minutesUnassigned > 15 && unassignedRecord.escalationLevel < 2) {
          // 15 min milestone: Retry with relaxed constraints
          await this.escalateToLevel2(unassignedRecord)
        } else if (minutesUnassigned > 30 && unassignedRecord.escalationLevel < 3) {
          // 30 min milestone: Cancel or escalate to support
          await this.escalateToLevel3(unassignedRecord)
        }
      }
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
    })

    // Notify ops team
    await this.notificationService.notifyOps({
      message: `⚠️ Order unassigned: ${unassignedRecord.sellerOrderId}`,
      severity: 'warning',
      link: `/admin/unassigned-orders/${unassignedRecord.deliveryId}`
    })

    // Update escalation
    await this.db.unassignedOrders.update(unassignedRecord.id, {
      escalationLevel: 1,
      supportTicketId: ticket.id,
      notificationSentAt: new Date()
    })
  }

  private async escalateToLevel2(unassignedRecord: UnassignedOrder): Promise<void> {
    // Retry with wider radius (10km instead of 5km)
    const delivery = await this.db.deliveries.findOne(unassignedRecord.deliveryId)

    try {
      await this.assignmentService.assignNearestDriver(delivery, {
        maxRadiusKm: 10,
        reason: 'escalation_wide_search'
      })

      // If successful, mark as resolved
      await this.db.unassignedOrders.update(unassignedRecord.id, {
        escalationLevel: 2,
        escalationStatus: 'REASSIGNED'
      })

      this.logger.info('escalation_reassignment_success', {
        deliveryId: delivery.id
      })
    } catch (error) {
      // Still no drivers, move to level 3
      await this.escalateToLevel3(unassignedRecord)
    }
  }

  private async escalateToLevel3(unassignedRecord: UnassignedOrder): Promise<void> {
    // 30 min: Critical level, needs immediate attention
    await this.notificationService.notifyOps({
      message: `🚨 CRITICAL: Order ${unassignedRecord.sellerOrderId} unassigned for 30+ min`,
      severity: 'critical',
      link: `/admin/unassigned-orders/${unassignedRecord.deliveryId}`
    })

    // Update escalation
    await this.db.unassignedOrders.update(unassignedRecord.id, {
      escalationLevel: 3,
      notificationSentAt: new Date()
    })
  }
}

// Cron job: Run every 2 minutes
@Injectable()
export class UnassignedOrderCheckJob {
  constructor(private readonly escalationService: EscalationService) {}

  @Cron('*/2 * * * *')
  async check() {
    await this.escalationService.checkUnassignedOrders()
  }
}
```

#### Database Migration

```sql
CREATE TABLE unassigned_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id),
  seller_order_id VARCHAR(255),
  location POINT,
  failure_reason VARCHAR(100),
  first_attempt_at TIMESTAMP NOT NULL,
  last_attempt_at TIMESTAMP NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  escalation_level INTEGER DEFAULT 0,
  escalation_status VARCHAR(50) DEFAULT 'PENDING',
  support_ticket_id VARCHAR(255),
  notification_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  INDEX idx_escalation_level ON unassigned_orders(escalation_level),
  INDEX idx_delivery_id ON unassigned_orders(delivery_id)
);
```

**Effort:** 2-3 days  
**Priority:** **P0** (implement week 1)

---

## Quick Implementation Checklist

### Week 1 Post-GA (Day 1-5)

- [ ] **Feature 1.1: Offer + Accept**
  - [ ] Database migration
  - [ ] OfferService implementation
  - [ ] OfferController endpoints
  - [ ] Driver app integration (push notifications)
  - [ ] Unit tests
  - [ ] Deploy to production

- [ ] **Feature 1.2: Availability States**
  - [ ] Enum definition
  - [ ] Database migration
  - [ ] AvailabilityService
  - [ ] API endpoints (take-break, end-shift, resume)
  - [ ] Cron job for break expiration
  - [ ] Unit tests
  - [ ] Deploy

- [ ] **Feature 1.3: Escalation**
  - [ ] Database table
  - [ ] EscalationService
  - [ ] Cron job
  - [ ] Notification system integration
  - [ ] Admin dashboard updates (show unassigned orders)
  - [ ] Unit tests
  - [ ] Deploy

### Week 2 Post-GA (Day 6-10)

- [ ] **Feature 1.4: Manual Reassignment API**
  - [ ] POST /admin/assignments/:id/reassign endpoint
  - [ ] Trigger new assignment search
  - [ ] Log reassignment reason
  - [ ] Support dashboard integration

- [ ] **Monitoring & Alerts**
  - [ ] Track offer acceptance rate
  - [ ] Alert if > 20% offers rejected
  - [ ] Monitor unassigned order count
  - [ ] Alert if unassigned > 10

- [ ] **Bug Fixes & Tuning**
  - [ ] Adjust offer timeout based on real data
  - [ ] Tune escalation thresholds
  - [ ] Performance optimization if needed

---

## Testing Checklist (Per Feature)

### Feature 1.1: Offer + Accept

```bash
# Test 1: Offer creation
✓ POST /deliveries/:id/assign → creates offer, sends notification
✓ Offer appears in driver app within 2 seconds
✓ Offer expires after 30 seconds

# Test 2: Driver accepts
✓ POST /drivers/:id/offers/:offerId/accept → driver marked BUSY
✓ Driver removed from Redis GEO
✓ Assignment created with correct driver
✓ Notification sent to customer

# Test 3: Driver rejects
✓ POST /drivers/:id/offers/:offerId/reject → next driver gets offer
✓ Rejection reason logged
✓ No assignment created yet

# Test 4: Offer timeout
✓ After 30 sec with no response → auto-accept
✓ Assignment created automatically
✓ No errors in logs
```

---

## Logs to Instrument (from Day 1)

```typescript
// Metrics to track
logger.info('offer_created', {
  deliveryId, driverId, offerId, expiresAt
})

logger.info('offer_accepted', {
  offerId, driverId, responseTimeMs
})

logger.info('offer_rejected', {
  offerId, driverId, reason, responseTimeMs
})

logger.info('offer_expired', {
  offerId, driverId
})

logger.info('availability_changed', {
  driverId, from, to, reason, durationSeconds?
})

logger.warn('unassigned_order_5min', {
  deliveryId, minutesSinceCreation: 5
})

logger.error('unassigned_order_30min', {
  deliveryId, minutesSinceCreation: 30
})
```

---

## Production Readiness Checklist

Before deploying to production:

- [ ] All 3 Phase 1 features implemented and tested
- [ ] Database migrations tested on staging
- [ ] Cron jobs verified (no duplicate triggers)
- [ ] Notification service tested (offers delivered within 1 sec)
- [ ] Redis keys validated (no conflicts)
- [ ] Logs structured and parseable
- [ ] Admin dashboards updated
- [ ] Support team trained on new features
- [ ] Runbooks written for failure scenarios

---

## Success Metrics (Track from Day 1)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Offer acceptance rate | > 80% | count accepts / offers sent |
| Offer response time (avg) | < 10 sec | from offer sent to accept/reject |
| Unassigned orders (5 min) | < 5% | unassigned > 5 min / total |
| Support calls about assignment | < 10/day | manual count or ticket tracking |
| Driver satisfaction | +10% | survey post-offer workflow |

---

**This is your roadmap for Week 1-2 post-GA. Execute these features, and Day 1 pain points vanish.**
