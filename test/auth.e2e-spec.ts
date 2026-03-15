import { api } from './helpers/api';

describe('Auth E2E', () => {
  it('POST /auth/login issues JWT for active driver', async () => {
    const driverId = '46894ed3-4de6-4a4e-8c15-008698df5d1a';

    const res = await api.post('/auth/login', { driverId });

    expect(res.status).toBe(201);
    expect(res.data.accessToken).toBeDefined();
    expect(res.data.driver.id).toBe(driverId);
  });

  it('rejects login for non-existing driver', async () => {
    const res = await api.post('/auth/login', {
      driverId: '00000000-0000-0000-0000-000000000000',
    });

    expect(res.status).toBe(401);
  });
});