import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:   Create full driver microservice schema from zero
 * TYPE:     BASELINE
 * RISK:     LOW
 * ROLLBACK: SAFE
 *
 * Generated automatically by ensureBaselineExists().
 * This migration creates all tables, enums, indexes, and foreign keys.
 * Do NOT edit after first deployment — add incremental migrations on top.
 */

// @allow-mixed-ops: baseline
// MIGRATION_GUARD:ALLOW_DESTRUCTIVE

export class BASELINE_Initial1000000000000 implements MigrationInterface {
  name = "BASELINE_Initial1000000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Enums ──────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE driver_status_enum AS ENUM ('AVAILABLE','BUSY','OFFLINE')
    `);

    await queryRunner.query(`
      CREATE TYPE admin_role_enum AS ENUM (
        'DRIVER','ADMIN','DISPATCHER','OPS_ADMIN','CITY_ADMIN','SUPER_ADMIN','SYSTEM'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE outbox_status_enum AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED')
    `);

    await queryRunner.query(`
      CREATE TYPE delivery_status_enum AS ENUM (
        'PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED','CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE delivery_event_type_enum AS ENUM (
        'ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','FAILED','CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE driver_offer_status_enum AS ENUM ('PENDING','ACCEPTED','REJECTED','EXPIRED')
    `);

    await queryRunner.query(`
      CREATE TYPE notification_method_enum AS ENUM ('push','websocket','both')
    `);

    await queryRunner.query(`
      CREATE TYPE auth_provider_enum AS ENUM ('legacy','google','email')
    `);

    // ── 2. cities ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id         UUID      NOT NULL DEFAULT gen_random_uuid(),
        name       VARCHAR   NOT NULL,
        code       VARCHAR   NOT NULL,
        center     POINT,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT pk_cities  PRIMARY KEY (id),
        CONSTRAINT uq_cities_code UNIQUE (code)
      )
    `);

    // ── 3. zones ──────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS zones (
        id         UUID      NOT NULL DEFAULT gen_random_uuid(),
        name       VARCHAR   NOT NULL,
        code       VARCHAR   NOT NULL,
        city_id    UUID      NOT NULL,
        boundary   POLYGON,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT pk_zones      PRIMARY KEY (id),
        CONSTRAINT uq_zones_code UNIQUE (code),
        CONSTRAINT fk_zones_city FOREIGN KEY (city_id)
          REFERENCES cities (id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_zones_city_id ON zones (city_id)`,
    );

    // ── 4. admin_users ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id             UUID            NOT NULL DEFAULT gen_random_uuid(),
        email          VARCHAR         NOT NULL,
        password_hash  VARCHAR         NOT NULL,
        role           admin_role_enum NOT NULL DEFAULT 'ADMIN',
        is_active      BOOLEAN         NOT NULL DEFAULT true,
        city_id        UUID,
        created_by_id  UUID,
        last_login_at  TIMESTAMP,
        created_at     TIMESTAMP       NOT NULL DEFAULT now(),
        updated_at     TIMESTAMP       NOT NULL DEFAULT now(),
        CONSTRAINT pk_admin_users        PRIMARY KEY (id),
        CONSTRAINT uq_admin_users_email  UNIQUE (email),
        CONSTRAINT fk_admin_users_city   FOREIGN KEY (city_id)
          REFERENCES cities (id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users (is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_users_city_id   ON admin_users (city_id)`,
    );

    // ── 5. drivers ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id              UUID                 NOT NULL DEFAULT gen_random_uuid(),
        name            VARCHAR              NOT NULL,
        phone           VARCHAR              NOT NULL,
        is_active       BOOLEAN              NOT NULL DEFAULT true,
        status          driver_status_enum   NOT NULL DEFAULT 'AVAILABLE',
        current_lat     NUMERIC,
        current_lon     NUMERIC,
        city_id         VARCHAR              NOT NULL,
        zone_id         VARCHAR,
        vehicle_type    VARCHAR,
        vehicle_number  VARCHAR,
        email           VARCHAR,
        google_sub      VARCHAR,
        auth_provider   auth_provider_enum   NOT NULL DEFAULT 'legacy',
        created_at      TIMESTAMP            NOT NULL DEFAULT now(),
        updated_at      TIMESTAMP            NOT NULL DEFAULT now(),
        last_active_at  TIMESTAMP,
        CONSTRAINT pk_drivers       PRIMARY KEY (id),
        CONSTRAINT uq_drivers_phone UNIQUE (phone)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_drivers_is_active ON drivers (is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_drivers_status    ON drivers (status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_drivers_city_id   ON drivers (city_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_drivers_zone_id   ON drivers (zone_id)`,
    );

    // ── 6. deliveries ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id                   UUID                   NOT NULL DEFAULT gen_random_uuid(),
        seller_order_id      VARCHAR                NOT NULL,
        channel_id           VARCHAR                NOT NULL,
        driver_id            UUID,
        status               delivery_status_enum   NOT NULL DEFAULT 'PENDING',
        pickup_lat           DECIMAL(10,8)          NOT NULL,
        pickup_lon           DECIMAL(11,8)          NOT NULL,
        drop_lat             DECIMAL(10,8)          NOT NULL,
        drop_lon             DECIMAL(11,8)          NOT NULL,
        pickup_proof_url     VARCHAR,
        delivery_proof_url   VARCHAR,
        failure_code         VARCHAR,
        failure_reason       VARCHAR,
        assigned_at          TIMESTAMP,
        picked_up_at         TIMESTAMP,
        delivered_at         TIMESTAMP,
        failed_at            TIMESTAMP,
        expected_pickup_at   TIMESTAMP,
        expected_delivery_at TIMESTAMP,
        sla_breach_at        TIMESTAMP,
        delivery_otp         VARCHAR(6),
        otp_attempts         INTEGER                NOT NULL DEFAULT 0,
        otp_locked_until     TIMESTAMP,
        created_at           TIMESTAMP              NOT NULL DEFAULT now(),
        updated_at           TIMESTAMP              NOT NULL DEFAULT now(),
        CONSTRAINT pk_deliveries                 PRIMARY KEY (id),
        CONSTRAINT uq_deliveries_seller_order_id UNIQUE (seller_order_id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_deliveries_status               ON deliveries (status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id            ON deliveries (driver_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_deliveries_expected_pickup_at   ON deliveries (expected_pickup_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_deliveries_expected_delivery_at ON deliveries (expected_delivery_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_deliveries_sla_breach_at        ON deliveries (sla_breach_at)`,
    );
    // Required by db-verify.ts
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_delivery_active_driver          ON deliveries (driver_id, status)`,
    );

    // ── 7. delivery_events ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_events (
        id              UUID                       NOT NULL DEFAULT gen_random_uuid(),
        delivery_id     UUID                       NOT NULL,
        seller_order_id VARCHAR                    NOT NULL,
        event_type      delivery_event_type_enum   NOT NULL,
        metadata        JSONB,
        proof_url       VARCHAR,
        failure_code    VARCHAR,
        failure_reason  VARCHAR,
        created_at      TIMESTAMP                  NOT NULL DEFAULT now(),
        CONSTRAINT pk_delivery_events PRIMARY KEY (id),
        CONSTRAINT fk_delivery_events_delivery
          FOREIGN KEY (delivery_id) REFERENCES deliveries (id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery_event
        ON delivery_events (delivery_id, event_type)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_events_seller_order_id
        ON delivery_events (seller_order_id)
    `);
    // Required by db-verify.ts (idx_delivery_pending maps to delivery_id)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_pending ON delivery_events (delivery_id)
    `);

    // ── 8. assignments ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id              UUID      NOT NULL DEFAULT gen_random_uuid(),
        seller_order_id VARCHAR   NOT NULL,
        driver_id       VARCHAR   NOT NULL,
        created_at      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT pk_assignments PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_assignments_seller_driver
        ON assignments (seller_order_id, driver_id)
    `);

    // ── 9. driver_offers ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS driver_offers (
        id                     UUID                      NOT NULL DEFAULT gen_random_uuid(),
        delivery_id            UUID                      NOT NULL,
        driver_id              UUID                      NOT NULL,
        status                 driver_offer_status_enum  NOT NULL DEFAULT 'PENDING',
        offer_payload          JSONB                     NOT NULL,
        created_at             TIMESTAMP                 NOT NULL DEFAULT now(),
        expires_at             TIMESTAMP                 NOT NULL,
        accepted_at            TIMESTAMP,
        rejected_at            TIMESTAMP,
        rejection_reason       TEXT,
        notification_sent_at   TIMESTAMP,
        notification_method    notification_method_enum  NOT NULL DEFAULT 'push',
        driver_response_time_ms INTEGER,
        CONSTRAINT pk_driver_offers PRIMARY KEY (id)
      )
    `);

    // Required by db-verify.ts
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_delivery_pending ON driver_offers (delivery_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_driver_pending   ON driver_offers (driver_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_expires_at       ON driver_offers (expires_at)`,
    );

    // ── 10. outbox ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        id              SERIAL             NOT NULL,
        event_type      VARCHAR            NOT NULL,
        payload         JSONB              NOT NULL,
        status          outbox_status_enum NOT NULL,
        retry_count     INTEGER            NOT NULL DEFAULT 0,
        last_error      VARCHAR,
        next_retry_at   TIMESTAMP,
        created_at      TIMESTAMP          NOT NULL DEFAULT now(),
        updated_at      TIMESTAMP,
        processed_at    TIMESTAMP,
        locked_at       TIMESTAMP,
        locked_by       VARCHAR,
        idempotency_key VARCHAR            NOT NULL,
        version         SMALLINT           NOT NULL DEFAULT 1,
        CONSTRAINT pk_outbox                 PRIMARY KEY (id),
        CONSTRAINT uq_outbox_idempotency_key UNIQUE (idempotency_key)
      )
    `);

    // Required by db-verify.ts (idx_outbox_worker)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_worker
        ON outbox (status, next_retry_at)
        WHERE status = 'PENDING'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_locked
        ON outbox (locked_at)
        WHERE status = 'PROCESSING'
    `);

    // ── 11. outbox_archive ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbox_archive (
        id              SERIAL             NOT NULL,
        event_type      VARCHAR            NOT NULL,
        payload         JSONB              NOT NULL,
        status          outbox_status_enum NOT NULL,
        retry_count     INTEGER            NOT NULL DEFAULT 0,
        last_error      VARCHAR,
        next_retry_at   TIMESTAMP,
        created_at      TIMESTAMP          NOT NULL DEFAULT now(),
        processed_at    TIMESTAMP,
        locked_at       TIMESTAMP,
        locked_by       VARCHAR,
        idempotency_key VARCHAR            NOT NULL,
        archived_at     TIMESTAMP          NOT NULL DEFAULT now(),
        CONSTRAINT pk_outbox_archive                 PRIMARY KEY (id),
        CONSTRAINT uq_outbox_archive_idempotency_key UNIQUE (idempotency_key)
      )
    `);

    // ── 12. audit_logs ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            UUID      NOT NULL DEFAULT gen_random_uuid(),
        user_id       VARCHAR   NOT NULL,
        user_email    VARCHAR,
        user_role     VARCHAR,
        action        VARCHAR   NOT NULL,
        resource_type VARCHAR   NOT NULL,
        resource_id   VARCHAR   NOT NULL,
        changes       JSONB,
        ip_address    VARCHAR,
        user_agent    VARCHAR,
        request_id    VARCHAR,
        created_at    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT pk_audit_logs PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs (action)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_resource   ON audit_logs (resource_type, resource_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs     CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox_archive CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox         CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS driver_offers  CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS assignments    CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_events CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS deliveries     CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin_users    CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS zones          CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS cities         CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS drivers        CASCADE`);

    await queryRunner.query(`DROP TYPE IF EXISTS auth_provider_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS notification_method_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS driver_offer_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS delivery_event_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS delivery_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS outbox_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS admin_role_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS driver_status_enum`);
  }
}
