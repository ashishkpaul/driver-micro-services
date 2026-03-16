import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminUsersCitiesZones1700000000000 implements MigrationInterface {
  name = "AdminUsersCitiesZones1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create admin_users table (idempotent bootstrap safety)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
        is_active BOOLEAN DEFAULT true,
        city_id UUID NULL,
        created_by_id UUID NULL,
        last_login_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create cities table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL,
        center POINT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create zones table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL,
        city_id UUID NOT NULL,
        boundary POLYGON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (email)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users (role)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_users_city_id ON admin_users (city_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_cities_code ON cities (code)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_zones_city_id ON zones (city_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_zones_code ON zones (code)`,
    );

    // Add foreign key constraints if absent
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_admin_users_city'
        ) THEN
          ALTER TABLE admin_users
          ADD CONSTRAINT fk_admin_users_city
          FOREIGN KEY (city_id) REFERENCES cities(id);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_zones_city'
        ) THEN
          ALTER TABLE zones
          ADD CONSTRAINT fk_zones_city
          FOREIGN KEY (city_id) REFERENCES cities(id);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE zones DROP CONSTRAINT IF EXISTS fk_zones_city`,
    );
    await queryRunner.query(
      `ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS fk_admin_users_city`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS zones`);
    await queryRunner.query(`DROP TABLE IF EXISTS cities`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin_users`);
  }
}
