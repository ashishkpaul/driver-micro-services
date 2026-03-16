import { api } from "./helpers/api";

describe("Admin Drivers E2E", () => {
  const defaultCityId = "11111111-1111-4111-8111-111111111111";
  const adminEmail = process.env.SUPERADMIN_EMAIL || "admin@company.com";
  const adminPassword = process.env.SUPERADMIN_PASSWORD || "password";
  let adminToken: string;
  let seededDriverPhone: string;

  beforeAll(async () => {
    let loginRes;
    try {
      loginRes = await api.post("/auth/admin/login", {
        email: adminEmail,
        password: adminPassword,
      });
    } catch (error: any) {
      throw new Error(`Admin login request failed: ${error.message}`);
    }

    if (loginRes.status !== 201) {
      throw new Error(
        `Admin login failed: ${loginRes.status} ${JSON.stringify(loginRes.data)}`,
      );
    }
    expect(loginRes.data.accessToken).toBeDefined();

    adminToken = loginRes.data.accessToken;

    const uniqueSuffix = Date.now().toString().slice(-9);
    seededDriverPhone = `+919${uniqueSuffix}`;

    const createRes = await api.post(
      "/drivers",
      {
        name: "E2E Admin Driver",
        phone: seededDriverPhone,
        cityId: defaultCityId,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );

    if (![200, 201].includes(createRes.status)) {
      throw new Error(
        `Driver create failed: ${createRes.status} ${JSON.stringify(createRes.data)}`,
      );
    }
  });

  it("GET /admin/drivers returns filtered driver list", async () => {
    const res = await api.get("/admin/drivers", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      params: {
        cityId: defaultCityId,
        status: "AVAILABLE",
        isActive: true,
        authProvider: "legacy",
        search: seededDriverPhone,
        skip: 0,
        take: 10,
      },
    });

    if (res.status !== 200) {
      throw new Error(
        `GET /admin/drivers failed: ${res.status} ${JSON.stringify(res.data)}`,
      );
    }
    expect(Array.isArray(res.data.drivers)).toBe(true);
    expect(res.data.total).toBeGreaterThanOrEqual(1);
    expect(res.data.skip).toBe(0);
    expect(res.data.take).toBe(10);

    const matched = res.data.drivers.find(
      (driver: any) => driver.phone === seededDriverPhone,
    );
    expect(matched).toBeDefined();
  });
});
