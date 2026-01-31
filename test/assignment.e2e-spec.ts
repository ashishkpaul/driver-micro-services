import { api } from './helpers/api';

describe('Assignment E2E', () => {
  it('assigns a driver when seller order is ready', async () => {
    const sellerOrderId = crypto.randomUUID();
    const channelId = crypto.randomUUID();

    const res = await api.post(
      '/events/seller-order-ready',
      {
        sellerOrderId,
        channelId,
        pickup: { lat: 12.9716, lon: 77.5946 },
        drop: { lat: 12.9352, lon: 77.6245 },
      },
      {
        headers: {
          'X-Webhook-Secret': process.env.VENDURE_WEBHOOK_SECRET,
        },
      },
    );

    expect(res.status).toBe(201);
    expect(res.data.status).toBe('success');
    expect(res.data.deliveryId).toBeDefined();

    // Assert the side effect: delivery was created and assigned
    const history = await api.get(
      `/deliveries/seller-order/${sellerOrderId}/history`,
    );

    expect(history.data.length).toBeGreaterThan(0);
    expect(history.data[0].driverId).toBeDefined();
    expect(history.data[0].status).toBe('PENDING');
  });
});
