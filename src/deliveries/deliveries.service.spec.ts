import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DeliveriesService } from './deliveries.service';
import { Delivery, DeliveryStatus } from './entities/delivery.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { WebhooksService } from '../webhooks/webhooks.service';
import { DeliveryEventsNotifier } from './delivery-events.notifier';
import { DeliveryStateMachine } from './delivery-state-machine.service';
import { OutboxService } from '../domain-events/outbox.service';
import { WebSocketService } from '../websocket/websocket.service';
import { DeliveryMetricsService } from '../delivery-intelligence/delivery/delivery-metrics.service';
import { DriverStatsService } from '../delivery-intelligence/driver/driver-stats.service';

describe('DeliveriesService Projections', () => {
  let service: DeliveriesService;
  let metricsService: any;
  let statsService: any;
  let deliveryRepo: any;

  beforeEach(async () => {
    metricsService = {
      recordAssignment: jest.fn(),
      recordPickup: jest.fn(),
      recordDelivery: jest.fn(),
      recordFailure: jest.fn(),
      recordCancellation: jest.fn(),
    };

    statsService = {
      recordDeliveryCompleted: jest.fn(),
      recordDeliveryFailed: jest.fn(),
      recordDeliveryCancelled: jest.fn(),
    };

    deliveryRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    // Mock DataSource transaction to just execute the callback
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const manager = {
          findOne: deliveryRepo.findOne,
          save: deliveryRepo.save,
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveriesService,
        { provide: getRepositoryToken(Delivery), useValue: deliveryRepo },
        { provide: getRepositoryToken(DeliveryEvent), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: WebhooksService, useValue: { emitDeliveryPickedUp: jest.fn(), emitDeliveryDelivered: jest.fn() } },
        { provide: DeliveryEventsNotifier, useValue: { notify: jest.fn() } },
        { provide: DeliveryStateMachine, useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: OutboxService, useValue: { publish: jest.fn() } },
        { provide: WebSocketService, useValue: { emitDeliveryAssigned: jest.fn() } },
        { provide: DeliveryMetricsService, useValue: metricsService },
        { provide: DriverStatsService, useValue: statsService },
      ],
    }).compile();

    service = module.get<DeliveriesService>(DeliveriesService);
  });

  describe('Lifecycle Projection Updates', () => {
    const mockDelivery = {
      id: 'del-123',
      sellerOrderId: 'seller-123',
      status: DeliveryStatus.ASSIGNED,
      driverId: 'drv-1',
      assignedAt: new Date(),
    };

    it('pickup updates projection timing in delivery_metrics', async () => {
      deliveryRepo.findOne.mockResolvedValue({ ...mockDelivery });

      await service.updateStatus('del-123', { status: 'PICKED_UP' });

      expect(metricsService.recordPickup).toHaveBeenCalled();
    });

    it('OTP delivery (success) updates delivery_metrics and driver_stats', async () => {
      const pendingOtpDelivery = { ...mockDelivery, deliveryOtp: '123456', status: DeliveryStatus.PICKED_UP };
      deliveryRepo.findOne.mockResolvedValue(pendingOtpDelivery);

      await service.verifyOtp('del-123', '123456');

      expect(metricsService.recordDelivery).toHaveBeenCalled();
      expect(statsService.recordDeliveryCompleted).toHaveBeenCalledWith(
        'drv-1',
        expect.objectContaining({
          deliveredAt: expect.any(Date),
        })
      );
    });

    it('failed delivery updates both projections', async () => {
      deliveryRepo.findOne.mockResolvedValue({ ...mockDelivery });

      await service.updateStatus('del-123', { status: 'FAILED', failureCode: 'TIMEOUT' });

      expect(metricsService.recordFailure).toHaveBeenCalled();
      expect(statsService.recordDeliveryFailed).toHaveBeenCalledWith('drv-1');
    });

    it('cancelled-without-driver does not crash and updates metrics', async () => {
      const unassignedDelivery = { ...mockDelivery, driverId: null, status: DeliveryStatus.PENDING };
      deliveryRepo.findOne.mockResolvedValue(unassignedDelivery);

      await service.cancelDelivery('del-123');

      // Should update delivery metrics for the cancellation
      expect(metricsService.recordCancellation).toHaveBeenCalled();
      // Should NOT attempt to update driver stats since there is no driver
      expect(statsService.recordDeliveryCancelled).not.toHaveBeenCalled();
    });
  });
});
