import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SafeDispatchService } from './safe-dispatch.service';
import { DispatchDecision, DispatchCohort, DispatchMethod, DispatchStatus } from './entities/dispatch-decision.entity';
import { DispatchScoringService } from '../dispatch-scoring/dispatch-scoring.service';
import { DispatchConfigService } from '../dispatch-scoring/dispatch-config.service';
import { DriversService } from '../drivers/drivers.service';

describe('SafeDispatchService', () => {
  let service: SafeDispatchService;
  let dispatchDecisionRepo: any;
  let dispatchConfigService: any;

  const mockDeliveryId = 'del-123';
  const mockDriverId = 'drv-456';
  const fallbackCallback = jest.fn();

  beforeEach(async () => {
    dispatchDecisionRepo = {
      create: jest.fn().mockImplementation((dto) => ({ id: 'decision-123', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn().mockResolvedValue({ id: 'decision-123' }),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue(null),
      }),
    };

    dispatchConfigService = {
      getConfig: jest.fn().mockResolvedValue({
        scoringEnabled: true,
        rolloutPercentage: 100, // Force SCORING cohort for tests
        fallbackThresholds: { maxProcessingTime: 5000, maxFailureRate: 0.1, minAcceptanceRate: 0.7 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeDispatchService,
        { provide: getRepositoryToken(DispatchDecision), useValue: dispatchDecisionRepo },
        { provide: DispatchScoringService, useValue: {} },
        { provide: DispatchConfigService, useValue: dispatchConfigService },
        { provide: DataSource, useValue: {} },
        { provide: DriversService, useValue: {} },
      ],
    }).compile();

    service = module.get<SafeDispatchService>(SafeDispatchService);
    fallbackCallback.mockClear();
  });

  describe('executeSafeDispatch', () => {
    it('should select expected driver via scored dispatch path', async () => {
      const eligibleDrivers = [
        { driverId: 'drv-low', score: 60, driver: {} as any },
        { driverId: mockDriverId, score: 95, driver: {} as any }, // Highest score
      ];

      const result = await service.executeSafeDispatch(mockDeliveryId, eligibleDrivers, fallbackCallback);

      expect(result.method).toBe('SCORING_BASED');
      expect(result.driverId).toBe(mockDriverId);
      expect(fallbackCallback).not.toHaveBeenCalled();
      
      // Verify decision was persisted correctly
      expect(dispatchDecisionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchStatus: DispatchStatus.ASSIGNED,
          scoreUsed: 95,
        })
      );
    });

    it('should trigger fallback path if scoring fails (e.g., no eligible drivers)', async () => {
      fallbackCallback.mockResolvedValue({ status: 'success', method: 'legacy' });

      // Empty array will cause executeScoringDispatch to throw a BadRequestException
      const result = await service.executeSafeDispatch(mockDeliveryId, [], fallbackCallback);

      expect(fallbackCallback).toHaveBeenCalledWith(mockDeliveryId, expect.stringContaining('No eligible drivers found'));
      expect(result.method).toBe('legacy');

      // Verify the failure and fallback reason were persisted
      expect(dispatchDecisionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchStatus: DispatchStatus.FAILED,
          fallbackReason: 'No eligible drivers found for scoring dispatch',
        })
      );
    });

    it('should trigger fallback immediately if health metrics indicate degraded state', async () => {
      // Mock getRecentFailureRate to return 50% (exceeds 10% threshold)
      jest.spyOn(service as any, 'getRecentFailureRate').mockResolvedValue(0.5);
      fallbackCallback.mockResolvedValue({ status: 'success', method: 'legacy' });

      const result = await service.executeSafeDispatch(mockDeliveryId, [{ driverId: mockDriverId, score: 90, driver: {} as any }], fallbackCallback);

      expect(fallbackCallback).toHaveBeenCalled();
      expect(result.method).toBe('legacy');
      
      // Verify decision caught the degraded state before even attempting scoring
      expect(dispatchDecisionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchStatus: DispatchStatus.FAILED,
          fallbackReason: expect.stringContaining('High failure rate'),
        })
      );
    });
  });
});
