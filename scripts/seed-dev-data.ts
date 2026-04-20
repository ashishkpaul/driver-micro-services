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
      { name: "Mumbai",      code: "MUM", lat: 19.0760, lon: 72.8777 },
      { name: "Delhi",       code: "DEL", lat: 28.6139, lon: 77.2090 },
      { name: "Bangalore",   code: "BLR", lat: 12.9716, lon: 77.5946 },
      { name: "Hyderabad",   code: "HYD", lat: 17.3850, lon: 78.4867 },
      { name: "Chennai",     code: "CHE", lat: 13.0827, lon: 80.2707 },
      { name: "Kolkata",     code: "KOL", lat: 22.5726, lon: 88.3639 },
      { name: "Pune",        code: "PUN", lat: 18.5204, lon: 73.8567 },
      { name: "Ahmedabad",   code: "AMD", lat: 23.0225, lon: 72.5714 },
      { name: "Jaipur",      code: "JAI", lat: 26.9124, lon: 75.7873 },
      { name: "Surat",       code: "SUR", lat: 21.1702, lon: 72.8311 },
      { name: "Lucknow",     code: "LKO", lat: 26.8467, lon: 80.9462 },
      { name: "Kanpur",      code: "KNP", lat: 26.4499, lon: 80.3319 },
      { name: "Nagpur",      code: "NAG", lat: 21.1458, lon: 79.0882 },
      { name: "Indore",      code: "IDR", lat: 22.7196, lon: 75.8577 },
      { name: "Bhopal",      code: "BHO", lat: 23.2599, lon: 77.4126 },
      { name: "Visakhapatnam", code: "VIZ", lat: 17.6868, lon: 83.2185 },
      { name: "Patna",       code: "PAT", lat: 25.5941, lon: 85.1376 },
      { name: "Vadodara",    code: "VAD", lat: 22.3072, lon: 73.1812 },
      { name: "Ghaziabad",   code: "GZB", lat: 28.6692, lon: 77.4538 },
      { name: "Ludhiana",    code: "LDH", lat: 30.9010, lon: 75.8573 },
      { name: "Agra",        code: "AGR", lat: 27.1767, lon: 78.0081 },
      { name: "Nashik",      code: "NSK", lat: 19.9975, lon: 73.7898 },
      { name: "Faridabad",   code: "FBD", lat: 28.4089, lon: 77.3178 },
      { name: "Meerut",      code: "MRT", lat: 28.9845, lon: 77.7064 },
      { name: "Rajkot",      code: "RJT", lat: 22.3039, lon: 70.8022 },
      { name: "Varanasi",    code: "VNS", lat: 25.3176, lon: 82.9739 },
      { name: "Amritsar",    code: "ATQ", lat: 31.6340, lon: 74.8723 },
      { name: "Chandigarh",  code: "IXC", lat: 30.7333, lon: 76.7794 },
      { name: "Coimbatore",  code: "CBE", lat: 11.0168, lon: 76.9558 },
      { name: "Kochi",       code: "COK", lat: 9.9312,  lon: 76.2673 },
      { name: "Guwahati",    code: "GAU", lat: 26.1445, lon: 91.7362 },
      { name: "Dehradun",    code: "DED", lat: 30.3165, lon: 78.0322 },
      { name: "Kurukshetra", code: "KUK", lat: 29.9695, lon: 76.8783 },
      { name: "Ambala",      code: "UMB", lat: 30.3782, lon: 76.7767 },
      { name: "Panipat",     code: "PNP", lat: 29.3909, lon: 76.9635 },
      { name: "Karnal",      code: "KNL", lat: 29.6857, lon: 76.9905 },
      { name: "Rohtak",      code: "ROH", lat: 28.8955, lon: 76.6066 },
      { name: "Hisar",       code: "HSR", lat: 29.1492, lon: 75.7217 },
    ];

    const savedCities: City[] = [];
    for (const cityData of cities) {
      let city = await cityRepository.findOne({
        where: { name: cityData.name },
      });

      if (!city) {
        city = cityRepository.create({
          name: cityData.name,
          code: cityData.code,
          center: { type: "Point", coordinates: [cityData.lon, cityData.lat] },
        });
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
