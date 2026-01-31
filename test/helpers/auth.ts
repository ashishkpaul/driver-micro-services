import { api } from './api';

export async function loginDriver(driverId: string) {
  const res = await api.post('/auth/login', { driverId });
  expect(res.status).toBe(201);
  return res.data.accessToken as string;
}