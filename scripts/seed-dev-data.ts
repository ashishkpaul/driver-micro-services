#!/usr/bin/env ts-node
/**
 * Dev Seed Data Script
 *
 * Seeds the database with:
 * - Major cities
 * - Default zones
 * - Keeps SUPER_ADMIN global
 * - Creates one test ADMIN per city
 *
 * Usage: npm run db:seed:dev
 */

import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "dotenv";
import * as bcrypt from "bcrypt";

// Load environment variables
config();

// Import entities
import { City } from "../src/entities/city.entity";
import { Zone } from "../src/entities/zone.entity";
import { AdminUser, AdminRole } from "../src/entities/admin-user.entity";
import { Driver } from "../src/drivers/entities/driver.entity";
import { DriverStatus } from "../src/drivers/enums/driver-status.enum";
import { DriverRegistrationStatus } from "../src/drivers/enums/driver-registration-status.enum";

// Database connection
const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "driver_user",
  password: process.env.DB_PASSWORD || "driver_password",
  database: process.env.DB_NAME || "driver_service",
  entities: [City, Zone, AdminUser, Driver],
  synchronize: false,
  logging: true,
});

async function seed() {
  try {
    await dataSource.initialize();
    console.log("✅ Database connected");

    // Clear existing data (optional - comment out for production)
    // await dataSource.getRepository(Driver).delete({});
    // await dataSource.getRepository(Zone).delete({});
    // await dataSource.getRepository(City).delete({});
    // await dataSource.getRepository(AdminUser).delete({});

    // 1. Seed Cities
    console.log("🏙️  Seeding cities...");
    const cityRepository = dataSource.getRepository(City);

    const cities = [
      {
        name: "Mumbai",
        state: "Maharashtra",
        country: "India",
        lat: 19.076,
        lon: 72.8777,
        isActive: true,
      },
      {
        name: "Delhi",
        state: "Delhi",
        country: "India",
        lat: 28.6139,
        lon: 77.209,
        isActive: true,
      },
      {
        name: "Bangalore",
        state: "Karnataka",
        country: "India",
        lat: 12.9716,
        lon: 77.5946,
        isActive: true,
      },
      {
        name: "Hyderabad",
        state: "Telangana",
        country: "India",
        lat: 17.385,
        lon: 78.4867,
        isActive: true,
      },
      {
        name: "Chennai",
        state: "Tamil Nadu",
        country: "India",
        lat: 13.0827,
        lon: 80.2707,
        isActive: true,
      },
      {
        name: "Kolkata",
        state: "West Bengal",
        country: "India",
        lat: 22.5726,
        lon: 88.3639,
        isActive: true,
      },
      {
        name: "Pune",
        state: "Maharashtra",
        country: "India",
        lat: 18.5204,
        lon: 73.8567,
        isActive: true,
      },
      {
        name: "Ahmedabad",
        state: "Gujarat",
        country: "India",
        lat: 23.0225,
        lon: 72.5714,
        isActive: true,
      },
    ];

    const savedCities: City[] = [];
    for (const cityData of cities) {
      let city = await cityRepository.findOne({
        where: { name: cityData.name },
      });

      if (!city) {
        city = cityRepository.create(cityData);
        city = await cityRepository.save(city);
        console.log(`  ✅ Created city: ${city.name}`);
      } else {
        console.log(`  ⏭️  City already exists: ${city.name}`);
      }

      savedCities.push(city);
    }

    // 2. Seed Zones (2-3 zones per city)
    console.log("\n📍 Seeding zones...");
    const zoneRepository = dataSource.getRepository(Zone);

    const zoneNames = ["North", "South", "Central", "East", "West"];

    for (const city of savedCities) {
      const numZones = 2 + Math.floor(Math.random() * 2); // 2-3 zones per city

      for (let i = 0; i < numZones; i++) {
        const zoneName = zoneNames[i % zoneNames.length];
        const zoneCode = `${city.name.substring(0, 3).toUpperCase()}-${zoneName.substring(0, 3).toUpperCase()}`;

        let zone = await zoneRepository.findOne({
          where: { code: zoneCode, cityId: city.id },
        });

        if (!zone) {
          zone = new Zone();
          zone.name = `${city.name} ${zoneName} Zone`;
          zone.code = zoneCode;
          zone.cityId = city.id;
          zone = await zoneRepository.save(zone);
          console.log(`  ✅ Created zone: ${zone.name} (${zone.code})`);
        } else {
          console.log(`  ⏭️  Zone already exists: ${zone.name}`);
        }
      }
    }

    // 3. Seed SUPER_ADMIN (if not exists)
    console.log("\n👤 Seeding SUPER_ADMIN...");
    const adminRepository = dataSource.getRepository(AdminUser);

    let superAdmin = await adminRepository.findOne({
      where: { email: "admin@company.com" },
    });

    if (!superAdmin) {
      const passwordHash = await bcrypt.hash("SuperAdmin123!", 10);
      superAdmin = new AdminUser();
      superAdmin.email = "admin@company.com";
      superAdmin.passwordHash = passwordHash;
      superAdmin.role = AdminRole.SUPER_ADMIN;
      superAdmin.isActive = true;
      superAdmin = await adminRepository.save(superAdmin);
      console.log(`  ✅ Created SUPER_ADMIN: ${superAdmin.email}`);
    } else {
      console.log(`  ⏭️  SUPER_ADMIN already exists: ${superAdmin.email}`);
    }

    // 4. Seed one test ADMIN per city
    console.log("\n👨‍💼 Seeding test admins per city...");
    for (const city of savedCities) {
      const adminEmail = `admin.${city.name.toLowerCase()}@company.com`;

      let admin = await adminRepository.findOne({
        where: { email: adminEmail },
      });

      if (!admin) {
        const passwordHash = await bcrypt.hash("Admin123!", 10);
        admin = new AdminUser();
        admin.email = adminEmail;
        admin.passwordHash = passwordHash;
        admin.role = AdminRole.ADMIN;
        admin.isActive = true;
        admin.cityId = city.id;
        admin = await adminRepository.save(admin);
        console.log(`  ✅ Created admin for ${city.name}: ${admin.email}`);
      } else {
        console.log(
          `  ⏭️  Admin already exists for ${city.name}: ${admin.email}`,
        );
      }
    }

    // 5. Seed test drivers (optional - can be enabled for testing)
    console.log("\n🚗 Seeding test drivers...");
    const driverRepository = dataSource.getRepository(Driver);

    const testDrivers = [
      {
        name: "Test Driver 1",
        email: "driver1@test.com",
        phone: "+919876543210",
        cityId: savedCities[0].id, // Mumbai
        zoneId: null,
        status: DriverStatus.AVAILABLE,
        isActive: true,
        registrationStatus: DriverRegistrationStatus.APPROVED,
        vehicleType: "BIKE",
        vehicleNumber: "MH01AB1234",
        authProvider: "email" as const,
        currentLat: 19.076,
        currentLon: 72.8777,
      },
      {
        name: "Test Driver 2",
        email: "driver2@test.com",
        phone: "+919876543211",
        cityId: savedCities[1].id, // Delhi
        zoneId: null,
        status: DriverStatus.AVAILABLE,
        isActive: true,
        registrationStatus: DriverRegistrationStatus.APPROVED,
        vehicleType: "CAR",
        vehicleNumber: "DL01CD5678",
        authProvider: "email" as const,
        currentLat: 28.6139,
        currentLon: 77.209,
      },
      {
        name: "Test Driver 3",
        email: "driver3@test.com",
        phone: "+919876543212",
        cityId: savedCities[2].id, // Bangalore
        zoneId: null,
        status: DriverStatus.AVAILABLE,
        isActive: true,
        registrationStatus: DriverRegistrationStatus.APPROVED,
        vehicleType: "BIKE",
        vehicleNumber: "KA01EF9012",
        authProvider: "email" as const,
        currentLat: 12.9716,
        currentLon: 77.5946,
      },
    ];

    for (const driverData of testDrivers) {
      let driver = await driverRepository.findOne({
        where: { email: driverData.email },
      });

      if (!driver) {
        driver = new Driver();
        Object.assign(driver, driverData);
        driver = await driverRepository.save(driver);
        console.log(
          `  ✅ Created test driver: ${driver.name} (${driver.email})`,
        );
      } else {
        console.log(`  ⏭️  Test driver already exists: ${driver.name}`);
      }
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("✅ SEED DATA COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(50));
    console.log("\n📊 Summary:");
    console.log(`  - Cities: ${savedCities.length}`);
    console.log(
      `  - Zones: ${savedCities.length * 2}-${savedCities.length * 3}`,
    );
    console.log(`  - SUPER_ADMIN: 1`);
    console.log(`  - City Admins: ${savedCities.length}`);
    console.log(`  - Test Drivers: ${testDrivers.length}`);
    console.log("\n🔑 Login Credentials:");
    console.log("  SUPER_ADMIN: admin@company.com / SuperAdmin123!");
    console.log("  City Admins: admin.<city>@company.com / Admin123!");
    console.log(
      "  Test Drivers: driver<1-3>@test.com / (password set by auth flow)",
    );
    console.log("\n🚀 You can now start the server with: npm run start:dev");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
    console.log("\n👋 Database connection closed");
  }
}

// Run the seed function
seed();
