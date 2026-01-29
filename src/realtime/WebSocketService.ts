import { io, Socket } from 'socket.io-client';
import { TokenManager } from '../auth/TokenManager';

// WebSocket configuration - adjust based on environment
// For development: http://localhost:3002/driver
// For production: your-production-url/driver
const WS_BASE_URL = 'http://localhost:3002';

class WebSocketService {
  private socket: Socket | null = null;
  private connecting = false;

  connect(): void {
    if (this.socket?.connected || this.connecting) return;

    const token = TokenManager.getSync();
    if (!token) return;

    this.connecting = true;

    this.socket = io(`${WS_BASE_URL}/driver`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.info('✅ WS connected', this.socket?.id);
      this.connecting = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('⚠️ WS disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ WS error:', err.message);
      this.connecting = false;
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  emit(event: string, payload?: any): void {
    if (!this.socket?.connected) return;
    this.socket.emit(event, payload);
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.socket?.on(event, handler);
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }
}

export const socketService = new WebSocketService();
