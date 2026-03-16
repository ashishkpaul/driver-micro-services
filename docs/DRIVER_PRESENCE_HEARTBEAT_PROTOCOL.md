# Driver Presence Heartbeat Protocol Implementation

## Overview

This document describes the implementation of the Driver Presence Heartbeat Protocol, a critical system for maintaining accurate driver availability and location tracking in real-time.

## Architecture

### Backend Implementation

#### 1. Heartbeat Handler (`src/websocket/events/presence.handler.ts`)

- **Purpose**: Processes incoming heartbeat messages from driver clients
- **Security**: Validates driver ID matches authenticated socket connection
- **Redis Integration**: Updates driver location and status with 45-second TTL
- **Database Sync**: Updates driver status in PostgreSQL when changed
- **Acknowledgment**: Sends `HEARTBEAT_ACK_V1` response with server timestamp

#### 2. WebSocket Gateway Integration (`src/websocket/websocket.gateway.ts`)

- **Event Handler**: `DRIVER_HEARTBEAT_V1` message handler
- **Metrics**: Fire-and-forget metrics collection for monitoring
- **Dependencies**: Injects RedisService and DriversService

### Frontend Implementation

#### 1. Presence Store (`src/domains/presence/presence.store.js`)

- **State Management**: Zustand store for heartbeat state
- **Heartbeat Logic**: 20-second interval with 30-second timeout grace period
- **Connection Handling**: Graceful handling of WebSocket disconnections
- **Offline Detection**: Tracks missed heartbeats and presence confirmation

#### 2. Presence Manager Hook (`src/hooks/usePresenceManager.js`)

- **Lifecycle Management**: Automatically starts/stops heartbeat based on auth status
- **Visibility Handling**: Immediate heartbeat on tab focus
- **Graceful Shutdown**: Sends offline heartbeat on page unload
- **Connection Retry**: Automatic retry when WebSocket reconnects

#### 3. Socket API Extension (`src/api/socket.js`)

- **Heartbeat Emitter**: `emitDriverHeartbeat()` function
- **Type Safety**: Proper TypeScript interfaces for heartbeat data

## Protocol Specification

### Heartbeat Message Format

```typescript
interface HeartbeatPayload {
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  lat?: number;
  lon?: number;
  timestamp: string;
  clientVersion?: string;
  tabActive?: boolean;
  reason?: string;
}
```

**Security Note**: Driver ID is automatically injected from socket authentication and should NOT be included in client payload.

### Message Flow

1. **Client → Server**: `DRIVER_HEARTBEAT_V1` with heartbeat data
2. **Server Processing**:
   - Validate driver ID
   - Update Redis with location/status
   - Update database if status changed
   - Send acknowledgment
3. **Server → Client**: `HEARTBEAT_ACK_V1` with server timestamp

### Configuration

- **Heartbeat Interval**: 20 seconds
- **Timeout Grace Period**: 30 seconds
- **Redis TTL**: 45 seconds
- **Status Update**: Only when status actually changes

## Key Features

### 1. Security & Validation

- Driver ID verification against authenticated socket
- Rejection of mismatched heartbeat messages
- Error handling with appropriate client notifications

### 2. Reliability

- Graceful handling of WebSocket disconnections
- Automatic retry logic for connection issues
- Missed heartbeat tracking and timeout detection
- Tab visibility awareness for battery optimization

### 3. Performance

- Fire-and-forget metrics to prevent blocking
- Efficient Redis pipeline operations
- Conditional database updates (only on status change)
- Minimal network overhead

### 4. Observability

- Comprehensive logging for debugging
- Metrics collection for monitoring
- Test coverage with Jest
- TypeScript interfaces for type safety

## Integration Points

### With Existing Systems

1. **Redis Service**: Extends existing location/status tracking
2. **WebSocket Gateway**: Integrates with existing message handlers
3. **Driver Service**: Updates driver status in database
4. **State Management**: Integrates with existing Zustand stores

### With Frontend Architecture

1. **Authentication**: Tied to login/logout lifecycle
2. **Location Tracking**: Complements existing location updates
3. **UI State**: Provides presence confirmation for UI feedback
4. **Error Handling**: Integrates with existing toast/notification system

## Testing

### Backend Tests (`src/websocket/events/presence.handler.spec.ts`)

- Driver ID validation
- Offline status handling
- Location updates
- Error scenarios
- Client unload handling

### Test Coverage

- ✅ Security validation
- ✅ Redis integration
- ✅ Database updates
- ✅ Error handling
- ✅ Edge cases

## Deployment Considerations

### Environment Variables

- Uses existing Redis configuration
- No new environment variables required
- Compatible with existing deployment pipeline

### Monitoring

- Existing WebSocket metrics capture heartbeat messages
- Redis health checks cover heartbeat functionality
- Error logs provide debugging information

### Rollback Plan

- Feature can be disabled by removing heartbeat handler
- Existing location/status tracking remains functional
- No breaking changes to existing APIs

## Future Enhancements

### Potential Improvements

1. **Adaptive Intervals**: Dynamic heartbeat intervals based on activity
2. **Battery Optimization**: Reduced frequency when app is backgrounded
3. **Network Awareness**: Adjust intervals based on connection quality
4. **Analytics**: Detailed metrics on driver availability patterns

### Monitoring Enhancements

1. **Alerting**: Alerts for high missed heartbeat rates
2. **Dashboards**: Real-time driver presence visualization
3. **SLA Tracking**: Uptime and availability metrics
4. **Performance Metrics**: Heartbeat processing latency

## Conclusion

The Driver Presence Heartbeat Protocol provides a robust, secure, and efficient solution for maintaining accurate driver presence information. The implementation follows best practices for real-time systems and integrates seamlessly with the existing architecture.

The protocol ensures:

- **Accuracy**: Real-time driver availability tracking
- **Reliability**: Graceful handling of network and client issues
- **Security**: Proper authentication and validation
- **Performance**: Minimal resource usage and network overhead
- **Observability**: Comprehensive logging and metrics
