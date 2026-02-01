# V2 Testing & Validation: Comprehensive Quality Assurance

**Date:** February 1, 2026  
**Status:** Testing Strategy Phase  
**Scope:** Complete testing strategy and validation approach for ADR-024 through ADR-031

## Table of Contents

1. [Testing Strategy Overview](#testing-strategy-overview)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Load & Performance Testing](#load--performance-testing)
6. [Contract Testing](#contract-testing)
7. [Security Testing](#security-testing)
8. [Data Validation](#data-validation)
9. [Monitoring & Observability](#monitoring--observability)
10. [Testing Infrastructure](#testing-infrastructure)

---

## Testing Strategy Overview

### Testing Pyramid for V2 Features

```
                    ┌─────────────────────────────────┐
                    │     E2E Tests (10%)             │
                    │  • Complete user workflows      │
                    │  • Cross-service integration    │
                    │  • Business scenario validation │
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
                    │   Integration Tests (30%)       │
                    │  • Service-to-service calls     │
                    │  • Database integration         │
                    │  • External API contracts       │
                    │  • Message queue validation     │
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
                    │    Unit Tests (60%)             │
                    │  • Individual service logic     │
                    │  • Business rule validation     │
                    │  • Error handling               │
                    │  • Data transformation          │
                    └─────────────────────────────────┘
```

### Testing Principles

1. **Test-Driven Development (TDD):** Write tests before implementation
2. **Behavior-Driven Development (BDD):** Focus on business behavior and outcomes
3. **Contract Testing:** Ensure API contracts are maintained
4. **Property-Based Testing:** Test with generated data for edge cases
5. **Chaos Engineering:** Test system resilience under failure conditions

### Test Environment Strategy

```yaml
# Environment Configuration
test_environments:
  unit:
    - isolated_service_units
    - mock_dependencies
    - fast_execution
    
  integration:
    - service_composition
    - real_database
    - mock_external_apis
    - medium_execution_time
    
  e2e:
    - full_system_stack
    - real_external_services
    - production_like_data
    - slow_execution_time
    
  performance:
    - load_testing
    - stress_testing
    - endurance_testing
    - spike_testing
```

---

## Unit Testing

### Core Service Unit Tests

#### Driver Offer Service Tests

```typescript
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

    it('should calculate offer payload correctly', async () => {
      // Arrange
      const delivery = createTestDelivery({
        pickupLocation: { lat: 12.9, lon: 77.6 },
        storeName: 'Test Store'
      });
      const driver = createTestDriver({
        currentLocation: { lat: 12.91, lon: 77.61 }
      });

      // Mock distance calculation
      jest.spyOn(offerService as any, 'calculateDistance').mockReturnValue(2.5);
      jest.spyOn(offerService as any, 'calculateTravelTime').mockResolvedValue(600); // 10 minutes
      jest.spyOn(offerService as any, 'getSellerPrepTime').mockResolvedValue(300); // 5 minutes
      jest.spyOn(offerService as any, 'calculateDriverPayment').mockReturnValue(150.0);

      // Act
      const payload = await (offerService as any).calculateOfferPayload(delivery, driver);

      // Assert
      expect(payload).toEqual({
        pickupLocation: delivery.pickupLocation,
        pickupStoreName: delivery.storeName,
        estimatedPickupTimeMin: 15, // (600 + 300) / 60
        estimatedDeliveryTime: expect.any(Date),
        estimatedDistanceKm: 2.5,
        estimatedEarning: 150.0
      });
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const delivery = createTestDelivery();
      const driver = createTestDriver();
      
      const mockOffer = createTestOffer();
      db.driverOffers.create.mockResolvedValue(mockOffer);
      notificationService.sendOffer.mockResolvedValue();
      redisService.setex.mockRejectedValue(new Error('Redis connection failed'));

      // Act & Assert
      // Should still succeed even if Redis fails
      const result = await offerService.createOfferForDriver(delivery, driver);
      expect(result).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        'redis_error',
        expect.objectContaining({
          error: 'Redis connection failed',
          offerId: mockOffer.id
        })
      );
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

    it('should throw error if offer already processed', async () => {
      // Arrange
      const offer = createTestOffer();
      offer.status = 'ACCEPTED';
      db.driverOffers.findOne.mockResolvedValue(offer);

      // Act & Assert
      await expect(
        offerService.acceptOffer(offer.id, offer.driverId, new Date())
      ).rejects.toThrow(OfferAlreadyProcessedException);
    });

    it('should handle assignment creation failure', async () => {
      // Arrange
      const offer = createTestOffer();
      const acceptedAt = new Date();

      db.driverOffers.findOne.mockResolvedValue(offer);
      db.driverOffers.update.mockResolvedValue();
      assignmentService.createFromOffer.mockRejectedValue(new Error('Assignment failed'));
      driverService.updateStatus.mockResolvedValue();
      redisService.zrem.mockResolvedValue();

      // Act & Assert
      await expect(
        offerService.acceptOffer(offer.id, offer.driverId, acceptedAt)
      ).rejects.toThrow('Assignment failed');

      // Verify partial rollback
      expect(driverService.updateStatus).not.toHaveBeenCalled();
      expect(redisService.zrem).not.toHaveBeenCalled();
    });
  });

  describe('rejectOffer', () => {
    it('should reject offer and trigger next candidate', async () => {
      // Arrange
      const offer = createTestOffer();
      const reason = 'too_far';

      db.driverOffers.findOne.mockResolvedValue(offer);
      db.driverOffers.update.mockResolvedValue();
      jest.spyOn(offerService, 'triggerNextCandidate').mockResolvedValue();

      // Act
      const result = await offerService.rejectOffer(offer.id, offer.driverId, reason);

      // Assert
      expect(result.status).toBe('REJECTED');
      expect(result.rejectedAt).toBeDefined();
      expect(result.rejectionReason).toBe(reason);
      expect(db.driverOffers.update).toHaveBeenCalledWith(offer.id, expect.objectContaining({
        status: 'REJECTED',
        rejectedAt: expect.any(Date),
        rejectionReason: reason
      }));
      expect(offerService.triggerNextCandidate).toHaveBeenCalledWith(offer.deliveryId);
    });

    it('should handle triggerNextCandidate failure gracefully', async () => {
      // Arrange
      const offer = createTestOffer();
      const reason = 'too_far';

      db.driverOffers.findOne.mockResolvedValue(offer);
      db.driverOffers.update.mockResolvedValue();
      jest.spyOn(offerService, 'triggerNextCandidate').mockRejectedValue(new Error('Trigger failed'));

      // Act
      const result = await offerService.rejectOffer(offer.id, offer.driverId, reason);

      // Assert
      expect(result.status).toBe('REJECTED');
      expect(logger.error).toHaveBeenCalledWith(
        'trigger_next_candidate_failed',
        expect.objectContaining({
          error: 'Trigger failed',
          deliveryId: offer.deliveryId
        })
      );
    });
  });
});
```

#### Availability Service Tests

```typescript
describe('AvailabilityService', () => {
  let availabilityService: AvailabilityService;
  let db: MockProxy<DatabaseService>;
  let redisService: MockProxy<RedisService>;
  let logger: MockProxy<LoggerService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: DatabaseService,
          useValue: mock<DatabaseService>()
        },
        {
          provide: RedisService,
          useValue: mock<RedisService>()
        },
        {
          provide: LoggerService,
          useValue: mock<LoggerService>()
        }
      ]
    }).compile();

    availabilityService = module.get<AvailabilityService>(AvailabilityService);
    db = module.get(DatabaseService);
    redisService = module.get(RedisService);
    logger = module.get(LoggerService);
  });

  describe('updateAvailability', () => {
    it('should update availability and remove from Redis GEO', async () => {
      // Arrange
      const driverId = 'driver-123';
      const driver = createTestDriver({
        availability: 'AVAILABLE',
        currentLat: 12.9,
        currentLon: 77.6
      });

      db.drivers.findOne.mockResolvedValue(driver);
      db.drivers.update.mockResolvedValue();
      redisService.zrem.mockResolvedValue();
      redisService.hset.mockResolvedValue();
      db.driverAvailabilityHistory.create.mockResolvedValue();

      // Act
      await availabilityService.updateAvailability(
        driverId,
        'ON_BREAK',
        { duration: 1800, reason: 'lunch_break' }
      );

      // Assert
      expect(db.drivers.update).toHaveBeenCalledWith(driverId, expect.objectContaining({
        availability: 'ON_BREAK',
        availabilityUntil: expect.any(Date),
        availabilityReason: 'lunch_break',
        lastAvailabilityChange: expect.any(Date),
        availabilityChangeActor: undefined,
        availabilityChangeActorType: 'system'
      }));
      expect(redisService.zrem).toHaveBeenCalledWith('drivers:geo', driverId);
      expect(redisService.hset).toHaveBeenCalledWith('drivers:status', driverId, 'ON_BREAK');
      expect(db.driverAvailabilityHistory.create).toHaveBeenCalledWith(expect.objectContaining({
        driverId,
        fromState: 'AVAILABLE',
        toState: 'ON_BREAK',
        reason: 'lunch_break',
        actorType: 'system'
      }));
    });

    it('should add driver back to Redis GEO when becoming available', async () => {
      // Arrange
      const driverId = 'driver-123';
      const driver = createTestDriver({
        availability: 'ON_BREAK',
        currentLat: 12.9,
        currentLon: 77.6
      });

      db.drivers.findOne.mockResolvedValue(driver);
      db.drivers.update.mockResolvedValue();
      redisService.geoadd.mockResolvedValue();
      redisService.hset.mockResolvedValue();
      db.driverAvailabilityHistory.create.mockResolvedValue();

      // Act
      await availabilityService.updateAvailability(
        driverId,
        'AVAILABLE'
      );

      // Assert
      expect(redisService.geoadd).toHaveBeenCalledWith(
        'drivers:geo',
        driver.currentLat,
        driver.currentLon,
        driverId
      );
      expect(redisService.hset).toHaveBeenCalledWith('drivers:status', driverId, 'AVAILABLE');
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const driverId = 'driver-123';
      const driver = createTestDriver();

      db.drivers.findOne.mockResolvedValue(driver);
      db.drivers.update.mockResolvedValue();
      redisService.zrem.mockRejectedValue(new Error('Redis error'));
      redisService.hset.mockResolvedValue();
      db.driverAvailabilityHistory.create.mockResolvedValue();

      // Act
      await availabilityService.updateAvailability(driverId, 'ON_BREAK');

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'redis_error',
        expect.objectContaining({
          error: 'Redis error',
          driverId
        })
      );
      // Should continue with other operations
      expect(redisService.hset).toHaveBeenCalledWith('drivers:status', driverId, 'ON_BREAK');
    });
  });

  describe('handleBreakExpiration', () => {
    it('should resume drivers with expired breaks', async () => {
      // Arrange
      const expiredBreaks = [
        createTestDriver({ availability: 'ON_BREAK', availabilityUntil: new Date(Date.now() - 60000) }),
        createTestDriver({ availability: 'ON_BREAK', availabilityUntil: new Date(Date.now() - 120000) })
      ];

      db.drivers.find.mockResolvedValue(expiredBreaks);
      jest.spyOn(availabilityService, 'updateAvailability').mockResolvedValue();
      jest.spyOn(availabilityService, 'sendBreakExpiredNotification').mockResolvedValue();

      // Act
      await availabilityService.handleBreakExpiration();

      // Assert
      expect(db.drivers.find).toHaveBeenCalledWith({
        availability: 'ON_BREAK',
        availabilityUntil: { $lt: expect.any(Date) }
      });

      expect(availabilityService.updateAvailability).toHaveBeenCalledTimes(2);
      expect(availabilityService.updateAvailability).toHaveBeenCalledWith(
        expiredBreaks[0].id,
        'AVAILABLE',
        expect.objectContaining({
          reason: 'break_expired',
          actorType: 'system'
        })
      );

      expect(availabilityService.sendBreakExpiredNotification).toHaveBeenCalledTimes(2);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      db.drivers.find.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(
        availabilityService.handleBreakExpiration()
      ).rejects.toThrow('Database error');
    });
  });
});
```

#### Escalation Service Tests

```typescript
describe('EscalationService', () => {
  let escalationService: EscalationService;
  let db: MockProxy<DatabaseService>;
  let notificationService: MockProxy<NotificationService>;
  let supportService: MockProxy<SupportService>;
  let logger: MockProxy<LoggerService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EscalationService,
        {
          provide: DatabaseService,
          useValue: mock<DatabaseService>()
        },
        {
          provide: NotificationService,
          useValue: mock<NotificationService>()
        },
        {
          provide: SupportService,
          useValue: mock<SupportService>()
        },
        {
          provide: LoggerService,
          useValue: mock<LoggerService>()
        }
      ]
    }).compile();

    escalationService = module.get<EscalationService>(EscalationService);
    db = module.get(DatabaseService);
    notificationService = module.get(NotificationService);
    supportService = module.get(SupportService);
    logger = module.get(LoggerService);
  });

  describe('checkUnassignedOrders', () => {
    it('should detect and escalate unassigned orders', async () => {
      // Arrange
      const unassignedOrders = [
        createTestDelivery({ 
          status: 'READY',
          createdAt: new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
        }),
        createTestDelivery({
          status: 'READY', 
          createdAt: new Date(Date.now() - 16 * 60 * 1000) // 16 minutes ago
        })
      ];

      db.deliveries.find.mockResolvedValue(unassignedOrders);
      db.unassignedOrders.findOne.mockResolvedValue(null); // First time detection
      jest.spyOn(escalationService, 'createUnassignedRecord').mockResolvedValue();

      // Act
      await escalationService.checkUnassignedOrders();

      // Assert
      expect(db.deliveries.find).toHaveBeenCalledWith({
        status: 'READY',
        createdAt: { $lt: expect.any(Date) }
      });

      expect(escalationService.createUnassignedRecord).toHaveBeenCalledTimes(2);
      expect(escalationService.createUnassignedRecord).toHaveBeenCalledWith(unassignedOrders[0]);
      expect(escalationService.createUnassignedRecord).toHaveBeenCalledWith(unassignedOrders[1]);
    });

    it('should handle existing unassigned orders', async () => {
      // Arrange
      const order = createTestDelivery({
        status: 'READY',
        createdAt: new Date(Date.now() - 6 * 60 * 1000)
      });

      const unassignedRecord = createTestUnassignedOrder({
        deliveryId: order.id,
        escalationLevel: 0,
        lastAttemptAt: new Date(Date.now() - 5 * 60 * 1000)
      });

      db.deliveries.find.mockResolvedValue([order]);
      db.unassignedOrders.findOne.mockResolvedValue(unassignedRecord);
      jest.spyOn(escalationService, 'handleExistingUnassignedRecord').mockResolvedValue();

      // Act
      await escalationService.checkUnassignedOrders();

      // Assert
      expect(escalationService.handleExistingUnassignedRecord).toHaveBeenCalledWith(unassignedRecord);
    });
  });

  describe('escalateToLevel1', () => {
    it('should create support ticket and notify ops', async () => {
      // Arrange
      const unassignedRecord = createTestUnassignedOrder({
        deliveryId: 'delivery-123',
        sellerOrderId: 'ORD-456',
        location: { lat: 12.9, lon: 77.6 }
      });

      const mockTicket = {
        id: 'ticket-123',
        type: 'unassigned_delivery',
        priority: 'high'
      };

      supportService.createTicket.mockResolvedValue(mockTicket);
      notificationService.notifyOps.mockResolvedValue();
      db.unassignedOrders.update.mockResolvedValue();
      jest.spyOn(escalationService, 'logAuditEvent').mockResolvedValue();

      // Act
      await escalationService.escalateToLevel1(unassignedRecord);

      // Assert
      expect(supportService.createTicket).toHaveBeenCalledWith({
        type: 'unassigned_delivery',
        priority: 'high',
        title: `Order ${unassignedRecord.sellerOrderId} unassigned for 5+ minutes`,
        description: expect.stringContaining(unassignedRecord.deliveryId),
        zone: unassignedRecord.location,
        actionUrl: `/admin/orders/${unassignedRecord.sellerOrderId}`
      });

      expect(notificationService.notifyOps).toHaveBeenCalledWith({
        message: `⚠️ Order unassigned: ${unassignedRecord.sellerOrderId}`,
        severity: 'warning',
        link: `/admin/unassigned-orders/${unassignedRecord.deliveryId}`
      });

      expect(db.unassignedOrders.update).toHaveBeenCalledWith(unassignedRecord.id, expect.objectContaining({
        escalationLevel: 1,
        supportTicketId: mockTicket.id,
        notificationSentAt: expect.any(Date)
      }));

      expect(escalationService.logAuditEvent).toHaveBeenCalledWith(
        unassignedRecord.deliveryId,
        'escalation_triggered',
        expect.objectContaining({
          level: 1,
          reason: '5_min_unassigned',
          ticketId: mockTicket.id
        })
      );
    });
  });

  describe('escalateToLevel2', () => {
    it('should retry assignment with wider radius', async () => {
      // Arrange
      const unassignedRecord = createTestUnassignedOrder();
      const delivery = createTestDelivery({ id: unassignedRecord.deliveryId });

      db.deliveries.findOne.mockResolvedValue(delivery);
      jest.spyOn(escalationService, 'assignmentService').mockResolvedValue(createTestAssignment());
      db.unassignedOrders.update.mockResolvedValue();
      jest.spyOn(escalationService, 'logAuditEvent').mockResolvedValue();

      // Act
      await escalationService.escalateToLevel2(unassignedRecord);

      // Assert
      expect(escalationService.assignmentService).toHaveBeenCalledWith(delivery, {
        maxRadiusKm: 10,
        reason: 'escalation_wide_search'
      });

      expect(db.unassignedOrders.update).toHaveBeenCalledWith(unassignedRecord.id, expect.objectContaining({
        escalationLevel: 2,
        escalationStatus: 'REASSIGNED'
      }));
    });

    it('should escalate to level 3 if retry fails', async () => {
      // Arrange
      const unassignedRecord = createTestUnassignedOrder();
      const delivery = createTestDelivery({ id: unassignedRecord.deliveryId });

      db.deliveries.findOne.mockResolvedValue(delivery);
      jest.spyOn(escalationService, 'assignmentService').mockRejectedValue(new Error('No drivers found'));
      jest.spyOn(escalationService, 'escalateToLevel3').mockResolvedValue();

      // Act
      await escalationService.escalateToLevel2(unassignedRecord);

      // Assert
      expect(escalationService.escalateToLevel3).toHaveBeenCalledWith(unassignedRecord);
    });
  });
});
```

### Property-Based Testing

```typescript
// Property-based tests using fast-check
import fc from 'fast-check';

describe('Offer Service Properties', () => {
  let offerService: OfferService;

  describe('Offer Creation Properties', () => {
    it('should always create offers with valid expiration times', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 10, max: 120 }),
          (deliveryId, driverId, expiresInSeconds) => {
            const delivery = createTestDelivery({ id: deliveryId });
            const driver = createTestDriver({ id: driverId });

            return offerService.createOfferForDriver(delivery, driver, expiresInSeconds)
              .then(offer => {
                const now = new Date();
                const expiresAt = new Date(offer.expiresAt);
                const expectedExpiration = new Date(now.getTime() + expiresInSeconds * 1000);

                // Allow 1 second tolerance for timing
                expect(expiresAt.getTime()).toBeCloseTo(expectedExpiration.getTime(), -1000);
                expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
              });
          }
        )
      );
    });

    it('should always create offers with positive estimated times', () => {
      fc.assert(
        fc.property(
          fc.record({
            lat: fc.float({ min: -90, max: 90 }),
            lon: fc.float({ min: -180, max: 180 })
          }),
          fc.record({
            lat: fc.float({ min: -90, max: 90 }),
            lon: fc.float({ min: -180, max: 180 })
          }),
          (driverLocation, pickupLocation) => {
            const delivery = createTestDelivery({ pickupLocation });
            const driver = createTestDriver({ currentLocation: driverLocation });

            return offerService.createOfferForDriver(delivery, driver)
              .then(offer => {
                expect(offer.offerPayload.estimatedPickupTimeMin).toBeGreaterThan(0);
                expect(offer.offerPayload.estimatedDistanceKm).toBeGreaterThan(0);
                expect(offer.offerPayload.estimatedEarning).toBeGreaterThan(0);
              });
          }
        )
      );
    });
  });

  describe('Assignment Properties', () => {
    it('should maintain driver availability consistency', () => {
      fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.boolean(),
          async (driverId, deliveryId, shouldAccept) => {
            const driver = createTestDriver({ id: driverId, availability: 'AVAILABLE' });
            const delivery = createTestDelivery({ id: deliveryId, status: 'READY' });
            const offer = createTestOffer({ driverId, deliveryId });

            // Create offer
            await offerService.createOfferForDriver(delivery, driver);

            if (shouldAccept) {
              // Accept offer
              await offerService.acceptOffer(offer.id, driverId, new Date());
              
              // Driver should be BUSY
              const updatedDriver = await offerService.getDriver(driverId);
              expect(updatedDriver.availability).toBe('BUSY');
            } else {
              // Reject offer
              await offerService.rejectOffer(offer.id, driverId, 'too_far');
              
              // Driver should remain AVAILABLE
              const updatedDriver = await offerService.getDriver(driverId);
              expect(updatedDriver.availability).toBe('AVAILABLE');
            }
          }
        )
      );
    });
  });
});
```

### Error Handling Tests

```typescript
describe('Error Handling', () => {
  let offerService: OfferService;
  let db: MockProxy<DatabaseService>;

  describe('Database Error Recovery', () => {
    it('should handle database connection failures', async () => {
      // Arrange
      const delivery = createTestDelivery();
      const driver = createTestDriver();

      db.driverOffers.create.mockRejectedValue(new Error('Connection timeout'));

      // Act & Assert
      await expect(
        offerService.createOfferForDriver(delivery, driver)
      ).rejects.toThrow('Connection timeout');
    });

    it('should handle partial failures gracefully', async () => {
      // Arrange
      const delivery = createTestDelivery();
      const driver = createTestDriver();
      
      const mockOffer = createTestOffer();
      db.driverOffers.create.mockResolvedValue(mockOffer);
      notificationService.sendOffer.mockRejectedValue(new Error('Notification failed'));
      redisService.setex.mockResolvedValue();

      // Act
      const result = await offerService.createOfferForDriver(delivery, driver);

      // Assert
      expect(result).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        'notification_failed',
        expect.objectContaining({
          error: 'Notification failed',
          offerId: mockOffer.id
        })
      );
    });
  });

  describe('Business Rule Validation', () => {
    it('should validate offer acceptance rules', async () => {
      // Arrange
      const offer = createTestOffer();
      offer.status = 'EXPIRED';

      db.driverOffers.findOne.mockResolvedValue(offer);

      // Act & Assert
      await expect(
        offerService.acceptOffer(offer.id, offer.driverId, new Date())
      ).rejects.toThrow(OfferAlreadyProcessedException);
    });

    it('should validate driver availability rules', async () => {
      // Arrange
      const delivery = createTestDelivery();
      const driver = createTestDriver();
      driver.availability = 'BUSY';

      // Act & Assert
      await expect(
        offerService.createOfferForDriver(delivery, driver)
      ).rejects.toThrow(DriverNotAvailableException);
    });

    it('should validate delivery status rules', async () => {
      // Arrange
      const delivery = createTestDelivery();
      delivery.status = 'ASSIGNED';

      const driver = createTestDriver();

      // Act & Assert
      await expect(
        offerService.createOfferForDriver(delivery, driver)
      ).rejects.toThrow(DeliveryAlreadyAssignedException);
    });
  });

  describe('Concurrency Handling', () => {
    it('should handle concurrent offer acceptances', async () => {
      // Arrange
      const offer = createTestOffer();
      offer.status = 'PENDING';

      db.driverOffers.findOne.mockResolvedValue(offer);
      db.driverOffers.update.mockImplementation((id, data) => {
        if (offer.status !== 'PENDING') {
          throw new Error('Offer already processed');
        }
        offer.status = data.status;
        return Promise.resolve();
      });

      // Act
      const promises = [
        offerService.acceptOffer(offer.id, offer.driverId, new Date()),
        offerService.acceptOffer(offer.id, offer.driverId, new Date())
      ];

      // Assert
      const results = await Promise.allSettled(promises);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    });
  });
});
```

---

## Integration Testing

### Service-to-Service Integration Tests

```typescript
describe('Driver Service Integration', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let redisService: RedisService;
  let offerService: OfferService;
  let availabilityService: AvailabilityService;
  let escalationService: EscalationService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        DriverModule,
        DatabaseModule.forRoot({
          type: 'postgres',
          host: process.env.TEST_DB_HOST,
          port: parseInt(process.env.TEST_DB_PORT || '5432'),
          username: process.env.TEST_DB_USERNAME,
          password: process.env.TEST_DB_PASSWORD,
          database: process.env.TEST_DB_NAME,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true
        }),
        RedisModule.forRoot({
          host: process.env.TEST_REDIS_HOST,
          port: parseInt(process.env.TEST_REDIS_PORT || '6379')
        })
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    db = moduleFixture.get<DatabaseService>(DatabaseService);
    redisService = moduleFixture.get<RedisService>(RedisService);
    offerService = moduleFixture.get<OfferService>(OfferService);
    availabilityService = moduleFixture.get<AvailabilityService>(AvailabilityService);
    escalationService = moduleFixture.get<EscalationService>(EscalationService);

    await app.init();
    await db.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Assignment Flow', () => {
    it('should handle complete driver assignment workflow', async () => {
      // 1. Setup test data
      const driver = await createTestDriver({ availability: 'AVAILABLE' });
      const delivery = await createTestDelivery({ status: 'READY' });

      // 2. Verify driver is in Redis GEO
      const driversInGeo = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversInGeo).toContain(driver.id);

      // 3. Create offer
      const offer = await offerService.createOfferForDriver(delivery, driver);

      expect(offer.status).toBe('PENDING');
      expect(offer.offerPayload).toBeDefined();
      expect(offer.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // 4. Verify offer in Redis
      const offerInRedis = await redisService.get(`offer:${offer.id}`);
      expect(offerInRedis).toBeDefined();

      // 5. Accept offer
      const acceptedAt = new Date();
      const acceptedOffer = await offerService.acceptOffer(offer.id, driver.id, acceptedAt);

      expect(acceptedOffer.status).toBe('ACCEPTED');
      expect(acceptedOffer.acceptedAt).toEqual(acceptedAt);

      // 6. Verify driver marked BUSY
      const updatedDriver = await db.drivers.findOne(driver.id);
      expect(updatedDriver.availability).toBe('BUSY');

      // 7. Verify driver removed from Redis GEO
      const driversInGeoAfter = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversInGeoAfter).not.toContain(driver.id);

      // 8. Verify assignment created
      const assignments = await db.assignments.find({ driverId: driver.id });
      expect(assignments).toHaveLength(1);
      expect(assignments[0].deliveryId).toBe(delivery.id);
      expect(assignments[0].status).toBe('ACTIVE');

      // 9. Verify audit logs
      const auditLogs = await db.deliveryAuditLogs.find({ deliveryId: delivery.id });
      expect(auditLogs.length).toBeGreaterThan(0);
      
      const offerCreatedLog = auditLogs.find(log => log.eventType === 'offer_created');
      expect(offerCreatedLog).toBeDefined();
      expect(offerCreatedLog.details.offerId).toBe(offer.id);

      const offerAcceptedLog = auditLogs.find(log => log.eventType === 'offer_accepted');
      expect(offerAcceptedLog).toBeDefined();
      expect(offerAcceptedLog.details.offerId).toBe(offer.id);
    });

    it('should handle offer rejection and next candidate', async () => {
      // 1. Setup test data
      const driver1 = await createTestDriver({ availability: 'AVAILABLE' });
      const driver2 = await createTestDriver({ availability: 'AVAILABLE' });
      const delivery = await createTestDelivery({ status: 'READY' });

      // 2. Create offer for driver1
      const offer = await offerService.createOfferForDriver(delivery, driver1);

      // 3. Reject offer
      const rejectedOffer = await offerService.rejectOffer(offer.id, driver1.id, 'too_far');

      expect(rejectedOffer.status).toBe('REJECTED');
      expect(rejectedOffer.rejectedAt).toBeDefined();
      expect(rejectedOffer.rejectionReason).toBe('too_far');

      // 4. Verify driver1 still available
      const updatedDriver1 = await db.drivers.findOne(driver1.id);
      expect(updatedDriver1.availability).toBe('AVAILABLE');

      // 5. Verify driver1 still in Redis GEO
      const driversInGeo = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversInGeo).toContain(driver1.id);

      // 6. Verify audit log
      const auditLogs = await db.deliveryAuditLogs.find({ deliveryId: delivery.id });
      const offerRejectedLog = auditLogs.find(log => log.eventType === 'offer_rejected');
      expect(offerRejectedLog).toBeDefined();
      expect(offerRejectedLog.details.reason).toBe('too_far');
    });
  });

  describe('Availability State Transitions', () => {
    it('should handle complete availability workflow', async () => {
      // 1. Setup test data
      const driver = await createTestDriver({ availability: 'AVAILABLE' });

      // 2. Take break
      await availabilityService.updateAvailability(
        driver.id,
        'ON_BREAK',
        { duration: 1800, reason: 'lunch_break' }
      );

      // 3. Verify state changes
      const driverAfterBreak = await db.drivers.findOne(driver.id);
      expect(driverAfterBreak.availability).toBe('ON_BREAK');
      expect(driverAfterBreak.availabilityUntil).toBeDefined();
      expect(driverAfterBreak.availabilityReason).toBe('lunch_break');

      // 4. Verify removed from Redis GEO
      const driversInGeo = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversInGeo).not.toContain(driver.id);

      // 5. Verify status in Redis hash
      const driverStatus = await redisService.hget('drivers:status', driver.id);
      expect(driverStatus).toBe('ON_BREAK');

      // 6. Verify history record
      const historyRecords = await db.driverAvailabilityHistory.find({ driverId: driver.id });
      expect(historyRecords).toHaveLength(1);
      expect(historyRecords[0].fromState).toBe('AVAILABLE');
      expect(historyRecords[0].toState).toBe('ON_BREAK');
      expect(historyRecords[0].reason).toBe('lunch_break');

      // 7. Resume work
      await availabilityService.updateAvailability(driver.id, 'AVAILABLE');

      // 8. Verify state changes
      const driverAfterResume = await db.drivers.findOne(driver.id);
      expect(driverAfterResume.availability).toBe('AVAILABLE');
      expect(driverAfterResume.availabilityUntil).toBeNull();

      // 9. Verify added back to Redis GEO
      const driversInGeoAfter = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversInGeoAfter).toContain(driver.id);

      // 10. Verify status in Redis hash
      const driverStatusAfter = await redisService.hget('drivers:status', driver.id);
      expect(driverStatusAfter).toBe('AVAILABLE');

      // 11. Verify history record
      const historyRecordsAfter = await db.driverAvailabilityHistory.find({ driverId: driver.id });
      expect(historyRecordsAfter).toHaveLength(2);
      expect(historyRecordsAfter[1].fromState).toBe('ON_BREAK');
      expect(historyRecordsAfter[1].toState).toBe('AVAILABLE');
    });
  });

  describe('Escalation Integration', () => {
    it('should handle complete escalation workflow', async () => {
      // 1. Setup test data
      const delivery = await createTestDelivery({ 
        status: 'READY',
        createdAt: new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
      });

      // 2. Trigger escalation check
      await escalationService.checkUnassignedOrders();

      // 3. Verify unassigned record created
      const unassignedRecord = await db.unassignedOrders.findOne({ deliveryId: delivery.id });
      expect(unassignedRecord).toBeDefined();
      expect(unassignedRecord.escalationLevel).toBe(1);
      expect(unassignedRecord.supportTicketId).toBeDefined();

      // 4. Verify audit log
      const auditLogs = await db.deliveryAuditLogs.find({ deliveryId: delivery.id });
      const escalationLog = auditLogs.find(log => log.eventType === 'escalation_triggered');
      expect(escalationLog).toBeDefined();
      expect(escalationLog.details.level).toBe(1);

      // 5. Verify support ticket created
      const supportTicket = await db.supportTickets.findOne(unassignedRecord.supportTicketId);
      expect(supportTicket).toBeDefined();
      expect(supportTicket.priority).toBe('high');
      expect(supportTicket.status).toBe('OPEN');
    });
  });

  describe('Cross-Service Integration', () => {
    it('should handle driver assignment with external services', async () => {
      // 1. Setup test data
      const driver = await createTestDriver({ availability: 'AVAILABLE' });
      const delivery = await createTestDelivery({ status: 'READY' });

      // 2. Mock external service calls
      jest.spyOn(offerService as any, 'calculateTravelTime').mockResolvedValue(600); // 10 minutes
      jest.spyOn(offerService as any, 'getSellerPrepTime').mockResolvedValue(300); // 5 minutes
      jest.spyOn(offerService as any, 'calculateDriverPayment').mockReturnValue(150.0);

      // 3. Create offer (should call external services)
      const offer = await offerService.createOfferForDriver(delivery, driver);

      // 4. Verify external service calls were made
      expect(offerService.calculateTravelTime).toHaveBeenCalledWith(
        driver.currentLocation,
        delivery.pickupLocation
      );
      expect(offerService.getSellerPrepTime).toHaveBeenCalledWith(delivery.sellerId);
      expect(offerService.calculateDriverPayment).toHaveBeenCalledWith(delivery);

      // 5. Verify offer payload contains calculated values
      expect(offer.offerPayload.estimatedPickupTimeMin).toBe(15); // (600 + 300) / 60
      expect(offer.offerPayload.estimatedEarning).toBe(150.0);
    });
  });
});
```

### Database Integration Tests

```typescript
describe('Database Integration', () => {
  let db: DatabaseService;
  let connection: Connection;

  beforeAll(async () => {
    connection = await createConnection({
      type: 'postgres',
      host: process.env.TEST_DB_HOST,
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      username: process.env.TEST_DB_USERNAME,
      password: process.env.TEST_DB_PASSWORD,
      database: process.env.TEST_DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true
    });
    db = new DatabaseService(connection);
  });

  afterAll(async () => {
    await connection.close();
  });

  beforeEach(async () => {
    await db.clear();
  });

  describe('Driver Offers', () => {
    it('should create and query driver offers correctly', async () => {
      // 1. Create test data
      const driver = await createTestDriver();
      const delivery = await createTestDelivery();

      const offer = await db.driverOffers.create({
        deliveryId: delivery.id,
        driverId: driver.id,
        status: 'PENDING',
        offerPayload: {
          pickupLocation: { lat: 12.9, lon: 77.6 },
          estimatedPickupTimeMin: 15,
          estimatedEarning: 150.0
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      });

      // 2. Query by delivery
      const offersByDelivery = await db.driverOffers.findByDeliveryId(delivery.id);
      expect(offersByDelivery).toHaveLength(1);
      expect(offersByDelivery[0].id).toBe(offer.id);

      // 3. Query by driver
      const offersByDriver = await db.driverOffers.findByDriverId(driver.id);
      expect(offersByDriver).toHaveLength(1);
      expect(offersByDriver[0].id).toBe(offer.id);

      // 4. Query pending offers
      const pendingOffers = await db.driverOffers.findPendingByDriverId(driver.id);
      expect(pendingOffers).toHaveLength(1);
      expect(pendingOffers[0].status).toBe('PENDING');

      // 5. Update offer
      await db.driverOffers.update(offer.id, { status: 'ACCEPTED' });
      const updatedOffer = await db.driverOffers.findOne(offer.id);
      expect(updatedOffer.status).toBe('ACCEPTED');
    });

    it('should handle offer expiration correctly', async () => {
      // 1. Create expired offers
      const expiredOffers = await Promise.all([
        db.driverOffers.create({
          deliveryId: 'delivery-1',
          driverId: 'driver-1',
          status: 'PENDING',
          offerPayload: {},
          createdAt: new Date(),
          expiresAt: new Date(Date.now() - 60000) // 1 minute ago
        }),
        db.driverOffers.create({
          deliveryId: 'delivery-2',
          driverId: 'driver-2',
          status: 'PENDING',
          offerPayload: {},
          createdAt: new Date(),
          expiresAt: new Date(Date.now() - 120000) // 2 minutes ago
        })
      ]);

      // 2. Find expired offers
      const expired = await db.driverOffers.findExpiredOffers();
      expect(expired).toHaveLength(2);

      // 3. Expire offers
      await db.driverOffers.expireOffers(expired.map(o => o.id));

      // 4. Verify expiration
      for (const offer of expiredOffers) {
        const updatedOffer = await db.driverOffers.findOne(offer.id);
        expect(updatedOffer.status).toBe('EXPIRED');
      }
    });
  });

  describe('Unassigned Orders', () => {
    it('should track unassigned orders correctly', async () => {
      // 1. Create unassigned order
      const unassignedOrder = await db.unassignedOrders.create({
        deliveryId: 'delivery-1',
        sellerOrderId: 'ORD-123',
        location: { lat: 12.9, lon: 77.6 },
        failureReason: 'no_available_drivers',
        firstAttemptAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        lastAttemptAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        attemptCount: 1,
        escalationLevel: 0,
        escalationStatus: 'PENDING'
      });

      // 2. Query by escalation level
      const level0Orders = await db.unassignedOrders.findByEscalationLevel(0);
      expect(level0Orders).toHaveLength(1);
      expect(level0Orders[0].id).toBe(unassignedOrder.id);

      // 3. Increment attempt count
      await db.unassignedOrders.incrementAttemptCount('delivery-1');
      const updatedOrder = await db.unassignedOrders.findOne(unassignedOrder.id);
      expect(updatedOrder.attemptCount).toBe(2);

      // 4. Update escalation level
      await db.unassignedOrders.update(unassignedOrder.id, { escalationLevel: 1 });
      const escalatedOrder = await db.unassignedOrders.findOne(unassignedOrder.id);
      expect(escalatedOrder.escalationLevel).toBe(1);
    });
  });

  describe('Audit Logs', () => {
    it('should maintain audit trail correctly', async () => {
      // 1. Create audit log
      const auditLog = await db.deliveryAuditLogs.create({
        deliveryId: 'delivery-1',
        eventType: 'offer_created',
        actorType: 'system',
        details: { offerId: 'offer-123' },
        timestamp: new Date()
      });

      // 2. Query audit logs
      const logs = await db.deliveryAuditLogs.findByDeliveryId('delivery-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe(auditLog.id);
      expect(logs[0].eventType).toBe('offer_created');

      // 3. Query by event type
      const offerLogs = await db.deliveryAuditLogs.findByEventType('offer_created');
      expect(offerLogs).toHaveLength(1);

      // 4. Query by actor type
      const systemLogs = await db.deliveryAuditLogs.findByActorType('system');
      expect(systemLogs).toHaveLength(1);
    });
  });

  describe('Zone Management', () => {
    it('should manage delivery zones correctly', async () => {
      // 1. Create zone
      const zone = await db.deliveryZones.create({
        name: 'Downtown',
        geometry: 'POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))',
        priorityLevel: 1,
        minDriversOnline: 5,
        currentDriversOnline: 3,
        avgWaitTimeSeconds: 300,
        targetWaitTimeSeconds: 240
      });

      // 2. Query zone
      const foundZone = await db.deliveryZones.findOne(zone.id);
      expect(foundZone.name).toBe('Downtown');
      expect(foundZone.priorityLevel).toBe(1);

      // 3. Update zone metrics
      await db.deliveryZones.update(zone.id, {
        currentDriversOnline: 6,
        avgWaitTimeSeconds: 200
      });

      const updatedZone = await db.deliveryZones.findOne(zone.id);
      expect(updatedZone.currentDriversOnline).toBe(6);
      expect(updatedZone.avgWaitTimeSeconds).toBe(200);

      // 4. Create zone preference
      const preference = await db.driverZonePreferences.create({
        driverId: 'driver-1',
        zoneId: zone.id,
        preference: 'PREFERRED',
        distanceToZoneCenter: 2.5
      });

      // 5. Query preferences
      const preferences = await db.driverZonePreferences.findByDriverId('driver-1');
      expect(preferences).toHaveLength(1);
      expect(preferences[0].zoneId).toBe(zone.id);
      expect(preferences[0].preference).toBe('PREFERRED');
    });
  });
});
```

### Redis Integration Tests

```typescript
describe('Redis Integration', () => {
  let redisService: RedisService;

  beforeAll(async () => {
    redisService = new RedisService({
      host: process.env.TEST_REDIS_HOST,
      port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
      retryAttempts: 3
    });
    await redisService.connect();
  });

  afterAll(async () => {
    await redisService.disconnect();
  });

  beforeEach(async () => {
    await redisService.flushall();
  });

  describe('Driver Geo Location', () => {
    it('should manage driver locations in Redis GEO', async () => {
      // 1. Add driver to GEO
      await redisService.geoadd('drivers:geo', 12.9, 77.6, 'driver-1');

      // 2. Query nearby drivers
      const nearbyDrivers = await redisService.georadius(
        'drivers:geo',
        12.9,
        77.6,
        5,
        'km'
      );
      expect(nearbyDrivers).toContain('driver-1');

      // 3. Get driver coordinates
      const coords = await redisService.geopos('drivers:geo', 'driver-1');
      expect(coords[0].longitude).toBeCloseTo(77.6);
      expect(coords[0].latitude).toBeCloseTo(12.9);

      // 4. Remove driver from GEO
      await redisService.zrem('drivers:geo', 'driver-1');
      const driversAfterRemoval = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversAfterRemoval).not.toContain('driver-1');
    });

    it('should handle batch driver operations', async () => {
      // 1. Batch add drivers
      const pipeline = redisService.pipeline();
      pipeline.geoadd('drivers:geo', 12.9, 77.6, 'driver-1');
      pipeline.geoadd('drivers:geo', 12.91, 77.61, 'driver-2');
      pipeline.geoadd('drivers:geo', 12.89, 77.59, 'driver-3');
      await pipeline.exec();

      // 2. Query all drivers
      const allDrivers = await redisService.zrange('drivers:geo', 0, -1);
      expect(allDrivers).toHaveLength(3);
      expect(allDrivers).toContain('driver-1');
      expect(allDrivers).toContain('driver-2');
      expect(allDrivers).toContain('driver-3');

      // 3. Batch remove drivers
      const removePipeline = redisService.pipeline();
      removePipeline.zrem('drivers:geo', 'driver-1');
      removePipeline.zrem('drivers:geo', 'driver-2');
      removePipeline.zrem('drivers:geo', 'driver-3');
      await removePipeline.exec();

      const driversAfterBatchRemoval = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversAfterBatchRemoval).toHaveLength(0);
    });
  });

  describe('Driver Status Management', () => {
    it('should manage driver status in Redis hash', async () => {
      // 1. Set driver status
      await redisService.hset('drivers:status', 'driver-1', 'AVAILABLE');

      // 2. Get driver status
      const status = await redisService.hget('drivers:status', 'driver-1');
      expect(status).toBe('AVAILABLE');

      // 3. Update driver status
      await redisService.hset('drivers:status', 'driver-1', 'BUSY');
      const updatedStatus = await redisService.hget('drivers:status', 'driver-1');
      expect(updatedStatus).toBe('BUSY');

      // 4. Get all driver statuses
      const allStatuses = await redisService.hgetall('drivers:status');
      expect(allStatuses['driver-1']).toBe('BUSY');
    });

    it('should handle batch status operations', async () => {
      // 1. Batch set statuses
      await redisService.hmset('drivers:status', {
        'driver-1': 'AVAILABLE',
        'driver-2': 'BUSY',
        'driver-3': 'ON_BREAK'
      });

      // 2. Batch get statuses
      const statuses = await redisService.hmget('drivers:status', 'driver-1', 'driver-2', 'driver-3');
      expect(statuses).toEqual(['AVAILABLE', 'BUSY', 'ON_BREAK']);
    });
  });

  describe('Offer Management', () => {
    it('should manage offers in Redis', async () => {
      // 1. Create offer
      const offerData = {
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        expiresAt: new Date(Date.now() + 30000).toISOString()
      };

      await redisService.setex(`offer:${offerData.deliveryId}`, 30, JSON.stringify(offerData));

      // 2. Get offer
      const storedOffer = await redisService.get(`offer:${offerData.deliveryId}`);
      const parsedOffer = JSON.parse(storedOffer);
      expect(parsedOffer.driverId).toBe('driver-1');
      expect(parsedOffer.deliveryId).toBe('delivery-1');

      // 3. Verify TTL
      const ttl = await redisService.ttl(`offer:${offerData.deliveryId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);

      // 4. Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 31000));

      // 5. Verify expiration
      const expiredOffer = await redisService.get(`offer:${offerData.deliveryId}`);
      expect(expiredOffer).toBeNull();
    });

    it('should handle offer expiration with keyspace notifications', async () => {
      // 1. Set up key expiration listener
      const expirationEvents: string[] = [];
      redisService.on('expired', (channel: string, message: string) => {
        expirationEvents.push(message);
      });

      // 2. Create offer with short TTL
      const offerData = { driverId: 'driver-1', deliveryId: 'delivery-1' };
      await redisService.setex(`offer:${offerData.deliveryId}`, 1, JSON.stringify(offerData));

      // 3. Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 4. Verify expiration event
      expect(expirationEvents).toContain(`offer:${offerData.deliveryId}`);
    });
  });

  describe('Zone Health Caching', () => {
    it('should cache zone health metrics', async () => {
      // 1. Cache zone health
      const zoneHealth = {
        zoneId: 'zone-1',
        currentDriversOnline: 5,
        minDriversRequired: 3,
        avgWaitTimeSeconds: 240,
        targetWaitTimeSeconds: 300,
        demandLevel: 7,
        healthScore: 85,
        updatedAt: new Date().toISOString()
      };

      await redisService.setex(`zone:health:${zoneHealth.zoneId}`, 60, JSON.stringify(zoneHealth));

      // 2. Get cached health
      const cachedHealth = await redisService.get(`zone:health:${zoneHealth.zoneId}`);
      const parsedHealth = JSON.parse(cachedHealth);
      expect(parsedHealth.zoneId).toBe('zone-1');
      expect(parsedHealth.currentDriversOnline).toBe(5);
      expect(parsedHealth.healthScore).toBe(85);

      // 3. Batch get zone health
      const zoneIds = ['zone-1', 'zone-2'];
      const keys = zoneIds.map(id => `zone:health:${id}`);
      await redisService.mset(keys.map(key => [key, JSON.stringify(zoneHealth)]).flat());

      const cachedHealths = await redisService.mget(...keys);
      expect(cachedHealths).toHaveLength(2);
      expect(JSON.parse(cachedHealths[0])).toMatchObject(zoneHealth);
    });
  });

  describe('Performance Optimization', () => {
    it('should handle high-frequency operations efficiently', async () => {
      const startTime = Date.now();

      // 1. Batch operations
      const pipeline = redisService.pipeline();
      for (let i = 0; i < 1000; i++) {
        pipeline.hset('drivers:status', `driver-${i}`, 'AVAILABLE');
        pipeline.geoadd('drivers:geo', 12.9 + (i * 0.001), 77.6 + (i * 0.001), `driver-${i}`);
      }
      await pipeline.exec();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 1000 operations in under 5 seconds
      expect(duration).toBeLessThan(5000);

      // 2. Verify operations
      const statusCount = await redisService.hlen('drivers:status');
      const geoCount = await redisService.zcard('drivers:geo');
      expect(statusCount).toBe(1000);
      expect(geoCount).toBe(1000);
    });
  });
});
```

---

## End-to-End Testing

### Complete User Journey Tests

```typescript
describe('E2E: Complete Driver Assignment Flow', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    db = moduleFixture.get<DatabaseService>(DatabaseService);
    redisService = moduleFixture.get<RedisService>(RedisService);

    await app.init();
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    await resetTestEnvironment();
  });

  describe('Happy Path: Successful Assignment', () => {
    it('should complete full assignment workflow from order to delivery', async () => {
      // 1. Setup: Create driver and delivery
      const driver = await createTestDriver({
        availability: 'AVAILABLE',
        currentLocation: { lat: 12.9, lon: 77.6 }
      });

      const delivery = await createTestDelivery({
        status: 'READY',
        pickupLocation: { lat: 12.91, lon: 77.61 },
        storeName: 'Test Store',
        sellerId: 'seller-123'
      });

      // 2. Action: Create offer
      const offerResponse = await request(app.getHttpServer())
        .post(`/v2/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver.id })
        .expect(201);

      const offerId = offerResponse.body.offerId;
      expect(offerResponse.body.success).toBe(true);
      expect(offerResponse.body.payload).toBeDefined();
      expect(offerResponse.body.payload.estimatedPickupTimeMin).toBeGreaterThan(0);

      // 3. Action: Accept offer
      const acceptResponse = await request(app.getHttpServer())
        .post(`/v2/drivers/${driver.id}/offers/${offerId}/accept`)
        .send({ acceptedAt: new Date().toISOString() })
        .expect(200);

      expect(acceptResponse.body.success).toBe(true);
      expect(acceptResponse.body.assignmentId).toBeDefined();
      expect(acceptResponse.body.responseTimeMs).toBeDefined();

      // 4. Verification: Check state changes
      const updatedDriver = await db.drivers.findOne(driver.id);
      expect(updatedDriver.availability).toBe('BUSY');

      const updatedOffer = await db.driverOffers.findOne(offerId);
      expect(updatedOffer.status).toBe('ACCEPTED');
      expect(updatedOffer.acceptedAt).toBeDefined();

      const assignment = await db.assignments.findOne(acceptResponse.body.assignmentId);
      expect(assignment).toBeDefined();
      expect(assignment.driverId).toBe(driver.id);
      expect(assignment.deliveryId).toBe(delivery.id);
      expect(assignment.status).toBe('ACTIVE');

      // 5. Verification: Check Redis state
      const driverStatus = await redisService.hget('drivers:status', driver.id);
      expect(driverStatus).toBe('BUSY');

      const driversInGeo = await redisService.zrange('drivers:geo', 0, -1);
      expect(driversInGeo).not.toContain(driver.id);

      // 6. Verification: Check audit trail
      const auditLogs = await db.deliveryAuditLogs.find({ deliveryId: delivery.id });
      expect(auditLogs.length).toBeGreaterThan(1);

      const offerCreatedLog = auditLogs.find(log => log.eventType === 'offer_created');
      expect(offerCreatedLog).toBeDefined();
      expect(offerCreatedLog.details.offerId).toBe(offerId);

      const offerAcceptedLog = auditLogs.find(log => log.eventType === 'offer_accepted');
      expect(offerAcceptedLog).toBeDefined();
      expect(offerAcceptedLog.details.assignmentId).toBe(acceptResponse.body.assignmentId);
    });
  });

  describe('Alternative Path: Offer Rejection', () => {
    it('should handle offer rejection and trigger next candidate', async () => {
      // 1. Setup: Create two drivers and one delivery
      const driver1 = await createTestDriver({
        availability: 'AVAILABLE',
        currentLocation: { lat: 12.9, lon: 77.6 }
      });

      const driver2 = await createTestDriver({
        availability: 'AVAILABLE',
        currentLocation: { lat: 12.92, lon: 77.62 }
      });

      const delivery = await createTestDelivery({
        status: 'READY',
        pickupLocation: { lat: 12.91, lon: 77.61 }
      });

      // 2. Action: Create offer for driver1
      const offerResponse = await request(app.getHttpServer())
        .post(`/v2/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver1.id })
        .expect(201);

      const offerId = offerResponse.body.offerId;

      // 3. Action: Reject offer
      const rejectResponse = await request(app.getHttpServer())
        .post(`/v2/drivers/${driver1.id}/offers/${offerId}/reject`)
        .send({ reason: 'too_far' })
        .expect(200);

      expect(rejectResponse.body.success).toBe(true);
      expect(rejectResponse.body.reason).toBe('too_far');

      // 4. Verification: Check state changes
      const updatedDriver1 = await db.drivers.findOne(driver1.id);
      expect(updatedDriver1.availability).toBe('AVAILABLE');

      const updatedOffer = await db.driverOffers.findOne(offerId);
      expect(updatedOffer.status).toBe('REJECTED');
      expect(updatedOffer.rejectedAt).toBeDefined();
      expect(updatedOffer.rejectionReason).toBe('too_far');

      // 5. Verification: Check audit trail
      const auditLogs = await db.deliveryAuditLogs.find({ deliveryId: delivery.id });
      const offerRejectedLog = auditLogs.find(log => log.eventType === 'offer_rejected');
      expect(offerRejectedLog).toBeDefined();
      expect(offerRejectedLog.details.reason).toBe('too_far');
    });
  });

  describe('Error Path: No Available Drivers', () => {
    it('should escalate unassigned orders after timeout', async () => {
      // 1. Setup: Create delivery with no available drivers
      const delivery = await createTestDelivery({
        status: 'READY',
        createdAt: new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
      });

      // 2. Action: Trigger escalation check
      await request(app.getHttpServer())
        .post('/v2/admin/escalation/check')
        .expect(200);

      // 3. Verification: Check escalation record
      const unassignedRecord = await db.unassignedOrders.findOne({ deliveryId: delivery.id });
      expect(unassignedRecord).toBeDefined();
      expect(unassignedRecord.escalationLevel).toBe(1);
      expect(unassignedRecord.supportTicketId).toBeDefined();

      // 4. Verification: Check support ticket
      const supportTicket = await db.supportTickets.findOne(unassignedRecord.supportTicketId);
      expect(supportTicket).toBeDefined();
      expect(supportTicket.priority).toBe('high');
      expect(supportTicket.status).toBe('OPEN');

      // 5. Verification: Check audit trail
      const auditLogs = await db.deliveryAuditLogs.find({ deliveryId: delivery.id });
      const escalationLog = auditLogs.find(log => log.eventType === 'escalation_triggered');
      expect(escalationLog).toBeDefined();
      expect(escalationLog.details.level).toBe(1);
    });
  });

  describe('Complex Scenario: Multiple Services Integration', () => {
    it('should handle complete workflow with external services', async () => {
      // 1. Setup: Create test data
      const driver = await createTestDriver({
        availability: 'AVAILABLE',
        currentLocation: { lat: 12.9, lon: 77.6 }
      });

      const delivery = await createTestDelivery({
        status: 'READY',
        pickupLocation: { lat: 12.91, lon: 77.61 },
        storeName: 'Test Store',
        sellerId: 'seller-123'
      });

      // 2. Action: Create offer (should call Maps API)
      const offerResponse = await request(app.getHttpServer())
        .post(`/v2/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver.id })
        .expect(201);

      const offerId = offerResponse.body.offerId;

      // 3. Verification: Check Maps API was called (through logs or mocks)
      // This would depend on how external services are mocked in tests

      // 4. Action: Accept offer
      const acceptResponse = await request(app.getHttpServer())
        .post(`/v2/drivers/${driver.id}/offers/${offerId}/accept`)
        .send({ acceptedAt: new Date().toISOString() })
        .expect(200);

      // 5. Action: Update driver availability
      await request(app.getHttpServer())
        .post(`/v2/drivers/${driver.id}/availability/take-break`)
        .send({ durationMinutes: 30, reason: 'lunch_break' })
        .expect(200);

      // 6. Verification: Check complete state
      const updatedDriver = await db.drivers.findOne(driver.id);
      expect(updatedDriver.availability).toBe('ON_BREAK');

      const assignment = await db.assignments.findOne(acceptResponse.body.assignmentId);
      expect(assignment.status).toBe('ACTIVE'); // Assignment still active

      // 7. Action: Resume work
      await request(app.getHttpServer())
        .post(`/v2/drivers/${driver.id}/availability/resume`)
        .expect(200);

      // 8. Verification: Check final state
      const finalDriver = await db.drivers.findOne(driver.id);
      expect(finalDriver.availability).toBe('AVAILABLE');

      const finalAssignment = await db.assignments.findOne(acceptResponse.body.assignmentId);
      expect(finalAssignment.status).toBe('ACTIVE'); // Assignment still active
    });
  });
});
```

### Cross-Service E2E Tests

```typescript
describe('E2E: Cross-Service Integration', () => {
  let driverApp: INestApplication;
  let orderApp: INestApplication;
  let notificationApp: INestApplication;

  beforeAll(async () => {
    // Setup multiple service instances
    driverApp = await createServiceApp('driver');
    orderApp = await createServiceApp('order');
    notificationApp = await createServiceApp('notification');

    await driverApp.init();
    await orderApp.init();
    await notificationApp.init();
  });

  afterAll(async () => {
    await driverApp.close();
    await orderApp.close();
    await notificationApp.close();
  });

  describe('Order-to-Driver Flow', () => {
    it('should handle complete order assignment across services', async () => {
      // 1. Create order in Order Service
      const orderResponse = await request(orderApp.getHttpServer())
        .post('/orders')
        .send({
          customerId: 'customer-123',
          items: [{ productId: 'product-1', quantity: 1 }],
          deliveryAddress: { lat: 12.9, lon: 77.6 }
        })
        .expect(201);

      const orderId = orderResponse.body.orderId;

      // 2. Order Service creates delivery in Driver Service
      // This would be triggered by an event or webhook
      await waitForEvent('delivery_created', orderId);

      // 3. Driver Service finds available drivers
      const driversResponse = await request(driverApp.getHttpServer())
        .get('/drivers/available')
        .query({ location: '12.9,77.6' })
        .expect(200);

      expect(driversResponse.body.drivers).toHaveLength(1);

      // 4. Driver Service creates offer
      const offerResponse = await request(driverApp.getHttpServer())
        .post(`/deliveries/${orderId}/offers`)
        .send({ driverId: driversResponse.body.drivers[0].id })
        .expect(201);

      // 5. Driver Service sends notification
      // This would be triggered by an event
      await waitForEvent('offer_notification_sent', offerResponse.body.offerId);

      // 6. Driver accepts offer
      const acceptResponse = await request(driverApp.getHttpServer())
        .post(`/drivers/${driversResponse.body.drivers[0].id}/offers/${offerResponse.body.offerId}/accept`)
        .send({ acceptedAt: new Date().toISOString() })
        .expect(200);

      // 7. Driver Service updates order status
      // This would be sent as an event to Order Service
      await waitForEvent('order_assigned', orderId);

      // 8. Verify order status in Order Service
      const orderStatusResponse = await request(orderApp.getHttpServer())
        .get(`/orders/${orderId}/status`)
        .expect(200);

      expect(orderStatusResponse.body.status).toBe('ASSIGNED');
      expect(orderStatusResponse.body.driverId).toBeDefined();
    });
  });

  describe('Notification Flow', () => {
    it('should send notifications across all channels', async () => {
      // 1. Setup: Create driver and delivery
      const driver = await createTestDriver();
      const delivery = await createTestDelivery();

      // 2. Create offer (triggers notification)
      const offerResponse = await request(driverApp.getHttpServer())
        .post(`/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver.id })
        .expect(201);

      // 3. Verify push notification sent
      const pushNotifications = await getNotifications('push', driver.id);
      expect(pushNotifications).toHaveLength(1);
      expect(pushNotifications[0].type).toBe('offer_created');

      // 4. Verify WebSocket notification sent
      const wsNotifications = await getNotifications('websocket', driver.id);
      expect(wsNotifications).toHaveLength(1);
      expect(wsNotifications[0].type).toBe('offer_created');

      // 5. Verify email notification sent (if configured)
      const emailNotifications = await getNotifications('email', driver.id);
      expect(emailNotifications).toHaveLength(1);
      expect(emailNotifications[0].subject).toContain('New Delivery Offer');
    });
  });

  describe('Error Handling Across Services', () => {
    it('should handle service failures gracefully', async () => {
      // 1. Setup: Create driver and delivery
      const driver = await createTestDriver();
      const delivery = await createTestDelivery();

      // 2. Simulate notification service failure
      await simulateServiceFailure('notification');

      // 3. Create offer (should still succeed despite notification failure)
      const offerResponse = await request(driverApp.getHttpServer())
        .post(`/deliveries/${delivery.id}/offers`)
        .send({ driverId: driver.id })
        .expect(201);

      expect(offerResponse.body.success).toBe(true);

      // 4. Verify offer was created despite notification failure
      const offer = await db.driverOffers.findOne(offerResponse.body.offerId);
      expect(offer).toBeDefined();
      expect(offer.status).toBe('PENDING');

      // 5. Verify error was logged
      const errorLogs = await getErrorLogs('notification_service_failed');
      expect(errorLogs).toHaveLength(1);
    });
  });
});
```

### Performance E2E Tests

```typescript
describe('E2E: Performance Testing', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    db = moduleFixture.get<DatabaseService>(DatabaseService);

    await app.init();
    await setupPerformanceTestEnvironment();
  });

  afterAll(async () => {
    await app.close();
    await cleanupPerformanceTestEnvironment();
  });

  describe('High Volume Assignment', () => {
    it('should handle 1000 concurrent assignments', async () => {
      // 1. Setup: Create 1000 drivers and 1000 deliveries
      const drivers = await createTestDrivers(1000);
      const deliveries = await createTestDeliveries(1000);

      // 2. Measure time for concurrent assignments
      const startTime = Date.now();

      const assignmentPromises = deliveries.map((delivery, index) => {
        const driver = drivers[index % drivers.length];
        return request(app.getHttpServer())
          .post(`/v2/deliveries/${delivery.id}/offers`)
          .send({ driverId: driver.id })
          .then(response => response.body);
      });

      const results = await Promise.all(assignmentPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 3. Verify all assignments succeeded
      expect(results).toHaveLength(1000);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.offerId).toBeDefined();
      });

      // 4. Verify performance requirements
      expect(duration).toBeLessThan(30000); // Should complete in under 30 seconds

      // 5. Verify database consistency
      const offers = await db.driverOffers.find();
      expect(offers).toHaveLength(1000);

      const assignments = await db.assignments.find();
      expect(assignments).toHaveLength(0); // Not yet accepted

      const driversInGeo = await redisService.zcard('drivers:geo');
      expect(driversInGeo).toBe(0); // All drivers should be BUSY
    });
  });

  describe('Concurrent Offer Acceptance', () => {
    it('should handle 500 concurrent offer acceptances', async () => {
      // 1. Setup: Create offers
      const drivers = await createTestDrivers(500);
      const deliveries = await createTestDeliveries(500);

      const offers = [];
      for (let i = 0; i < 500; i++) {
        const offerResponse = await request(app.getHttpServer())
          .post(`/v2/deliveries/${deliveries[i].id}/offers`)
          .send({ driverId: drivers[i].id });
        offers.push({ id: offerResponse.body.offerId, driverId: drivers[i].id });
      }

      // 2. Measure time for concurrent acceptances
      const startTime = Date.now();

      const acceptancePromises = offers.map(offer => {
        return request(app.getHttpServer())
          .post(`/v2/drivers/${offer.driverId}/offers/${offer.id}/accept`)
          .send({ acceptedAt: new Date().toISOString() })
          .then(response => response.body);
      });

      const results = await Promise.all(acceptancePromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 3. Verify all acceptances succeeded
      expect(results).toHaveLength(500);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.assignmentId).toBeDefined();
      });

      // 4. Verify performance requirements
      expect(duration).toBeLessThan(15000); // Should complete in under 15 seconds

      // 5. Verify database consistency
      const assignments = await db.assignments.find();
      expect(assignments).toHaveLength(500);

      const driversInGeo = await redisService.zcard('drivers:geo');
      expect(driversInGeo).toBe(0); // All drivers should be BUSY
    });
  });

  describe('Memory Usage Under Load', () => {
    it('should maintain stable memory usage under sustained load', async () => {
      // 1. Monitor initial memory usage
      const initialMemory = process.memoryUsage();

      // 2. Generate sustained load for 5 minutes
      const loadDuration = 5 * 60 * 1000;
      const startTime = Date.now();

      let operationsCompleted = 0;

      while (Date.now() - startTime < loadDuration) {
        // Create driver and delivery
        const driver = await createTestDriver();
        const delivery = await createTestDelivery();

        // Create and accept offer
        const offerResponse = await request(app.getHttpServer())
          .post(`/v2/deliveries/${delivery.id}/offers`)
          .send({ driverId: driver.id });

        if (offerResponse.status === 201) {
          await request(app.getHttpServer())
            .post(`/v2/drivers/${driver.id}/offers/${offerResponse.body.offerId}/accept`)
            .send({ acceptedAt: new Date().toISOString() });

          operationsCompleted++;
        }

        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 3. Monitor final memory usage
      const finalMemory = process.memoryUsage();

      // 4. Verify memory usage didn't increase significantly
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

      // 5. Verify operations were completed
      expect(operationsCompleted).toBeGreaterThan(100);
    });
  });
});
```

---

## Load & Performance Testing

### Artillery.js Load Tests

```yaml
# artillery-config.yml
config:
  target: 'http://localhost:3001'
  phases:
    - duration: 60
      arrivalRate: 10
      name: 'Warm-up'
    - duration: 300
      arrivalRate: 50
      name: 'Normal Load'
    - duration: 120
      arrivalRate: 100
      name: 'Peak Load'
    - duration: 60
      arrivalRate: 200
      name: 'Stress Test'
    - duration: 120
      arrivalRate: 50
      name: 'Cool-down'
  defaults:
    headers:
      'Content-Type': 'application/json'
      'Authorization': 'Bearer test-token'

scenarios:
  - name: 'Driver Offer Flow'
    weight: 70
    flow:
      - post:
          url: '/v2/deliveries/{{ $randomUUID }}/offers'
          json:
            driverId: '{{ $randomUUID }}'
            expiresInSeconds: 30
          expect:
            - statusCode: 201
          capture:
            - json: '$.offerId'
              as: 'offerId'
      - think: 5
      - post:
          url: '/v2/drivers/{{ $randomUUID }}/offers/{{ offerId }}/accept'
          json:
            acceptedAt: '{{ $timestamp }}'
          expect:
            - statusCode: 200

  - name: 'Availability Management'
    weight: 20
    flow:
      - post:
          url: '/v2/drivers/{{ $randomUUID }}/availability/take-break'
          json:
            durationMinutes: 30
            reason: 'lunch'
          expect:
            - statusCode: 200
      - think: 10
      - post:
          url: '/v2/drivers/{{ $randomUUID }}/availability/resume'
          expect:
            - statusCode: 200

  - name: 'Admin Operations'
    weight: 10
    flow:
      - get:
          url: '/v2/admin/unassigned-orders'
          expect:
            - statusCode: 200
      - get:
          url: '/v2/admin/deliveries/{{ $randomUUID }}/audit'
          expect:
            - statusCode: 200
```

### K6 Performance Tests

```javascript
// k6-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const offerCreationRate = new Rate('offer_creation_success');
const offerAcceptanceRate = new Rate('offer_acceptance_success');
const assignmentLatency = new Trend('assignment_latency');

export let options = {
  stages: [
    { duration: '2m', target: 10 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 }
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // 95% of requests should be below 2s
    'http_req_failed': ['rate<0.1'], // Error rate should be less than 10%
    'offer_creation_success': ['rate>0.95'], // 95% success rate for offer creation
    'offer_acceptance_success': ['rate>0.95'], // 95% success rate for offer acceptance
    'assignment_latency': ['p(95)<5000'] // 95% of assignments should complete in under 5s
  }
};

export default function() {
  const baseUrl = 'http://localhost:3001';
  
  // Test offer creation
  let offerResponse = http.post(`${baseUrl}/v2/deliveries/${__uuidv4()}/offers`, JSON.stringify({
    driverId: __uuidv4(),
    expiresInSeconds: 30
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  offerCreationRate.add(offerResponse.status === 201);
  
  if (offerResponse.status === 201) {
    const offerId = JSON.parse(offerResponse.body).offerId;
    
    sleep(1); // Simulate driver thinking time
    
    // Test offer acceptance
    let acceptResponse = http.post(`${baseUrl}/v2/drivers/${__uuidv4()}/offers/${offerId}/accept`, JSON.stringify({
      acceptedAt: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

    offerAcceptanceRate.add(acceptResponse.status === 200);
    
    if (acceptResponse.status === 200) {
      const assignmentId = JSON.parse(acceptResponse.body).assignmentId;
      assignmentLatency.add(1); // Simplified latency measurement
    }
  }

  sleep(1);
}
```

### JMeter Test Plan

```xml
<!-- jmeter-test-plan.jmx -->
<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Driver Service Load Test">
      <stringProp name="TestPlan.comments"></stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Driver Offer Load Test">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">100</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">50</stringProp>
        <stringProp name="ThreadGroup.ramp_time">60</stringProp>
        <longProp name="ThreadGroup.start_time">1643721600000</longProp>
        <longProp name="ThreadGroup.end_time">1643721600000</longProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">300</stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
      </ThreadGroup>
      
      <hashTree>
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Create Driver Offer">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"driverId":"${__UUID}","expiresInSeconds":30}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">3001</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.contentEncoding"></stringProp>
          <stringProp name="HTTPSampler.path">/v2/deliveries/${__UUID}/offers</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.implementation">HttpClient4</stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
        </HTTPSamplerProxy>
        
        <hashTree>
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Response Assertion">
            <collectionProp name="Asserion.test_strings">
              <stringProp name="4830">201</stringProp>
            </collectionProp>
            <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
            <boolProp name="Assertion.assume_success">false</boolProp>
            <intProp name="Assertion.test_type">16</intProp>
          </ResponseAssertion>
          <hashTree/>
          
          <JSONPathExtractor guiclass="JSONPathExtractorGui" testclass="JSONPathExtractor" testname="Extract Offer ID">
            <stringProp name="JSONPathExtractor.referenceNames">offerId</stringProp>
            <stringProp name="JSONPathExtractor.jsonPathExpressions">$.offerId</stringProp>
            <stringProp name="JSONPathExtractor.match_numbers">1</stringProp>
            <stringProp name="JSONPathExtractor.compute_concat">false</stringProp>
            <stringProp name="JSONPathExtractor.defaultValues"></stringProp>
          </JSONPathExtractor>
          <hashTree/>
        </hashTree>
        
        <ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="Think Time">
          <stringProp name="ConstantTimer.delay">5000</stringProp>
        </ConstantTimer>
        <hashTree/>
        
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Accept Driver Offer">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"acceptedAt":"${__time(yyyy-MM-dd'T'HH:mm:ss'Z')}"}"</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">localhost</stringProp>
          <stringProp name="HTTPSampler.port">3001</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.contentEncoding"></stringProp>
          <stringProp name="HTTPSampler.path">/v2/drivers/${__UUID}/offers/${offerId}/accept</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.implementation">HttpClient4</stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
        </HTTPSamplerProxy>
        
        <hashTree>
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Response Assertion">
            <collectionProp name="Asserion.test_strings">
              <stringProp name="4830">200</stringProp>
            </collectionProp>
            <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
            <boolProp name="Assertion.assume_success">false</boolProp>
            <intProp name="Assertion.test_type">16</intProp>
          </ResponseAssertion>
          <hashTree/>
        </hashTree>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
```

### Performance Monitoring Scripts

```typescript
// performance-monitor.ts
import { performance } from 'perf_hooks';
import { RedisService } from './redis.service';
import { DatabaseService } from './database.service';

export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  constructor(
    private readonly redisService: RedisService,
    private readonly db: DatabaseService
  ) {}

  async monitorOfferCreationLatency(): Promise<void> {
    const startTime = performance.now();

    try {
      // Simulate offer creation
      const result = await this.createTestOffer();
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      this.recordMetric('offer_creation_latency', latency);
      await this.storeMetric('offer_creation_latency', latency);

      return result;
    } catch (error) {
      const endTime = performance.now();
      const latency = endTime - startTime;

      this.recordMetric('offer_creation_error_latency', latency);
      await this.storeMetric('offer_creation_error_latency', latency);

      throw error;
    }
  }

  async monitorAssignmentLatency(): Promise<void> {
    const startTime = performance.now();

    try {
      // Simulate assignment
      const result = await this.createTestAssignment();

      const endTime = performance.now();
      const latency = endTime - startTime;

      this.recordMetric('assignment_latency', latency);
      await this.storeMetric('assignment_latency', latency);

      return result;
    } catch (error) {
      const endTime = performance.now();
      const latency = endTime - startTime;

      this.recordMetric('assignment_error_latency', latency);
      await this.storeMetric('assignment_error_latency', latency);

      throw error;
    }
  }

  async getPerformanceReport(): Promise<any> {
    const report = {};

    for (const [metricName, values] of this.metrics.entries()) {
      report[metricName] = {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p50: this.percentile(values, 0.5),
        p95: this.percentile(values, 0.95),
        p99: this.percentile(values, 0.99)
      };
    }

    return report;
  }

  private recordMetric(metricName: string, value: number): void {
    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, []);
    }
    this.metrics.get(metricName)!.push(value);
  }

  private async storeMetric(metricName: string, value: number): Promise<void> {
    const key = `metrics:${metricName}:${Date.now()}`;
    await this.redisService.setex(key, 3600, value.toString());
  }

  private percentile(values: number[], p: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }

  private async createTestOffer(): Promise<any> {
    // Implementation would create a test offer
    return { success: true, offerId: 'test-offer-id' };
  }

  private async createTestAssignment(): Promise<any> {
    // Implementation would create a test assignment
    return { success: true, assignmentId: 'test-assignment-id' };
  }
}

// Usage in tests
describe('Performance Tests', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    performanceMonitor = new PerformanceMonitor(redisService, db);
  });

  it('should create offers within performance requirements', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, () => performanceMonitor.monitorOfferCreationLatency())
    );

    const report = await performanceMonitor.getPerformanceReport();

    expect(report.offer_creation_latency.avg).toBeLessThan(1000); // Under 1 second
    expect(report.offer_creation_latency.p95).toBeLessThan(2000); // 95% under 2 seconds
  });

  it('should handle concurrent load without degradation', async () => {
    const concurrentPromises = Array.from({ length: 50 }, () =>
      performanceMonitor.monitorOfferCreationLatency()
    );

    await Promise.all(concurrentPromises);

    const report = await performanceMonitor.getPerformanceReport();

    expect(report.offer_creation_latency.max).toBeLessThan(5000); // Max under 5 seconds
    expect(report.offer_creation_latency.avg).toBeLessThan(1500); // Avg under 1.5 seconds
  });
});
```

---

## Contract Testing

### API Contract Tests with Pact

```typescript
// driver-offer-contract.test.ts
import { Pact } from '@pact-foundation/pact';
import { Matchers } from '@pact-foundation/pact';
import { DriverOfferService } from '../src/services/offer.service';

const { like, eachLike, term } = Matchers;

describe('Driver Offer API Contract', () => {
  let provider: Pact;
  let offerService: DriverOfferService;

  beforeAll(() => {
    provider = new Pact({
      consumer: 'DriverService',
      provider: 'OrderService',
      port: 9999,
      log: path.resolve(process.cwd(), 'logs', 'pact.log'),
      dir: path.resolve(process.cwd(), 'pacts'),
      logLevel: 'INFO'
    });

    return provider.setup();
  });

  afterAll(() => {
    return provider.finalize();
  });

  beforeEach(() => {
    return provider.addInteraction({
      state: 'a driver is available',
      uponReceiving: 'a request to create an offer',
      withRequest: {
        method: 'POST',
        path: '/v2/deliveries/delivery-123/offers',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          driverId: like('driver-123'),
          expiresInSeconds: 30
        }
      },
      willRespondWith: {
        status: 201,
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          success: true,
          offerId: like('offer-123'),
          expiresAt: term({
            generate: '2026-02-01T10:00:30Z',
            matcher: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$'
          }),
          payload: {
            pickupLocation: {
              lat: like(12.9),
              lon: like(77.6)
            },
            pickupStoreName: like('Test Store'),
            estimatedPickupTimeMin: like(15),
            estimatedDeliveryTime: term({
              generate: '2026-02-01T10:20:00Z',
              matcher: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$'
            }),
            estimatedDistanceKm: like(2.5),
            estimatedEarning: like(150.0)
          }
        }
      }
    });
  });

  it('should create offer successfully', async () => {
    offerService = new DriverOfferService();

    const response = await request(provider.mockService.baseUrl)
      .post('/v2/deliveries/delivery-123/offers')
      .send({
        driverId: 'driver-123',
        expiresInSeconds: 30
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.offerId).toBeDefined();
    expect(response.body.payload).toBeDefined();
  });
});

// Availability API Contract
describe('Driver Availability API Contract', () => {
  let provider: Pact;

  beforeAll(() => {
    provider = new Pact({
      consumer: 'DriverApp',
      provider: 'DriverService',
      port: 9999
    });

    return provider.setup();
  });

  afterAll(() => {
    return provider.finalize();
  });

  beforeEach(() => {
    return provider.addInteraction({
      state: 'driver is available',
      uponReceiving: 'a request to take break',
      withRequest: {
        method: 'POST',
        path: '/v2/drivers/driver-123/availability/take-break',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          durationMinutes: 30,
          reason: 'lunch_break'
        }
      },
      willRespondWith: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          success: true,
          status: 'on_break',
          breakUntil: term({
            generate: '2026-02-01T10:30:00Z',
            matcher: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$'
          }),
          driverId: like('driver-123')
        }
      }
    });
  });

  it('should update driver availability', async () => {
    const response = await request(provider.mockService.baseUrl)
      .post('/v2/drivers/driver-123/availability/take-break')
      .send({
        durationMinutes: 30,
        reason: 'lunch_break'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('on_break');
  });
});
```

### Schema Validation Tests

```typescript
// schema-validation.test.ts
import { validate } from 'jsonschema';
import { offerSchema, availabilitySchema, escalationSchema } from './schemas';

describe('API Schema Validation', () => {
  describe('Offer Schema', () => {
    it('should validate offer creation response', () => {
      const response = {
        success: true,
        offerId: 'offer-123',
        expiresAt: '2026-02-01T10:00:30Z',
        payload: {
          pickupLocation: { lat: 12.9, lon: 77.6 },
          pickupStoreName: 'Test Store',
          estimatedPickupTimeMin: 15,
          estimatedDeliveryTime: '2026-02-01T10:20:00Z',
          estimatedDistanceKm: 2.5,
          estimatedEarning: 150.0
        }
      };

      const result = validate(response, offerSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid offer payload', () => {
      const response = {
        success: true,
        offerId: 'offer-123',
        expiresAt: '2026-02-01T10:00:30Z',
        payload: {
          pickupLocation: { lat: 12.9 }, // Missing lon
          pickupStoreName: 'Test Store',
          estimatedPickupTimeMin: 15,
          estimatedDeliveryTime: '2026-02-01T10:20:00Z',
          estimatedDistanceKm: 2.5,
          estimatedEarning: 150.0
        }
      };

      const result = validate(response, offerSchema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].property).toContain('pickupLocation.lon');
    });
  });

  describe('Availability Schema', () => {
    it('should validate availability update response', () => {
      const response = {
        success: true,
        status: 'on_break',
        breakUntil: '2026-02-01T10:30:00Z',
        driverId: 'driver-123'
      };

      const result = validate(response, availabilitySchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Escalation Schema', () => {
    it('should validate escalation response', () => {
      const response = {
        success: true,
        escalatedAt: '2026-02-01T10:05:00Z',
        newEscalationLevel: 1,
        supportTicketId: 'ticket-123'
      };

      const result = validate(response, escalationSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
```

### Contract Schema Definitions

```typescript
// schemas.ts
export const offerSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    offerId: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' },
    expiresAt: { type: 'string', format: 'date-time' },
    payload: {
      type: 'object',
      properties: {
        pickupLocation: {
          type: 'object',
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lon: { type: 'number', minimum: -180, maximum: 180 }
          },
          required: ['lat', 'lon']
        },
        pickupStoreName: { type: 'string', minLength: 1 },
        estimatedPickupTimeMin: { type: 'number', minimum: 1 },
        estimatedDeliveryTime: { type: 'string', format: 'date-time' },
        estimatedDistanceKm: { type: 'number', minimum: 0 },
        estimatedEarning: { type: 'number', minimum: 0 }
      },
      required: [
        'pickupLocation',
        'pickupStoreName',
        'estimatedPickupTimeMin',
        'estimatedDeliveryTime',
        'estimatedDistanceKm',
        'estimatedEarning'
      ]
    }
  },
  required: ['success', 'offerId', 'expiresAt', 'payload']
};

export const availabilitySchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: {
      type: 'string',
      enum: ['available', 'busy', 'on_break', 'shift_ended', 'offline', 'paused']
    },
    breakUntil: { type: 'string', format: 'date-time' },
    driverId: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' }
  },
  required: ['success', 'status', 'driverId']
};

export const escalationSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    escalatedAt: { type: 'string', format: 'date-time' },
    newEscalationLevel: { type: 'integer', minimum: 0, maximum: 3 },
    supportTicketId: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' }
  },
  required: ['success', 'escalatedAt', 'newEscalationLevel']
};

export const auditSchema = {
  type: 'object',
  properties: {
    deliveryId: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' },
          timestamp: { type: 'string', format: 'date-time' },
          eventType: { type: 'string' },
          actorId: { type: 'string' },
          actorType: { type: 'string' },
          details: { type: 'object' },
          version: { type: 'integer', minimum: 1 }
        },
        required: ['id', 'timestamp', 'eventType', 'details', 'version']
      }
    },
    summary: {
      type: 'object',
      properties: {
        totalEvents: { type: 'integer', minimum: 0 },
        byEventType: { type: 'object' },
        byActorType: { type: 'object' }
      },
      required: ['totalEvents', 'byEventType', 'byActorType']
    }
  },
  required: ['deliveryId', 'events', 'summary']
};
```

---

## Security Testing

### Authentication & Authorization Tests

```typescript
describe('Security Tests', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [DriverModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    db = moduleFixture.get<DatabaseService>(DatabaseService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/v2/deliveries/delivery-123/offers')
        .send({ driverId: 'driver-123' })
        .expect(401);

      expect(response.body.message).toContain('Unauthorized');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .post('/v2/deliveries/delivery-123/offers')
        .set('Authorization', 'Bearer invalid-token')
        .send({ driverId: 'driver-123' })
        .expect(401);

      expect(response.body.message).toContain('Unauthorized');
    });

    it('should accept requests with valid token', async () => {
      const token = generateValidToken();
      
      const response = await request(app.getHttpServer())
        .post('/v2/deliveries/delivery-123/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({ driverId: 'driver-123' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Authorization', () => {
    it('should prevent drivers from accessing other drivers offers', async () => {
      const driver1Token = generateDriverToken('driver-1');
      const driver2Token = generateDriverToken('driver-2');

      // Driver 1 creates offer
      await request(app.getHttpServer())
        .post('/v2/deliveries/delivery-123/offers')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ driverId: 'driver-1' })
        .expect(201);

      // Driver 2 tries to access driver 1's offers
      const response = await request(app.getHttpServer())
        .get('/v2/drivers/driver-1/offers')
        .set('Authorization', `Bearer ${driver2Token}`)
        .expect(403);

      expect(response.body.message).toContain('Forbidden');
    });

    it('should allow admins to access all data', async () => {
      const adminToken = generateAdminToken();

      const response = await request(app.getHttpServer())
        .get('/v2/admin/unassigned-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.orders).toBeDefined();
    });

    it('should prevent unauthorized escalation access', async () => {
      const driverToken = generateDriverToken('driver-1');

      const response = await request(app.getHttpServer())
        .post('/v2/admin/unassigned-orders/order-123/escalate')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ level: 1, reason: 'test' })
        .expect(403);

      expect(response.body.message).toContain('Forbidden');
    });
  });

  describe('Input Validation', () => {
    it('should reject malformed UUIDs', async () => {
      const token = generateValidToken();

      const response = await request(app.getHttpServer())
        .post('/v2/deliveries/invalid-uuid/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({ driverId: 'driver-123' })
        .expect(400);

      expect(response.body.message).toContain('Validation failed');
    });

    it('should reject negative expiration times', async () => {
      const token = generateValidToken();

      const response = await request(app.getHttpServer())
        .post('/v2/deliveries/delivery-123/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({ driverId: 'driver-123', expiresInSeconds: -10 })
        .expect(400);

      expect(response.body.message).toContain('Validation failed');
    });

    it('should reject excessively long expiration times', async () => {
      const token = generateValidToken();

      const response = await request(app.getHttpServer())
        .post('/v2/deliveries/delivery-123/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({ driverId: 'driver-123', expiresInSeconds: 100000 })
        .expect(400);

      expect(response.body.message).toContain('Validation failed');
    });
  });

  describe('Rate Limiting', () => {
    it('should limit offer creation requests', async () => {
      const token = generateValidToken();

      // Make multiple requests rapidly
      const promises = Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .post('/v2/deliveries/delivery-123/offers')
          .set('Authorization', `Bearer ${token}`)
          .send({ driverId: 'driver-123' })
      );

      const responses = await Promise.all(promises);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should reset rate limit after window expires', async () => {
      const token = generateValidToken();

      // Make requests to hit rate limit
      for (let i = 0; i < 15; i++) {
        await request(app.getHttpServer())
          .post('/v2/deliveries/delivery-123/offers')
          .set('Authorization', `Bearer ${token}`)
          .send({ driverId: 'driver-123' });
      }

      // Wait for rate limit window to reset
      await new Promise(resolve => setTimeout(resolve, 61000));

      // Should be able to make requests again
      const response = await request(app.getHttpServer())
        .post('/v2/deliveries/delivery-123/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({ driverId: 'driver-123' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Data Exposure', () => {
    it('should not expose sensitive driver information', async () => {
      const token = generateValidToken();

      const response = await request(app.getHttpServer())
        .get('/v2/drivers/driver-123')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Should not contain sensitive information
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('ssn');
      expect(response.body).not.toHaveProperty('bankAccount');
    });

    it('should mask sensitive information in responses', async () => {
      const token = generateValidToken();

      const response = await request(app.getHttpServer())
        .get('/v2/orders/order-123/delivery-status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      if (response.body.driver && response.body.driver.phone) {
        // Phone number should be masked
        expect(response.body.driver.phone).toMatch(/^\*\*\*\-\*\*\*\-/);
      }
    });
  });
});
```

### Security Headers Tests

```typescript
describe('Security Headers', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [DriverModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should include security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/v2/health')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('should not expose server information', async () => {
    const response = await request(app.getHttpServer())
      .get('/v2/health')
      .expect(200);

    expect(response.headers['server']).toBeUndefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
```

### SQL Injection Tests

```typescript
describe('SQL Injection Prevention', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [DriverModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should prevent SQL injection in UUID parameters', async () => {
    const token = generateValidToken();
    const maliciousUuid = "'; DROP TABLE drivers; --";

    const response = await request(app.getHttpServer())
      .get(`/v2/drivers/${maliciousUuid}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.message).toContain('Validation failed');
  });

  it('should prevent SQL injection in query parameters', async () => {
    const token = generateValidToken();

    const response = await request(app.getHttpServer())
      .get('/v2/drivers')
      .query({ id: "'; DROP TABLE drivers; --" })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.message).toContain('Validation failed');
  });
});
```

---

## Data Validation

### Data Integrity Tests

```typescript
describe('Data Validation', () => {
  let db: DatabaseService;

  beforeAll(async () => {
    db = new DatabaseService(await createConnection(testDbConfig));
  });

  beforeEach(async () => {
    await db.clear();
  });

  describe('Driver Data Validation', () => {
    it('should validate driver creation', async () => {
      const invalidDriver = {
        name: '', // Empty name
        email: 'invalid-email', // Invalid email
        phone: '123', // Too short
        licenseNumber: '', // Empty
        currentLocation: { lat: 200, lon: 200 } // Invalid coordinates
      };

      await expect(
        db.drivers.create(invalidDriver)
      ).rejects.toThrow();

      const validDriver = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        licenseNumber: 'DL123456',
        currentLocation: { lat: 12.9, lon: 77.6 }
      };

      const createdDriver = await db.drivers.create(validDriver);
      expect(createdDriver.name).toBe('John Doe');
      expect(createdDriver.email).toBe('john@example.com');
    });

    it('should validate driver availability transitions', async () => {
      const driver = await createTestDriver({ availability: 'AVAILABLE' });

      // Valid transition: AVAILABLE -> ON_BREAK
      await db.drivers.update(driver.id, { availability: 'ON_BREAK' });
      const driverAfterBreak = await db.drivers.findOne(driver.id);
      expect(driverAfterBreak.availability).toBe('ON_BREAK');

      // Valid transition: ON_BREAK -> AVAILABLE
      await db.drivers.update(driver.id, { availability: 'AVAILABLE' });
      const driverAfterResume = await db.drivers.findOne(driver.id);
      expect(driverAfterResume.availability).toBe('AVAILABLE');

      // Invalid transition: AVAILABLE -> SHIFT_ENDED (should be allowed but logged)
      await db.drivers.update(driver.id, { availability: 'SHIFT_ENDED' });
      const driverAfterShift = await db.drivers.findOne(driver.id);
      expect(driverAfterShift.availability).toBe('SHIFT_ENDED');
    });
  });

  describe('Delivery Data Validation', () => {
    it('should validate delivery creation', async () => {
      const invalidDelivery = {
        sellerOrderId: '', // Empty
        pickupLocation: { lat: 200, lon: 200 }, // Invalid coordinates
        dropoffLocation: { lat: 12.9, lon: 77.6 },
        status: 'INVALID_STATUS' // Invalid status
      };

      await expect(
        db.deliveries.create(invalidDelivery)
      ).rejects.toThrow();

      const validDelivery = {
        sellerOrderId: 'ORD123',
        pickupLocation: { lat: 12.9, lon: 77.6 },
        dropoffLocation: { lat: 12.91, lon: 77.61 },
        status: 'READY'
      };

      const createdDelivery = await db.deliveries.create(validDelivery);
      expect(createdDelivery.sellerOrderId).toBe('ORD123');
      expect(createdDelivery.status).toBe('READY');
    });

    it('should validate delivery status transitions', async () => {
      const delivery = await createTestDelivery({ status: 'READY' });

      // Valid transition: READY -> ASSIGNED
      await db.deliveries.update(delivery.id, { status: 'ASSIGNED' });
      const deliveryAfterAssignment = await db.deliveries.findOne(delivery.id);
      expect(deliveryAfterAssignment.status).toBe('ASSIGNED');

      // Valid transition: ASSIGNED -> PICKED_UP
      await db.deliveries.update(delivery.id, { status: 'PICKED_UP' });
      const deliveryAfterPickup = await db.deliveries.findOne(delivery.id);
      expect(deliveryAfterPickup.status).toBe('PICKED_UP');

      // Valid transition: PICKED_UP -> DELIVERED
      await db.deliveries.update(delivery.id, { status: 'DELIVERED' });
      const deliveryAfterDelivery = await db.deliveries.findOne(delivery.id);
      expect(deliveryAfterDelivery.status).toBe('DELIVERED');

      // Invalid transition: DELIVERED -> PICKED_UP (should be prevented)
      await expect(
        db.deliveries.update(delivery.id, { status: 'PICKED_UP' })
      ).rejects.toThrow();
    });
  });

  describe('Offer Data Validation', () => {
    it('should validate offer creation', async () => {
      const driver = await createTestDriver();
      const delivery = await createTestDelivery();

      const invalidOffer = {
        deliveryId: 'invalid-uuid', // Invalid UUID
        driverId: driver.id,
        status: 'INVALID_STATUS',
        offerPayload: {}, // Empty payload
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 60000) // Past date
      };

      await expect(
        db.driverOffers.create(invalidOffer)
      ).rejects.toThrow();

      const validOffer = {
        deliveryId: delivery.id,
        driverId: driver.id,
        status: 'PENDING',
        offerPayload: {
          pickupLocation: { lat: 12.9, lon: 77.6 },
          estimatedPickupTimeMin: 15,
          estimatedEarning: 150.0
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      };

      const createdOffer = await db.driverOffers.create(validOffer);
      expect(createdOffer.status).toBe('PENDING');
      expect(createdOffer.offerPayload.estimatedPickupTimeMin).toBe(15);
    });

    it('should validate offer expiration', async () => {
      const driver = await createTestDriver();
      const delivery = await createTestDelivery();

      const expiredOffer = await db.driverOffers.create({
        deliveryId: delivery.id,
        driverId: driver.id,
        status: 'PENDING',
        offerPayload: {},
        createdAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() - 30000) // Expired
      });

      // Should be able to query expired offers
      const offers = await db.driverOffers.find({
        expiresAt: { $lt: new Date() }
      });
      expect(offers).toContain(expiredOffer);
    });
  });

  describe('Audit Log Data Validation', () => {
    it('should validate audit log creation', async () => {
      const invalidAuditLog = {
        deliveryId: 'invalid-uuid', // Invalid UUID
        timestamp: 'invalid-date', // Invalid date
        eventType: '', // Empty event type
        actorType: 'invalid-type', // Invalid actor type
        details: null // Null details
      };

      await expect(
        db.deliveryAuditLogs.create(invalidAuditLog)
      ).rejects.toThrow();

      const validAuditLog = {
        deliveryId: 'delivery-123',
        timestamp: new Date(),
        eventType: 'offer_created',
        actorType: 'system',
        details: { offerId: 'offer-123' },
        version: 1
      };

      const createdAuditLog = await db.deliveryAuditLogs.create(validAuditLog);
      expect(createdAuditLog.eventType).toBe('offer_created');
      expect(createdAuditLog.actorType).toBe('system');
    });

    it('should maintain audit log sequence', async () => {
      const deliveryId = 'delivery-123';

      const log1 = await db.deliveryAuditLogs.create({
        deliveryId,
        timestamp: new Date(),
        eventType: 'created',
        actorType: 'system',
        details: {},
        version: 1
      });

      const log2 = await db.deliveryAuditLogs.create({
        deliveryId,
        timestamp: new Date(),
        eventType: 'assigned',
        actorType: 'system',
        details: {},
        version: 2
      });

      const logs = await db.deliveryAuditLogs.findByDeliveryId(deliveryId);
      expect(logs).toHaveLength(2);
      expect(logs[0].version).toBe(1);
      expect(logs[1].version).toBe(2);
    });
  });

  describe('Zone Data Validation', () => {
    it('should validate zone creation', async () => {
      const invalidZone = {
        name: '', // Empty name
        geometry: 'INVALID_GEOMETRY', // Invalid geometry
        priorityLevel: 10, // Too high
        minDriversOnline: -1, // Negative
        avgWaitTimeSeconds: -100 // Negative
      };

      await expect(
        db.deliveryZones.create(invalidZone)
      ).rejects.toThrow();

      const validZone = {
        name: 'Downtown',
        geometry: 'POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))',
        priorityLevel: 1,
        minDriversOnline: 5,
        avgWaitTimeSeconds: 300,
        targetWaitTimeSeconds: 240
      };

      const createdZone = await db.deliveryZones.create(validZone);
      expect(createdZone.name).toBe('Downtown');
      expect(createdZone.priorityLevel).toBe(1);
    });

    it('should validate zone preferences', async () => {
      const driver = await createTestDriver();
      const zone = await createTestZone();

      const invalidPreference = {
        driverId: 'invalid-uuid', // Invalid driver
        zoneId: zone.id,
        preference: 'INVALID_PREFERENCE' // Invalid preference
      };

      await expect(
        db.driverZonePreferences.create(invalidPreference)
      ).rejects.toThrow();

      const validPreference = {
        driverId: driver.id,
        zoneId: zone.id,
        preference: 'PREFERRED',
        distanceToZoneCenter: 2.5
      };

      const createdPreference = await db.driverZonePreferences.create(validPreference);
      expect(createdPreference.preference).toBe('PREFERRED');
      expect(createdPreference.distanceToZoneCenter).toBe(2.5);
    });
  });
});
```

### Data Consistency Tests

```typescript
describe('Data Consistency', () => {
  let db: DatabaseService;

  beforeAll(async () => {
    db = new DatabaseService(await createConnection(testDbConfig));
  });

  beforeEach(async () => {
    await db.clear();
  });

  describe('Referential Integrity', () => {
    it('should maintain foreign key constraints', async () => {
      const driver = await createTestDriver();
      const delivery = await createTestDelivery();

      // Create offer with valid references
      const offer = await db.driverOffers.create({
        deliveryId: delivery.id,
        driverId: driver.id,
        status: 'PENDING',
        offerPayload: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      });

      expect(offer.deliveryId).toBe(delivery.id);
      expect(offer.driverId).toBe(driver.id);

      // Should not be able to delete referenced entities
      await expect(
        db.drivers.delete(driver.id)
      ).rejects.toThrow();

      await expect(
        db.deliveries.delete(delivery.id)
      ).rejects.toThrow();
    });

    it('should cascade deletes appropriately', async () => {
      const driver = await createTestDriver();
      const delivery = await createTestDelivery();

      // Create related entities
      const offer = await db.driverOffers.create({
        deliveryId: delivery.id,
        driverId: driver.id,
        status: 'PENDING',
        offerPayload: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      });

      const assignment = await db.assignments.create({
        driverId: driver.id,
        deliveryId: delivery.id,
        status: 'ACTIVE'
      });

      // Delete driver (should cascade to related entities)
      await db.drivers.delete(driver.id);

      // Related entities should be deleted
      const deletedOffer = await db.driverOffers.findOne(offer.id);
      expect(deletedOffer).toBeNull();

      const deletedAssignment = await db.assignments.findOne(assignment.id);
      expect(deletedAssignment).toBeNull();
    });
  });

  describe('Business Rule Validation', () => {
    it('should enforce unique driver availability', async () => {
      const driver = await createTestDriver({ availability: 'AVAILABLE' });

      // Should not be able to have multiple active assignments
      const assignment1 = await db.assignments.create({
        driverId: driver.id,
        deliveryId: 'delivery-1',
        status: 'ACTIVE'
      });

      await expect(
        db.assignments.create({
          driverId: driver.id,
          deliveryId: 'delivery-2',
          status: 'ACTIVE'
        })
      ).rejects.toThrow();

      // Complete first assignment
      await db.assignments.update(assignment1.id, { status: 'COMPLETED' });

      // Now should be able to create new assignment
      const assignment2 = await db.assignments.create({
        driverId: driver.id,
        deliveryId: 'delivery-2',
        status: 'ACTIVE'
      });

      expect(assignment2).toBeDefined();
    });

    it('should enforce offer uniqueness per delivery', async () => {
      const driver1 = await createTestDriver();
      const driver2 = await createTestDriver();
      const delivery = await createTestDelivery();

      // Create offer for driver1
      const offer1 = await db.driverOffers.create({
        deliveryId: delivery.id,
        driverId: driver1.id,
        status: 'PENDING',
        offerPayload: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      });

      // Create offer for driver2 (should be allowed)
      const offer2 = await db.driverOffers.create({
        deliveryId: delivery.id,
        driverId: driver2.id,
        status: 'PENDING',
        offerPayload: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      });

      expect(offer1).toBeDefined();
      expect(offer2).toBeDefined();

      // Accept offer1
      await db.driverOffers.update(offer1.id, { status: 'ACCEPTED' });

      // Should not be able to accept offer2
      await expect(
        db.driverOffers.update(offer2.id, { status: 'ACCEPTED' })
      ).rejects.toThrow();
    });
  });

  describe('Data Validation Rules', () => {
    it('should validate coordinate ranges', async () => {
      const invalidCoordinates = [
        { lat: 100, lon: 77.6 }, // Invalid latitude
        { lat: 12.9, lon: 200 }, // Invalid longitude
        { lat: -100, lon: 77.6 }, // Invalid latitude
        { lat: 12.9, lon: -200 } // Invalid longitude
      ];

      for (const coords of invalidCoordinates) {
        await expect(
          createTestDriver({ currentLocation: coords })
        ).rejects.toThrow();
      }

      const validCoordinates = { lat: 12.9, lon: 77.6 };
      const driver = await createTestDriver({ currentLocation: validCoordinates });
      expect(driver.currentLocation.lat).toBe(12.9);
      expect(driver.currentLocation.lon).toBe(77.6);
    });

    it('should validate time ranges', async () => {
      const invalidTimes = [
        new Date('invalid-date'),
        new Date('2020-01-01'), // Too far in past
        new Date('2100-01-01') // Too far in future
      ];

      for (const time of invalidTimes) {
        await expect(
          createTestDelivery({ createdAt: time })
        ).rejects.toThrow();
      }

      const validTime = new Date();
      const delivery = await createTestDelivery({ createdAt: validTime });
      expect(delivery.createdAt).toEqual(validTime);
    });
  });
});
```

---

## Monitoring & Observability

### Metrics Collection Tests

```typescript
describe('Monitoring & Observability', () => {
  let metricsService: MetricsService;
  let logger: MockProxy<LoggerService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: LoggerService,
          useValue: mock<LoggerService>()
        }
      ]
    }).compile();

    metricsService = module.get<MetricsService>(MetricsService);
    logger = module.get(LoggerService);
  });

  describe('Metrics Collection', () => {
    it('should record offer creation latency', () => {
      const latency = 0.5; // 500ms

      metricsService.recordOfferCreationLatency(latency);

      expect(logger.info).toHaveBeenCalledWith(
        'metrics_recorded',
        expect.objectContaining({
          metric: 'offer_creation_latency',
          value: latency
        })
      );
    });

    it('should record offer acceptance rate', () => {
      const rate = 0.85; // 85%

      metricsService.recordOfferAcceptanceRate(rate);

      expect(logger.info).toHaveBeenCalledWith(
        'metrics_recorded',
        expect.objectContaining({
          metric: 'offer_acceptance_rate',
          value: rate
        })
      );
    });

    it('should record assignment latency', () => {
      const latency = 1.2; // 1.2 seconds

      metricsService.recordAssignmentLatency(latency);

      expect(logger.info).toHaveBeenCalledWith(
        'metrics_recorded',
        expect.objectContaining({
          metric: 'assignment_latency',
          value: latency
        })
      );
    });

    it('should record unassigned order count', () => {
      const count = 10;

      metricsService.recordUnassignedOrderCount(count);

      expect(logger.info).toHaveBeenCalledWith(
        'metrics_recorded',
        expect.objectContaining({
          metric: 'unassigned_order_count',
          value: count
        })
      );
    });

    it('should record driver availability by status', () => {
      metricsService.recordDriverAvailability('AVAILABLE', 50);
      metricsService.recordDriverAvailability('BUSY', 30);
      metricsService.recordDriverAvailability('ON_BREAK', 20);

      expect(logger.info).toHaveBeenCalledWith(
        'metrics_recorded',
        expect.objectContaining({
          metric: 'driver_availability',
          labels: { status: 'AVAILABLE' },
          value: 50
        })
      );
    });
  });

  describe('Health Checks', () => {
    it('should perform database health check', async () => {
      const healthCheck = await metricsService.performHealthCheck('database');

      expect(healthCheck.status).toBe('healthy');
      expect(healthCheck.responseTime).toBeDefined();
      expect(healthCheck.timestamp).toBeDefined();
    });

    it('should perform Redis health check', async () => {
      const healthCheck = await metricsService.performHealthCheck('redis');

      expect(healthCheck.status).toBe('healthy');
      expect(healthCheck.responseTime).toBeDefined();
      expect(healthCheck.timestamp).toBeDefined();
    });

    it('should detect unhealthy services', async () => {
      // Mock unhealthy service
      jest.spyOn(metricsService as any, 'checkDatabase').mockRejectedValue(new Error('Connection failed'));

      const healthCheck = await metricsService.performHealthCheck('database');

      expect(healthCheck.status).toBe('unhealthy');
      expect(healthCheck.error).toBeDefined();
    });
  });

  describe('Alerting', () => {
    it('should trigger alerts for high error rates', () => {
      const errorRate = 0.15; // 15%

      metricsService.checkErrorRate(errorRate);

      expect(logger.warn).toHaveBeenCalledWith(
        'high_error_rate_detected',
        expect.objectContaining({
          errorRate,
          threshold: 0.1
        })
      );
    });

    it('should trigger alerts for slow response times', () => {
      const responseTime = 3000; // 3 seconds

      metricsService.checkResponseTime(responseTime);

      expect(logger.warn).toHaveBeenCalledWith(
        'slow_response_time_detected',
        expect.objectContaining({
          responseTime,
          threshold: 2000
        })
      );
    });

    it('should trigger alerts for high unassigned order count', () => {
      const unassignedCount = 50;

      metricsService.checkUnassignedOrderCount(unassignedCount);

      expect(logger.warn).toHaveBeenCalledWith(
        'high_unassigned_order_count',
        expect.objectContaining({
          count: unassignedCount,
          threshold: 20
        })
      );
    });
  });

  describe('Dashboard Data', () => {
    it('should generate dashboard metrics', async () => {
      const dashboardData = await metricsService.generateDashboardData();

      expect(dashboardData).toBeDefined();
      expect(dashboardData.offerCreationLatency).toBeDefined();
      expect(dashboardData.offerAcceptanceRate).toBeDefined();
      expect(dashboardData.assignmentLatency).toBeDefined();
      expect(dashboardData.unassignedOrderCount).toBeDefined();
      expect(dashboardData.driverAvailability).toBeDefined();
    });

    it('should generate SLA metrics', async () => {
      const slaMetrics = await metricsService.generateSLAMetrics();

      expect(slaMetrics).toBeDefined();
      expect(slaMetrics.offerCreationSLA).toBeDefined();
      expect(slaMetrics.assignmentSLA).toBeDefined();
      expect(slaMetrics.escalationSLA).toBeDefined();
      expect(slaMetrics.overallSLA).toBeDefined();
    });
  });
});
```

### Logging Tests

```typescript
describe('Structured Logging', () => {
  let logger: LoggerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [LoggerService]
    }).compile();

    logger = module.get<LoggerService>(LoggerService);
  });

  describe('Log Levels', () => {
    it('should log info messages', () => {
      logger.info('test_message', { key: 'value' });

      expect(logger.info).toHaveBeenCalledWith('test_message', { key: 'value' });
    });

    it('should log warn messages', () => {
      logger.warn('test_warning', { key: 'value' });

      expect(logger.warn).toHaveBeenCalledWith('test_warning', { key: 'value' });
    });

    it('should log error messages', () => {
      logger.error('test_error', new Error('Test error'), { key: 'value' });

      expect(logger.error).toHaveBeenCalledWith('test_error', expect.any(Error), { key: 'value' });
    });
  });

  describe('Contextual Logging', () => {
    it('should include request context', () => {
      const context = {
        requestId: 'req-123',
        userId: 'user-123',
        operation: 'create_offer'
      };

      logger.info('offer_created', { offerId: 'offer-123' }, context);

      expect(logger.info).toHaveBeenCalledWith(
        'offer_created',
        { offerId: 'offer-123' },
        context
      );
    });

    it('should include performance context', () => {
      const performanceContext = {
        duration: 500,
        memoryUsage: 1024,
        cpuUsage: 50
      };

      logger.info('operation_completed', { result: 'success' }, performanceContext);

      expect(logger.info).toHaveBeenCalledWith(
        'operation_completed',
        { result: 'success' },
        performanceContext
      );
    });
  });

  describe('Error Context', () => {
    it('should include error details', () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';

      const errorContext = {
        errorCode: 'TEST_ERROR',
        severity: 'high',
        component: 'offer_service'
      };

      logger.error('operation_failed', error, errorContext);

      expect(logger.error).toHaveBeenCalledWith(
        'operation_failed',
        error,
        expect.objectContaining({
          errorCode: 'TEST_ERROR',
          severity: 'high',
          component: 'offer_service',
          stack: 'Error stack trace'
        })
      );
    });
  });
});
```

### Distributed Tracing Tests

```typescript
describe('Distributed Tracing', () => {
  let tracer: TracerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TracerService]
    }).compile();

    tracer = module.get<TracerService>(TracerService);
  });

  describe('Trace Creation', () => {
    it('should create spans for operations', async () => {
      const span = tracer.startSpan('create_offer', {
        driverId: 'driver-123',
        deliveryId: 'delivery-123'
      });

      expect(span).toBeDefined();
      expect(span.operationName).toBe('create_offer');

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));

      tracer.finishSpan(span, { success: true });

      expect(span.duration).toBeGreaterThan(0);
      expect(span.tags.success).toBe(true);
    });

    it('should handle nested spans', async () => {
      const parentSpan = tracer.startSpan('create_offer');

      const childSpan1 = tracer.startSpan('calculate_distance', parentSpan);
      await new Promise(resolve => setTimeout(resolve, 50));
      tracer.finishSpan(childSpan1, { distance: 2.5 });

      const childSpan2 = tracer.startSpan('send_notification', parentSpan);
      await new Promise(resolve => setTimeout(resolve, 50));
      tracer.finishSpan(childSpan2, { sent: true });

      tracer.finishSpan(parentSpan, { offerId: 'offer-123' });

      expect(parentSpan.duration).toBeGreaterThan(100);
      expect(childSpan1.duration).toBeGreaterThan(0);
      expect(childSpan2.duration).toBeGreaterThan(0);
    });
  });

  describe('Error Tracing', () => {
    it('should record errors in spans', async () => {
      const span = tracer.startSpan('create_offer');

      try {
        throw new Error('Test error');
      } catch (error) {
        tracer.recordError(span, error);
        tracer.finishSpan(span, { success: false });
      }

      expect(span.tags.error).toBe(true);
      expect(span.logs).toHaveLength(1);
      expect(span.logs[0].message).toContain('Test error');
    });
  });

  describe('Trace Context', () => {
    it('should propagate trace context', async () => {
      const span = tracer.startSpan('create_offer');
      const context = tracer.getTraceContext(span);

      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();

      // Simulate context propagation to another service
      const childSpan = tracer.startSpan('calculate_distance', null, context);
      tracer.finishSpan(childSpan);

      expect(childSpan.traceId).toBe(span.traceId);
    });
  });
});
```

---

## Testing Infrastructure

### Test Environment Setup

```typescript
// test-environment.ts
export class TestEnvironment {
  private static instance: TestEnvironment;
  private db: DatabaseService;
  private redisService: RedisService;
  private app: INestApplication;

  private constructor() {}

  static getInstance(): TestEnvironment {
    if (!TestEnvironment.instance) {
      TestEnvironment.instance = new TestEnvironment();
    }
    return TestEnvironment.instance;
  }

  async setup(): Promise<void> {
    // Setup test database
    this.db = await this.setupTestDatabase();

    // Setup test Redis
    this.redisService = await this.setupTestRedis();

    // Setup test application
    this.app = await this.setupTestApp();

    // Seed test data
    await this.seedTestData();
  }

  async teardown(): Promise<void> {
    // Cleanup test data
    await this.cleanupTestData();

    // Close connections
    await this.app.close();
    await this.redisService.disconnect();
    await this.db.close();
  }

  async reset(): Promise<void> {
    await this.cleanupTestData();
    await this.seedTestData();
  }

  private async setupTestDatabase(): Promise<DatabaseService> {
    const connection = await createConnection({
      type: 'postgres',
      host: process.env.TEST_DB_HOST,
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      username: process.env.TEST_DB_USERNAME,
      password: process.env.TEST_DB_PASSWORD,
      database: process.env.TEST_DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
      logging: false
    });

    return new DatabaseService(connection);
  }

  private async setupTestRedis(): Promise<RedisService> {
    const redisService = new RedisService({
      host: process.env.TEST_REDIS_HOST,
      port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
      retryAttempts: 3
    });

    await redisService.connect();
    await redisService.flushall();

    return redisService;
  }

  private async setupTestApp(): Promise<INestApplication> {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    return app;
  }

  private async seedTestData(): Promise<void> {
    // Seed test drivers
    const drivers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createTestDriver({
        id: `driver-${i}`,
        availability: 'AVAILABLE',
        currentLocation: {
          lat: 12.9 + (i * 0.001),
          lon: 77.6 + (i * 0.001)
        }
      }))
    );

    // Seed test deliveries
    const deliveries = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createTestDelivery({
        id: `delivery-${i}`,
        status: 'READY',
        pickupLocation: {
          lat: 12.91 + (i * 0.001),
          lon: 77.61 + (i * 0.001)
        }
      }))
    );

    // Seed test zones
    const zones = await Promise.all(
      Array.from({ length: 3 }, (_, i) => createTestZone({
        id: `zone-${i}`,
        name: `Zone ${i}`,
        priorityLevel: i + 1,
        minDriversOnline: 3
      }))
    );
  }

  private async cleanupTestData(): Promise<void> {
    await this.db.clear();
    await this.redisService.flushall();
  }

  getDb(): DatabaseService {
    return this.db;
  }

  getRedis(): RedisService {
    return this.redisService;
  }

  getApp(): INestApplication {
    return this.app;
  }
}

// Usage in tests
describe('Driver Service Tests', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = TestEnvironment.getInstance();
    await env.setup();
  });

  afterAll(async () => {
    await env.teardown();
  });

  beforeEach(async () => {
    await env.reset();
  });

  it('should create driver successfully', async () => {
    const db = env.getDb();
    const driver = await createTestDriver();

    const createdDriver = await db.drivers.create(driver);
    expect(createdDriver).toBeDefined();
    expect(createdDriver.id).toBeDefined();
  });
});
```

### Test Data Factories

```typescript
// test-factories.ts
export class TestDataFactory {
  static createDriver(overrides: Partial<Driver> = {}): Driver {
    return {
      id: `driver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Test Driver',
      email: `driver${Date.now()}@example.com`,
      phone: '+1234567890',
      licenseNumber: `DL${Date.now()}`,
      availability: 'AVAILABLE',
      currentLocation: {
        lat: 12.9 + Math.random() * 0.1,
        lon: 77.6 + Math.random() * 0.1
      },
      rating: 4.5 + Math.random(),
      totalDeliveries: Math.floor(Math.random() * 100),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createDelivery(overrides: Partial<Delivery> = {}): Delivery {
    return {
      id: `delivery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sellerOrderId: `ORD-${Date.now()}`,
      pickupLocation: {
        lat: 12.9 + Math.random() * 0.1,
        lon: 77.6 + Math.random() * 0.1
      },
      dropoffLocation: {
        lat: 12.91 + Math.random() * 0.1,
        lon: 77.61 + Math.random() * 0.1
      },
      storeName: 'Test Store',
      sellerId: `seller-${Date.now()}`,
      status: 'READY',
      estimatedPickupTime: new Date(Date.now() + 600000), // 10 minutes
      estimatedDeliveryTime: new Date(Date.now() + 1200000), // 20 minutes
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createOffer(overrides: Partial<DriverOffer> = {}): DriverOffer {
    return {
      id: `offer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      deliveryId: `delivery-${Date.now()}`,
      driverId: `driver-${Date.now()}`,
      status: 'PENDING',
      offerPayload: {
        pickupLocation: { lat: 12.9, lon: 77.6 },
        pickupStoreName: 'Test Store',
        estimatedPickupTimeMin: 15,
        estimatedDeliveryTime: new Date(Date.now() + 1200000).toISOString(),
        estimatedDistanceKm: 2.5,
        estimatedEarning: 150.0
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30000),
      ...overrides
    };
  }

  static createAssignment(overrides: Partial<Assignment> = {}): Assignment {
    return {
      id: `assignment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      driverId: `driver-${Date.now()}`,
      deliveryId: `delivery-${Date.now()}`,
      status: 'ACTIVE',
      pickupTime: null,
      deliveryTime: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createZone(overrides: Partial<DeliveryZone> = {}): DeliveryZone {
    return {
      id: `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Zone ${Date.now()}`,
      geometry: 'POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))',
      priorityLevel: 1,
      minDriversOnline: 5,
      currentDriversOnline: 3,
      avgWaitTimeSeconds: 300,
      targetWaitTimeSeconds: 240,
      lastUpdated: new Date(),
      ...overrides
    };
  }

  static createUnassignedOrder(overrides: Partial<UnassignedOrder> = {}): UnassignedOrder {
    return {
      id: `unassigned-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      deliveryId: `delivery-${Date.now()}`,
      sellerOrderId: `ORD-${Date.now()}`,
      location: { lat: 12.9, lon: 77.6 },
      failureReason: 'no_available_drivers',
      firstAttemptAt: new Date(Date.now() - 300000), // 5 minutes ago
      lastAttemptAt: new Date(Date.now() - 60000), // 1 minute ago
      attemptCount: 1,
      escalationLevel: 0,
      escalationStatus: 'PENDING',
      createdAt: new Date(),
      ...overrides
    };
  }

  static createAuditLog(overrides: Partial<DeliveryAuditLog> = {}): DeliveryAuditLog {
    return {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      deliveryId: `delivery-${Date.now()}`,
      timestamp: new Date(),
      eventType: 'offer_created',
      actorId: `user-${Date.now()}`,
      actorType: 'system',
      details: { offerId: `offer-${Date.now()}` },
      version: 1,
      ...overrides
    };
  }

  // Batch creation methods
  static async createDrivers(count: number, overrides: Partial<Driver> = {}): Promise<Driver[]> {
    return Promise.all(
      Array.from({ length: count }, () => this.createDriver(overrides))
    );
  }

  static async createDeliveries(count: number, overrides: Partial<Delivery> = {}): Promise<Delivery[]> {
    return Promise.all(
      Array.from({ length: count }, () => this.createDelivery(overrides))
    );
  }

  static async createOffers(count: number, overrides: Partial<DriverOffer> = {}): Promise<DriverOffer[]> {
    return Promise.all(
      Array.from({ length: count }, () => this.createOffer(overrides))
    );
  }
}
```

### Test Utilities

```typescript
// test-utils.ts
export class TestUtils {
  static async waitForCondition(
    condition: () => Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static async waitForEvent(
    eventName: string,
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Event ${eventName} not received within ${timeout}ms`));
      }, timeout);

      // Mock event listener
      const eventListener = (event: any) => {
        if (event.type === eventName) {
          clearTimeout(timeoutId);
          resolve(event);
        }
      };

      // Add event listener (implementation depends on event system)
      // eventBus.on(eventName, eventListener);
    });
  }

  static generateRandomString(length: number = 10): string {
    return Math.random().toString(36).substr(2, length);
  }

  static generateRandomEmail(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
  }

  static generateRandomPhone(): string {
    return `+${Math.floor(Math.random() * 9000000000) + 1000000000}`;
  }

  static async measureExecutionTime<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    return { result, duration };
  }

  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  static async parallel<T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number = 10
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<any>[] = [];

    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }

  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async cleanupDatabase(db: DatabaseService): Promise<void> {
    await db.clear();
  }

  static async cleanupRedis(redis: RedisService): Promise<void> {
    await redis.flushall();
  }

  static async cleanupAll(db: DatabaseService, redis: RedisService): Promise<void> {
    await Promise.all([
      this.cleanupDatabase(db),
      this.cleanupRedis(redis)
    ]);
  }
}
```

This comprehensive testing and validation strategy ensures that all V2 features are thoroughly tested across multiple dimensions:

1. **Unit Testing**: Individual service components with mocked dependencies
2. **Integration Testing**: Service-to-service interactions with real databases
3. **E2E Testing**: Complete user workflows and cross-service scenarios
4. **Load Testing**: Performance under high concurrent load
5. **Contract Testing**: API contract validation between services
6. **Security Testing**: Authentication, authorization, and input validation
7. **Data Validation**: Data integrity and business rule enforcement
8. **Monitoring**: Metrics collection, logging, and observability
9. **Testing Infrastructure**: Reusable test environments and utilities

Each testing layer builds upon the previous one, ensuring comprehensive coverage and confidence in the implementation quality.