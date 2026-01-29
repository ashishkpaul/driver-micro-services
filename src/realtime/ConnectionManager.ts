import { socketService } from './WebSocketService';
import { TokenManager } from '../auth/TokenManager';

class ConnectionManager {
  start() {
    const token = TokenManager.getSync();
    if (!token) return;

    socketService.connect();
  }

  stop() {
    socketService.disconnect();
  }

  onAuthLogin(token: string) {
    TokenManager.set(token);
    this.start();
  }

  onAuthLogout() {
    this.stop();
    TokenManager.clear();
  }
}

export const connectionManager = new ConnectionManager();
