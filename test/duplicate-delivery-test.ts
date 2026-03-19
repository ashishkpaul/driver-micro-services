import { Test, TestingModule } from "@nestjs/testing";
import { EventsController } from "../src/events/events.controller";
import { AssignmentService } from "../src/assignment/assignment.service";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../src/redis/redis.service";

// Define the DTO inline since it's not exported from the controller
class PickupLocationDto {
  lat!: number;
  lon!: number;
}

class DropLocationDto {
  lat!: number;
  lon!: number;
}

class SellerOrderReadyPayloadDto {
  eventId!: string;
  sellerOrderId!: string;
  channelId!: string;
  pickup!: PickupLocationDto;
  drop!: DropLocationDto;
}

describe("Duplicate Delivery Handling", () => {
  let eventsController: EventsController;
  let assignmentService: AssignmentService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [AssignmentService, ConfigService, RedisService],
    }).compile();

    eventsController = module.get<EventsController>(EventsController);
    assignmentService = module.get<AssignmentService>(AssignmentService);
    redisService = module.get<RedisService>(RedisService);
  });

  it("should handle duplicate delivery creation gracefully", async () => {
    const payload: SellerOrderReadyPayloadDto = {
      eventId: "test-event-123",
      sellerOrderId: "test-order-456",
      channelId: "test-channel",
      pickup: {
        lat: 12.9716,
        lon: 77.5946,
      },
      drop: {
        lat: 12.9717,
        lon: 77.5947,
      },
    };

    // Mock Redis to return false for first call (not processed)
    jest.spyOn(redisService.getClient(), "exists").mockResolvedValue(0);

    // Mock Redis set to succeed
    jest.spyOn(redisService.getClient(), "set").mockResolvedValue("OK");

    // Mock assignment service to throw unique constraint error on second call
    let callCount = 0;
    jest
      .spyOn(assignmentService, "createAndAssignDelivery")
      .mockImplementation(async () => {
        callCount++;
        if (callCount > 1) {
          // Simulate PostgreSQL unique constraint violation
          const error = new Error(
            "duplicate key value violates unique constraint",
          );
          (error as any).code = "23505";
          throw error;
        }
        return "delivery-id-123";
      });

    // First call should succeed
    const result1 = await eventsController.onSellerOrderReady(
      payload,
      "valid-secret",
      "1234567890",
      "valid-signature",
    );

    expect(result1.status).toBe("success");
    expect(result1.deliveryId).toBe("delivery-id-123");

    // Second call should handle duplicate gracefully
    const result2 = await eventsController.onSellerOrderReady(
      payload,
      "valid-secret",
      "1234567890",
      "valid-signature",
    );

    expect(result2.status).toBe("ignored");
    expect(result2.message).toBe(
      "Duplicate delivery suppressed by DB constraint",
    );
  });
});
