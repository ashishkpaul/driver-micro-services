import { api } from './helpers/api';

describe('Auth E2E', () => {
  it('POST /auth/login issues JWT for active driver', async () => {
    const driverId = '00000000-0000-0000-0000-000000000001';

    const res = await api.post('/auth/login', { driverId });

    expect(res.status).toBe(201);
    expect(res.data.accessToken).toBeDefined();
    expect(res.data.driver.id).toBe(driverId);
  });

  it('rejects login for non-existing driver', async () => {
    const res = await api.post('/auth/login', {
      driverId: 'non-existent-id',
    });

    expect(res.status).toBe(401);
  });
});