# ADR-021: Vendure Plugin Architecture & Design Patterns

**Status:** Accepted  
**Date:** 2026-01-28  
**Scope:** Vendure Server-Side Plugins (seller-store-info, driver-integration, webhook, elasticsearch)  
**Alignment:** Vendure 3.5.x Core Patterns & Best Practices

---

## Context

The marketplace platform uses multiple Vendure plugins to handle cross-cutting concerns:

1. **seller-store-info** — Geographic & inventory metadata
2. **driver-integration** — Order → Delivery orchestration
3. **vendure-plugin-webhook** — Generic webhook dispatch
4. **es9** (Elasticsearch 9) — Search indexing with geospatial features
5. **multivendor** — Multi-seller order segregation

Each plugin follows Vendure's plugin architecture but with specific patterns for:
- Service layer (business logic isolation)
- Event bus integration (decoupled communication)
- GraphQL extensions (API exposure)
- Custom database entities & fields
- Request transformers (webhook serialization)
- Dependency injection with service accessors

---

## Design Principles (Vendure-Aligned)

### 1. Thin Plugins, Smart Services

**Principle:**
- Plugins define structure (modules, resolvers, events)
- Services contain business logic
- Controllers are minimal (request → service → response)

**Implementation:**
```typescript
// Plugin level: wiring only
@VendurePlugin({
  providers: [ProductStockLocationService, DriverIntegrationService],
  imports: [PluginCommonModule],
  // ...
})
export class DriverIntegrationPlugin { }

// Service level: business logic
@Injectable()
export class ProductStockLocationService {
  async getNearestStockLocationForVariant(variantId, coordinates) {
    // Core business logic here
  }
}
```

### 2. Event Bus for Decoupling

**Principle:**
- Plugins publish custom events (not direct calls)
- Other plugins subscribe asynchronously
- No direct inter-plugin dependencies

**Implementation:**
```typescript
// DriverIntegrationService publishes
this.eventBus.publish(
  new SellerOrderReadyForDispatchEvent(ctx, order, pickup, drop)
);

// WebhookPlugin subscribes
eventBus.ofType(SellerOrderReadyForDispatchEvent)
  .subscribe(async (event) => {
    // Transform and dispatch webhook
  });
```

### 3. Service Layer Isolation

**Pattern:**
- No direct database access in resolvers
- All business logic in services
- Services are injectable and testable

**Example:**
```typescript
// Resolver: thin
@Query()
@Allow(Permission.ReadCatalog)
async nearestStockLocation(
  @Args() args,
  @Ctx() ctx
) {
  return this.productStockLocationService
    .getNearestStockLocationForVariant(
      args.variantId,
      args.coordinates
    );
}

// Service: thick
@Injectable()
class ProductStockLocationService {
  async getNearestStockLocationForVariant(variantId, coords) {
    // Query DB, apply business rules, cache results
  }
}
```

### 4. Custom Fields over Custom Entities (When Possible)

**Principle:**
- Use custom fields for simple extensions
- Create custom entities only for complex data with relationships

**In This Project:**
```typescript
// ✅ Custom fields (driver-integration)
config.customFields.Order = [
  { name: 'lastDeliveryEvent', type: 'string' },
  { name: 'lastDeliveryEventAt', type: 'datetime' },
  { name: 'deliveryProofUrl', type: 'string' },
];

// ✅ Custom entity (seller-store-info)
// StockLocationGeoCacheEntity has relationships and indexing
```

### 5. RequestTransformer Pattern for Webhooks

**Principle:**
- Decouple event schema from webhook payload
- Allow multiple transformations per event
- Support event versioning

**Implementation:**
```typescript
export const sellerOrderReadyDispatchTransformer 
  = new RequestTransformer({
    name: 'Seller Order Ready for Dispatch V1',
    supportedEvents: [SellerOrderReadyForDispatchEvent],
    transform: (event) => ({
      body: JSON.stringify({
        version: 'v1',
        event: 'SELLER_ORDER_READY_FOR_DISPATCH_V1',
        sellerOrderId: event.sellerOrder.id,
        pickup: { ... },
        drop: { ... },
      }),
      headers: { 'X-Event-Version': 'V1' },
    }),
  });
```

---

## Plugin Responsibilities & Boundaries

### seller-store-info Plugin

**Purpose:**
Provide real-time geographic and inventory metadata for products.

**Responsibilities:**
✅ Cache stock location coordinates (lazy-loaded)  
✅ Cache customer geocoding results  
✅ Compute distance from customer to stock locations  
✅ Apply business rules (5km visibility in v1)  
✅ Expose GraphQL resolvers for distance queries  
✅ Provide service accessor for non-DI contexts (Elasticsearch)

**Does NOT:**
❌ Assign drivers (driver service does)  
❌ Manage orders (Vendure core does)  
❌ Handle webhooks (driver-integration + webhook plugin do)  
❌ Index search (Elasticsearch plugin does)

**Key Services:**
```
ProductStockLocationService
├── getNearestStockLocationForVariant()
├── getStockLocationsWithinRadius()
└── validateFastDeliveryEligibility()

StockLocationGeoCacheService
├── getCoordinates()
└── warmCache()

LocationIntegrationService
├── integrateWithElasticsearch()
└── getServiceAccessor()
```

### driver-integration Plugin

**Purpose:**
Bridge Vendure orders to the Driver Service.

**Responsibilities:**
✅ Listen for order events (PaymentSettled)  
✅ Enrich order with pickup/drop coordinates  
✅ Publish SellerOrderReadyForDispatchEvent  
✅ Receive delivery status webhooks from driver service  
✅ Record delivery events as custom fields on Order  
✅ Expose delivery status queries

**Does NOT:**
❌ Query driver availability (driver service does)  
❌ Make assignment decisions (driver service does)  
❌ Manage inventory (Vendure core does)

**Key Components:**
```
DriverIntegrationService
├── handleSellerOrderPaymentSettled()
├── getFulfillingStockLocation()
├── getCustomerDropCoordinates()
├── recordDeliveryEvent()
└── handleDeliveryWebhook()

SellerOrderReadyForDispatchEvent (custom)
├── sellerOrder
├── pickupLocation
└── dropCoordinates

DeliveryStatusResolver (GraphQL)
├── lastDeliveryEvent(sellerOrderId)
```

### WebhookPlugin (vendure-plugin-webhook)

**Purpose:**
Generic webhook dispatch infrastructure for all events.

**Responsibilities:**
✅ Define Webhook entity (URL, events, transformers)  
✅ Listen for all events (EventBus.ofAnyEvent)  
✅ Apply RequestTransformers to events  
✅ HTTP POST to registered webhook URLs  
✅ Manage webhook retries & state  
✅ Expose GraphQL API for webhook CRUD

**Does NOT:**
❌ Define event schemas (plugins do)  
❌ Transform payloads (RequestTransformers do)  
❌ Handle event business logic (plugin services do)

**Key Components:**
```
WebhookPlugin
├── WebhookEntity
├── WebhookService
├── WebhookController
├── RequestTransformer (interface)
└── WebhookResolver (GraphQL)
```

### Elasticsearch9Plugin (es9)

**Purpose:**
Full-text search + geospatial indexing for products.

**Responsibilities:**
✅ Index product variants with stock location GEO
✅ Apply geo_distance filters (5km v1 rule)  
✅ Expose sorted-by-distance search results  
✅ Cache coordinate lookups via SellerStoreInfoServiceAccessor  
✅ Support faceted search on derived fields

**Does NOT:**
❌ Compute distances (seller-store-info does)  
❌ Manage stock levels (Vendure core does)

**Key Features:**
```
customProductVariantMappings
├── stockLocationGeo (geo_point field)
├── stockLocationId (keyword)
├── isFastPossible (boolean)
└── deliveryThreshold (keyword)

mapQuery()
└── Inject geo_distance filter at search time

mapSort()
└── Sort by _geo_distance
```

### multivendor Plugin

**Purpose:**
Segregate orders by seller for multi-vendor marketplace.

**Responsibilities:**
✅ Define SellerOrder entity type  
✅ Tag orders with seller identity  
✅ Enable seller-specific workflows  
✅ Expose seller management GraphQL  

**Integration Points:**
- driver-integration subscribes to SellerOrder states
- seller-store-info uses seller context for stock visibility

---

## Cross-Plugin Integration Patterns

### 1. Event-Based Coupling

```
Vendure Core
  ↓ OrderStateTransitionEvent (PaymentSettled)
DriverIntegrationService
  ↓ publishes
SellerOrderReadyForDispatchEvent
  ↓ subscribed by
WebhookPlugin (via RequestTransformer)
  ↓ transforms & dispatches
Driver Service (HTTP POST)
```

**Benefit:** No direct dependency between driver-integration and webhook plugin.

### 2. Service Accessor Pattern

**Problem:** Elasticsearch indexing happens outside NestJS DI (during variant hydration).

**Solution:**
```typescript
// seller-store-info plugin provides accessor
export class SellerStoreInfoServiceAccessor {
  static getInstance(): SellerStoreInfoServiceAccessor
  getCoordinatesSync(postalCode): GeoCoordinates
}

// es9 plugin uses accessor
valueFn: (variant) => {
  const accessor = SellerStoreInfoServiceAccessor.getInstance();
  const coords = accessor.getCoordinatesSync(postalCode);
}
```

### 3. Custom Fields for Cross-Plugin Data

**In driver-integration:**
```typescript
// Extend Order with delivery metadata
config.customFields.Order = [
  { name: 'lastDeliveryEvent', type: 'string', public: true },
  { name: 'lastDeliveryEventAt', type: 'datetime', public: true },
  { name: 'deliveryProofUrl', type: 'string', public: true },
];
```

**Accessed by:**
- driver-integration (records delivery events)
- GraphQL API (lastDeliveryEvent query)
- Admin UI (displays delivery status)

### 4. Shared Constants

**In seller-store-info/shared:**
```typescript
export const DELIVERY_THRESHOLDS = {
  FAST_DELIVERY_KM: 5,
  MAX_DISTANCE_KM: 5,
} as const;

// Used by:
// - seller-store-info (eligibility checks)
// - es9 (geo_distance filter)
// - driver service (backup validation)
```

---

## Implementation Patterns

### Pattern 1: Service Initialization

**OnApplicationBootstrap:**
```typescript
@Injectable()
class ProductStockLocationService implements OnApplicationBootstrap {
  async onApplicationBootstrap() {
    // Warm caches on startup
    await this.warmCache();
  }
}
```

**When to use:** Cache initialization, health checks.

### Pattern 2: Event Subscription

**OnModuleInit:**
```typescript
@Injectable()
class DriverIntegrationService implements OnModuleInit {
  onModuleInit() {
    this.eventBus
      .ofType(OrderStateTransitionEvent)
      .subscribe(async (event) => {
        if (event.toState === 'PaymentSettled') {
          await this.handleSellerOrderPaymentSettled(...);
        }
      });
  }
}
```

**When to use:** React to Vendure lifecycle events.

### Pattern 3: GraphQL Resolver with Permission Guards

```typescript
@Resolver()
class StockLocationDistanceResolver {
  @Query()
  @Allow(Permission.ReadCatalog)
  async nearestStockLocation(
    @Args() args,
    @Ctx() ctx: RequestContext
  ) {
    return this.service.getNearestStockLocationForVariant(
      args.variantId,
      args.coordinates
    );
  }
}
```

**When to use:** Expose plugin services via GraphQL.

### Pattern 4: Request Transformer

```typescript
export const myEventTransformer = new RequestTransformer({
  name: 'Transform MyEvent to webhook payload V1',
  supportedEvents: [MyCustomEvent],
  transform: (event, injector, webhook) => {
    return {
      body: JSON.stringify({
        version: 'v1',
        event: 'MY_EVENT_V1',
        data: { ... },
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Event-Version': 'V1',
      },
    };
  },
});
```

**When to use:** Serialize events for webhook dispatch.

---

## Database Layer Patterns

### Custom Fields (seller-store-info example)

```typescript
// StockLocation.customFields
{
  latitude: number,
  longitude: number,
  city: string,
  postalCode: string,
}

// Used by:
// - ProductStockLocationService (distance calculation)
// - Elasticsearch mapping (geo_point indexing)
// - driver-integration (pickup coordinates)
```

### Custom Entity (seller-store-info example)

```typescript
@Entity()
class StockLocationGeoCacheEntity {
  @Column() postalCode: string;
  @Column() latitude: number;
  @Column() longitude: number;
  @UpdateDateColumn() updatedAt: Date;
}

// Why custom entity?
// - Index on postalCode for fast lookups
// - Deduplication (cache layer)
// - Versioning history (optional)
```

### Custom Fields on Built-in Entities

```typescript
// Order (driver-integration)
config.customFields.Order = [
  { name: 'lastDeliveryEvent', type: 'string' },
  { name: 'deliveryProofUrl', type: 'string' },
];

// Accessed via:
// order.customFields.lastDeliveryEvent
```

---

## Testing Patterns

### 1. Service Unit Tests

```typescript
describe('ProductStockLocationService', () => {
  let service: ProductStockLocationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProductStockLocationService,
        {
          provide: StockLocationGeoCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get(ProductStockLocationService);
  });

  it('should return nearest stock location', async () => {
    const result = await service.getNearestStockLocationForVariant(
      variantId,
      { lat, lon }
    );
    expect(result).toBeDefined();
  });
});
```

### 2. Plugin Integration Tests

```typescript
describe('DriverIntegrationPlugin', () => {
  let server: TestServer;
  let eventBus: EventBus;

  beforeAll(async () => {
    // Set up test Vendure server with plugin
    server = await createTestEnvironment({
      plugins: [DriverIntegrationPlugin.init()],
    }).then(env => env.server);
  });

  it('should emit SellerOrderReadyForDispatchEvent on PaymentSettled', async () => {
    const publishSpy = jest.spyOn(eventBus, 'publish');

    // Trigger order state transition
    await orderService.transitionToState(order, 'PaymentSettled');

    expect(publishSpy).toHaveBeenCalledWith(
      expect.any(SellerOrderReadyForDispatchEvent)
    );
  });
});
```

### 3. Webhook RequestTransformer Tests

```typescript
describe('sellerOrderReadyDispatchTransformer', () => {
  it('should transform event to webhook payload', () => {
    const event = new SellerOrderReadyForDispatchEvent(
      ctx,
      mockOrder,
      mockPickup,
      mockDrop
    );

    const result = sellerOrderReadyDispatchTransformer.transform(event);

    expect(JSON.parse(result.body)).toEqual({
      version: 'v1',
      event: 'SELLER_ORDER_READY_FOR_DISPATCH_V1',
      sellerOrderId: mockOrder.id,
      // ...
    });
  });
});
```

---

## Performance Considerations

### 1. Caching Strategy

**seller-store-info:**
```typescript
// StockLocationGeoCacheService
class StockLocationGeoCacheService {
  private cache = new Map<string, GeoCoordinates>(); // In-memory

  // Indexed lookups
  async getCoordinates(postalCode): Promise<GeoCoordinates> {
    if (this.cache.has(postalCode)) return this.cache.get(postalCode);
    const coords = await this.db.query(...); // DB fallback
    this.cache.set(postalCode, coords); // Cache hit
    return coords;
  }
}
```

**When Elasticsearch asks for coordinates:**
- Warm cache on application bootstrap
- Use getCoordinatesSync for zero-latency indexing

### 2. N+1 Query Prevention

**seller-store-info (GraphQL resolver):**
```typescript
// Query stockLocation.customFields once per variant
// Then use in-memory calculation for distances

// Not:
for (const variant of variants) {
  const location = await stockLocationService.get(variant.stockLocationId);
}
```

### 3. Webhook Retry Strategy

**WebhookPlugin:**
- Exponential backoff (configurable)
- Max retries (configurable)
- Failed webhooks logged for manual retry

---

## Error Handling

### Service Layer

```typescript
@Injectable()
class ProductStockLocationService {
  async getNearestStockLocationForVariant(variantId, coords) {
    try {
      const locations = await this.fetchStockLocations(variantId);
      if (!locations.length) {
        throw new UserInputError('No stock locations found');
      }
      return this.computeNearest(locations, coords);
    } catch (error) {
      this.logger.error('Stock location query failed', error);
      throw new InternalServerError('Unable to find stock location');
    }
  }
}
```

### Event Handlers

```typescript
onModuleInit() {
  this.eventBus.ofType(OrderStateTransitionEvent).subscribe(
    async (event) => {
      try {
        await this.handleSellerOrderPaymentSettled(event.ctx, event.order);
      } catch (error) {
        this.logger.error(
          `Failed to process order ${event.order.id}`,
          error
        );
        // Do NOT throw - allow order placement to succeed
        // Delivery can be manually assigned later
      }
    }
  );
}
```

**Key Principle:** Delivery failures should NOT block order placement.

---

## Security Considerations

### 1. Webhook Secret Validation

```typescript
// driver-integration webhook controller
@Post()
async handleDriverWebhook(
  @Body() payload: any,
  @Headers('x-webhook-secret') secret: string
) {
  const expectedSecret = process.env.DRIVER_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  }
  // ...
}
```

### 2. Custom Field Visibility

```typescript
config.customFields.Order = [
  {
    name: 'lastDeliveryEvent',
    type: 'string',
    public: true, // ✅ Expose to shop API
  },
  {
    name: 'deliveryProofUrl',
    type: 'string',
    public: true, // ✅ Customer can see proof
  },
];
```

### 3. GraphQL Permission Guards

```typescript
@Query()
@Allow(Permission.ReadCatalog) // Only logged-in customers
async nearestStockLocation(...) { }

@Query()
@Allow(Permission.ReadOrder) // Only order owner or admin
async lastDeliveryEvent(...) { }
```

---

## Observability

### Logging

```typescript
private readonly logger = new Logger(ClassName.name);

// In services
this.logger.log('Cache warmed', { count: locations.length });
this.logger.warn('Stock location not found', { variantId });
this.logger.error('Database query failed', error);
```

### Metrics (Optional)

Consider adding for production:
- Cache hit/miss ratio
- Distance calculation latency
- Webhook delivery success rate
- Order to delivery event latency

---

## Future Extensions (v2+)

### Driver Acceptance Workflow
- Add `DriverAcceptanceEvent` after `SellerOrderReadyForDispatchEvent`
- Insert acceptance step in driver service

### Load-Based Driver Scoring
- Modify assignment algorithm based on driver load
- No plugin changes needed (driver service internal)

### Delivery Zones
- Partition drivers by geofence
- Validate assignment against zone constraints

### Dynamic Pricing
- Calculate delivery fees based on distance + demand
- Expose via driver-integration plugin webhook response

---

## Summary

Vendure plugins in this project follow these patterns:

1. **Thin plugins** with thick services
2. **Event-based** inter-plugin communication
3. **Service layer** isolation of business logic
4. **RequestTransformer** for webhook serialization
5. **Custom fields** for simple extensions
6. **Custom entities** only for complex data
7. **GraphQL resolvers** as API layer
8. **Permission guards** for security
9. **Service accessors** for non-DI contexts (Elasticsearch)
10. **Error handling** that preserves system resilience

This enables:
- ✅ Independent plugin evolution
- ✅ Easy testing and mocking
- ✅ Clear responsibility boundaries
- ✅ Extensibility without breaking changes

---

## References

- Vendure Plugin Documentation: https://docs.vendure.io/guides/developer-guide/plugins
- Event Bus: https://docs.vendure.io/guides/developer-guide/events
- Custom Fields: https://docs.vendure.io/guides/developer-guide/custom-fields
- GraphQL Extensions: https://docs.vendure.io/guides/developer-guide/extend-graphql-api
