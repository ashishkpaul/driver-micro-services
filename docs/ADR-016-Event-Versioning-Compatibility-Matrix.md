# ADR 016: Event Versioning Compatibility Matrix

**Status**: Proposed
**Date**: 2024-03-17
**Deciders**: Driver Backend Team

## Context

As the Driver Backend system evolves, we need to support schema evolution for outbox events without breaking existing consumers. Different versions of event handlers may need to process the same logical event type with different payload structures or processing logic.

## Decision

Implement a comprehensive event versioning system with the following components:

### 1. Versioned Event Types

Event types follow the pattern: `{EVENT_NAME}_V{VERSION}`

**Current Supported Versions:**

- `DELIVERY_ASSIGNED_V1` - Original delivery assignment event
- `DELIVERY_ASSIGNED_V2` - Enhanced with additional metadata
- `DELIVERY_ASSIGNED_V3` - Future version with optimized payload

### 2. Version Compatibility Matrix

| Event Type | Handler Version | Supported Event Versions | Notes |
|------------|----------------|-------------------------|-------|
| `DELIVERY_ASSIGNED` | V1 | `DELIVERY_ASSIGNED_V1` | Original implementation |
| `DELIVERY_ASSIGNED` | V2 | `DELIVERY_ASSIGNED_V1`, `DELIVERY_ASSIGNED_V2` | Backward compatible |
| `DELIVERY_ASSIGNED` | V3 | `DELIVERY_ASSIGNED_V1`, `DELIVERY_ASSIGNED_V2`, `DELIVERY_ASSIGNED_V3` | Full compatibility |

### 3. Version Support Policy

- **Current Version**: Always support at least 3 versions back
- **Deprecation**: Mark versions as deprecated before removal
- **Migration**: Provide migration paths for deprecated versions
- **Validation**: Reject unknown versions with clear error messages

### 4. Implementation Details

#### Event Publishing

```typescript
// Publish with explicit version
await outboxService.publish(
  manager,
  "DELIVERY_ASSIGNED_V2",
  payload,
  2 // EventVersion
);
```

#### Handler Version Awareness

```typescript
// Handler supports multiple versions
const validEventTypes = [
  "DELIVERY_ASSIGNED_V1",
  "DELIVERY_ASSIGNED_V2", 
  "DELIVERY_ASSIGNED_V3"
];

if (!validEventTypes.includes(event.eventType)) {
  throw new Error(`Unknown version: ${event.eventType}`);
}
```

#### Version Validation

- Event types must match pattern: `/^[A-Z_]+_V[1-3]$/`
- Unknown versions are rejected immediately
- Version field is validated as `EventVersion` type (1 \| 2 \| 3)

### 5. Migration Strategy

#### Adding New Version

1. Create new handler supporting both old and new versions
2. Update publisher to use new version
3. Deploy new handler first (backward compatibility)
4. Deploy new publisher
5. Monitor for any issues

#### Deprecating Old Version

1. Mark version as deprecated in documentation
2. Add deprecation warnings in handlers
3. Monitor usage metrics
4. Remove support after 3-version grace period
5. Update compatibility matrix

### 6. Error Handling

#### Unknown Version

```typescript
throw new Error(`Unknown versioned event type: ${eventType}`);
```

#### Unsupported Version

```typescript
throw new Error(
  `Invalid event type for Handler: ${eventType}. ` +
  `Supported versions: ${validEventTypes.join(", ")}`
);
```

### 7. Monitoring and Observability

#### Metrics to Track

- Event version distribution
- Handler processing success rates by version
- Unknown version error rates
- Deprecation warning frequency

#### Logging

- Version information in debug logs
- Unknown version errors in error logs
- Deprecation warnings in warn logs

### 8. Future Considerations

#### Version 4+ Planning

- Consider automatic version migration
- Schema evolution tooling
- Event transformation pipelines

#### Breaking Changes

- Major version bumps for breaking changes
- Separate handler implementations for major versions
- Clear migration documentation

## Alternatives Considered

### Alternative 1: Single Event Type with Version Field

- **Pros**: Simpler event type names
- **Cons**: Harder to route to specific handlers, less explicit

### Alternative 2: Schema Evolution with Backward Compatibility

- **Pros**: No version management needed
- **Cons**: Accumulates technical debt, harder to optimize

### Alternative 3: Event Transformation Layer

- **Pros**: Clean separation of concerns
- **Cons**: Additional complexity, performance overhead

## Consequences

### Positive

- **Schema Evolution**: Can evolve event schemas without breaking consumers
- **Rolling Deployments**: Support gradual migration between versions
- **Performance Optimization**: Can optimize newer versions independently
- **Clear Contracts**: Explicit version contracts between producers and consumers

### Negative

- **Complexity**: Additional complexity in version management
- **Storage**: Multiple versions of similar events in outbox
- **Monitoring**: Need to track multiple versions

### Mitigations

- **Automation**: Automated version validation and compatibility checking
- **Documentation**: Clear version compatibility matrix
- **Monitoring**: Comprehensive metrics and alerting for version usage
- **Deprecation Process**: Clear deprecation and removal process

## Implementation Timeline

### Phase 1: Foundation (Current)

- [x] Add version column to outbox entity
- [x] Update outbox service with version support
- [x] Create versioned event types
- [x] Update handlers to be version-aware

### Phase 2: V2 Implementation

- [ ] Create DELIVERY_ASSIGNED_V2 with enhanced payload
- [ ] Update handler to support both V1 and V2
- [ ] Update publisher to use V2
- [ ] Add comprehensive tests

### Phase 3: Monitoring

- [ ] Add version-specific metrics
- [ ] Create dashboards for version usage
- [ ] Set up alerts for unknown versions

### Phase 4: Future Versions

- [ ] Establish version governance process
- [ ] Create automated migration tooling
- [ ] Document version evolution patterns
