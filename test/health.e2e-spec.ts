import { api } from './helpers/api';

describe('Health E2E', () => {
  it('GET /health should return ok', async () => {
    const res = await api.get('/health');

    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
    expect(res.data.info.database.status).toBe('up');
    expect(res.data.info.redis.status).toBe('up');
  });
});