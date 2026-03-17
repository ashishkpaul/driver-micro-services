#!/usr/bin/env ts-node

import "dotenv/config";
import dataSource from "../src/config/data-source";

type OutboxRow = {
  id: number;
  event_type: string | null;
  status: string;
  retry_count: number;
  locked_by: string | null;
  locked_at: string | null;
  last_error: string | null;
};

async function checkOutboxHealth() {
  console.log("🔍 Outbox Health Check\n");
  
  await dataSource.initialize();
  
  try {
    // 1. Check for corrupted rows
    console.log("1. Checking for corrupted rows (NULL/empty event_type)...");
    const corrupted = await dataSource.query<OutboxRow[]>(`
      SELECT id, event_type, status, retry_count, last_error 
      FROM outbox 
      WHERE event_type IS NULL OR event_type = ''
    `);
    
    if (corrupted.length > 0) {
      console.error(`❌ Found ${corrupted.length} corrupted rows:\n`);
      console.table(corrupted);
    } else {
      console.log("✅ No corrupted rows found\n");
    }

    // 2. Check for stuck rows
    console.log("2. Checking for stuck rows (PROCESSING > 5 min)...");
    const stuck = await dataSource.query<OutboxRow[]>(`
      SELECT id, event_type, locked_at, locked_by, retry_count
      FROM outbox 
      WHERE status = 'PROCESSING' 
        AND locked_at < now() - interval '5 minutes'
    `);
    
    if (stuck.length > 0) {
      console.warn(`⚠️ Found ${stuck.length} stuck rows:\n`);
      console.table(stuck);
    } else {
      console.log("✅ No stuck rows found\n");
    }

    // 3. Status distribution
    console.log("3. Status distribution:");
    const stats = await dataSource.query(`
      SELECT status, COUNT(*) as count 
      FROM outbox 
      GROUP BY status
      ORDER BY count DESC
    `);
    console.table(stats);

    // 4. Recent errors
    console.log("4. Recent failures (last 10):");
    const recentFails = await dataSource.query(`
      SELECT id, event_type, retry_count, last_error, created_at
      FROM outbox 
      WHERE status = 'FAILED'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    if (recentFails.length > 0) {
      console.table(recentFails);
    } else {
      console.log("   No recent failures\n");
    }

    // 5. Worker lock status
    console.log("5. Current worker locks:");
    const locks = await dataSource.query(`
      SELECT locked_by, COUNT(*) as count, MAX(locked_at) as latest_lock
      FROM outbox 
      WHERE status = 'PROCESSING'
      GROUP BY locked_by
    `);
    
    if (locks.length > 0) {
      console.table(locks);
    } else {
      console.log("   No active locks\n");
    }

    // Summary
    const total = await dataSource.query(`SELECT COUNT(*) as count FROM outbox`);
    console.log(`\n📊 Total outbox rows: ${total[0].count}`);
    
    if (corrupted.length === 0 && stuck.length === 0) {
      console.log("\n✅ Outbox health check PASSED");
      process.exit(0);
    } else {
      console.log("\n❌ Outbox health check FAILED");
      process.exit(1);
    }
    
  } finally {
    await dataSource.destroy();
  }
}

checkOutboxHealth().catch((error) => {
  console.error("Health check failed:", error);
  process.exit(1);
});
