import { api } from './helpers/api';

beforeAll(async () => {
  // Seed a test driver for E2E tests to be self-contained
  try {
    await api.post('/drivers', {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Driver',
      phone: '+10000000001',
      cityId: 'blr',
      zoneId: 'zone-1',
    });
  } catch (error) {
    // Driver might already exist, which is fine
    console.log('Test driver seeding completed (may already exist)');
  }
});
