import { api } from './helpers/api';

describe('Drivers E2E', () => {
  let driverId: string;

  it('GET /drivers/available returns array', async () => {
    const res = await api.get('/drivers/available', {
      params: { lat: 12.9, lon: 77.6 },
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('GET /drivers/:id returns driver', async () => {
    driverId = '00000000-0000-0000-0000-000000000001';

    const res = await api.get(`/drivers/${driverId}`);

    expect(res.status).toBe(200);
    expect(res.data.id).toBe(driverId);
  });
});