import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { SafeDispatchService } from "./safe-dispatch.service";
import {
  DispatchDecision,
  DispatchCohort,
  DispatchMethod,
  DispatchStatus,
} from "./entities/dispatch-decision.entity";
import { DispatchScoringService } from "../dispatch-scoring/dispatch-scoring.service";
import { DispatchConfigService } from "../dispatch-scoring/dispatch-config.service";
import { DriversService } from "../drivers/drivers.service";

describe("SafeDispatchService", () => {
  let service: SafeDispatchService;
  let dispatchDecisionRepository: Repository<DispatchDecision>;
  let dataSource: DataSource;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockManager = {
    getRepository: jest.fn(() => mockRepository),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) => callback(mockManager)),
  };

  const mockDispatchScoringService = {
    isDriverEligible: jest.fn(),
    getCurrentScore: jest.fn(),
  };

  const mockDispatchConfigService = {
    getConfig: jest.fn(),
  };

  const mockDriversService = {
    findAvailable: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeDispatchService,
        {
          provide: getRepositoryToken(DispatchDecision),
          useValue: mockRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: DispatchScoringService,
          useValue: mockDispatchScoringService,
        },
        {
          provide: DispatchConfigService,
          useValue: mockDispatchConfigService,
        },
        {
          provide: DriversService,
          useValue: mockDriversService,
        },
      ],
    }).compile();

    service = module.get<SafeDispatchService>(SafeDispatchService);
    dispatchDecisionRepository = module.get<Repository<DispatchDecision>>(
      getRepositoryToken(DispatchDecision),
    );
    dataSource = module.get<DataSource>(DataSource);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("executeIdempotentFallback", () => {
    it("should prevent concurrent fallback execution for same delivery", async () => {
      const deliveryId = "delivery-123";
      const reason = "High failure rate";

      // Mock: no existing ASSIGNED decision, but a pending claim exists
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(null) // No existing ASSIGNED
        .mockResolvedValueOnce({
          // Pending claim exists
          id: "claim-456",
          deliveryId,
          dispatchStatus: DispatchStatus.PENDING,
          metadata: { fallbackClaim: "true" },
        });

      const fallbackCallback = jest.fn();

      const result = await (service as any).executeIdempotentFallback(
        deliveryId,
        reason,
        fallbackCallback,
      );

      // Should return in-progress status without executing callback
      expect(result.inProgress).toBe(true);
      expect(fallbackCallback).not.toHaveBeenCalled();
    });

    it("should return existing result if fallback already executed", async () => {
      const deliveryId = "delivery-123";
      const reason = "High failure rate";

      // Mock: existing ASSIGNED decision
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        id: "decision-789",
        deliveryId,
        dispatchStatus: DispatchStatus.ASSIGNED,
        dispatchMethod: DispatchMethod.LEGACY,
      });

      const fallbackCallback = jest.fn();

      const result = await (service as any).executeIdempotentFallback(
        deliveryId,
        reason,
        fallbackCallback,
      );

      // Should return already-executed status without executing callback
      expect(result.alreadyExecuted).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(fallbackCallback).not.toHaveBeenCalled();
    });

    it("should claim and execute fallback when no existing decision", async () => {
      const deliveryId = "delivery-123";
      const reason = "High failure rate";

      // Mock: no existing decisions
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(null) // No existing ASSIGNED
        .mockResolvedValueOnce(null); // No pending claim

      // Mock: claim creation
      mockRepository.create.mockReturnValue({
        deliveryId,
        cohort: DispatchCohort.CONTROL,
        dispatchMethod: DispatchMethod.LEGACY,
        dispatchStatus: DispatchStatus.PENDING,
      });
      mockRepository.save.mockResolvedValue({
        id: "generated-claim-id",
        deliveryId,
      });

      // Mock: findOne for updateDispatchDecision
      mockRepository.findOne.mockResolvedValue({
        id: "generated-claim-id",
        deliveryId,
        cohort: DispatchCohort.CONTROL,
        dispatchMethod: DispatchMethod.LEGACY,
        dispatchStatus: DispatchStatus.PENDING,
        updatedAt: new Date(),
      });

      const fallbackCallback = jest.fn().mockResolvedValue({
        driverId: "driver-456",
        method: "LEGACY",
      });

      const result = await (service as any).executeIdempotentFallback(
        deliveryId,
        reason,
        fallbackCallback,
      );

      // Should execute callback
      expect(fallbackCallback).toHaveBeenCalledWith(deliveryId, reason);
      expect(result).toBeDefined();
    });

    it("should handle callback errors and update claim to FAILED", async () => {
      const deliveryId = "delivery-123";
      const reason = "High failure rate";
      const claimId = "claim-error-123";

      // Mock: no existing decisions
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // Mock: claim creation
      const claimDecision = {
        id: claimId,
        deliveryId,
        cohort: DispatchCohort.CONTROL,
        dispatchMethod: DispatchMethod.LEGACY,
        dispatchStatus: DispatchStatus.PENDING,
      };
      mockRepository.create.mockReturnValue(claimDecision);
      mockRepository.save.mockResolvedValue({
        id: claimId,
        deliveryId,
      });

      // Mock: findOne for updateDispatchDecision
      mockRepository.findOne.mockResolvedValue({
        ...claimDecision,
        updatedAt: new Date(),
      });

      const fallbackCallback = jest
        .fn()
        .mockRejectedValue(new Error("Dispatch failed"));

      await expect(
        (service as any).executeIdempotentFallback(
          deliveryId,
          reason,
          fallbackCallback,
        ),
      ).rejects.toThrow("Dispatch failed");

      // Should update claim to FAILED
      const saveCalls = mockRepository.save.mock.calls;
      const failedUpdate = saveCalls.find(
        (call: any[]) => call[0]?.dispatchStatus === DispatchStatus.FAILED,
      );
      expect(failedUpdate).toBeDefined();
    });
  });

  describe("executeSafeDispatch", () => {
    it("should use transaction for decision persistence", async () => {
      const deliveryId = "delivery-123";
      const eligibleDrivers = [
        { driverId: "driver-1", score: 90, driver: {} as any },
      ];

      mockDispatchConfigService.getConfig.mockResolvedValue({
        scoringEnabled: true,
        rolloutPercentage: 100,
      });

      const decision = {
        id: "decision-1",
        deliveryId,
        cohort: DispatchCohort.SCORING,
        dispatchMethod: DispatchMethod.SCORING_BASED,
        dispatchStatus: DispatchStatus.PENDING,
      };
      mockRepository.create.mockReturnValue(decision);
      mockRepository.save.mockResolvedValue({
        id: "decision-1",
      });

      // Mock: findOne for updateDispatchDecision
      mockRepository.findOne.mockResolvedValue({
        ...decision,
        updatedAt: new Date(),
      });

      mockDispatchScoringService.isDriverEligible.mockResolvedValue(true);
      mockDispatchScoringService.getCurrentScore.mockResolvedValue(90);

      const fallbackCallback = jest.fn();

      await service.executeSafeDispatch(
        deliveryId,
        eligibleDrivers,
        fallbackCallback,
      );

      // Should use transaction
      expect(mockDataSource.transaction).toHaveBeenCalled();

      // Should create decision within transaction
      expect(mockManager.getRepository).toHaveBeenCalledWith(DispatchDecision);
    });

    it("should fall back when scoring is disabled", async () => {
      const deliveryId = "delivery-123";
      const eligibleDrivers = [
        { driverId: "driver-1", score: 90, driver: {} as any },
      ];

      mockDispatchConfigService.getConfig.mockResolvedValue({
        scoringEnabled: false,
        rolloutPercentage: 0,
      });

      const decision = {
        id: "decision-1",
        deliveryId,
        cohort: DispatchCohort.CONTROL,
        dispatchMethod: DispatchMethod.LEGACY,
        dispatchStatus: DispatchStatus.PENDING,
      };
      mockRepository.create.mockReturnValue(decision);
      mockRepository.save.mockResolvedValue({
        id: "decision-1",
      });

      // Mock: findOne for updateDispatchDecision
      mockRepository.findOne.mockResolvedValue({
        ...decision,
        updatedAt: new Date(),
      });

      const fallbackCallback = jest.fn().mockResolvedValue({
        driverId: "driver-1",
        method: "LEGACY",
      });

      await service.executeSafeDispatch(
        deliveryId,
        eligibleDrivers,
        fallbackCallback,
      );

      // Should execute fallback callback
      expect(fallbackCallback).toHaveBeenCalled();
    });
  });
});
