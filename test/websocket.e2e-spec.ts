import { io } from 'socket.io-client';
import { loginDriver } from './helpers/auth';

describe('WebSocket E2E', () => {
  it('authenticates driver and responds to PING_V1', async () => {
    const driverId = '00000000-0000-0000-0000-000000000001';
    const token = await loginDriver(driverId);

    const socket = io('http://localhost:3002/driver', {
      transports: ['websocket'],
      auth: { token },
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        socket.emit('PING_V1', null, (pong: any) => {
          expect(pong).toBeDefined();
          socket.disconnect();
          resolve();
        });
      });

      socket.on('connect_error', reject);
    });
  });
});