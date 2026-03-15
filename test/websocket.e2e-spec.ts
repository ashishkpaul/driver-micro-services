import { io } from 'socket.io-client';
import { loginDriver } from './helpers/auth';

describe('WebSocket E2E', () => {
  it('authenticates driver and responds to PING_V1', async () => {
    const driverId = '46894ed3-4de6-4a4e-8c15-008698df5d1a';
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