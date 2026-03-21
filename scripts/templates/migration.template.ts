/**
 * INTENT:
 * Normalize identifier columns from VARCHAR to UUID to align with
 * entity typing and improve referential consistency.
 *
 * TYPE: SAFE
 * RISK: LOW
 * ROLLBACK: SAFE
 *
 * DESCRIPTION:
 * The baseline schema defined several identifier fields
 * (seller_order_id, driver_id, resource_id) as VARCHAR.
 * Current entity definitions expect UUID semantics for these fields.
 *
 * This migration begins the expand phase by adding UUID columns
 * alongside existing VARCHAR columns to allow safe data migration
 * without downtime.
 *
 * This reflects schema alignment between the original baseline
 * contract and the current entity model.
 *
 * EXPAND → MIGRATE → CONTRACT:
 * Phase 1 of 3 — schema expansion prior to backfill.
 *
 * DEPLOY NOTES:
 * - Can run online: YES (only ADD COLUMN operations)
 * - Lock duration: metadata only
 * - Dependent services: none
 * - Dependent migrations: BASELINE_Initial
 *
 * ROLLBACK PLAN:
 * Down migration removes added UUID columns.
 * No existing data modified.
 *
 * CHECKLIST:
 * [x] Reviewed SQL manually
 * [x] No destructive operations
 * [x] Lifecycle compliant
 * [x] No schema + data mixing
 */