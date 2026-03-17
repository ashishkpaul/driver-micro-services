export const MIGRATION_ALIASES: Record<string, string[]> = {
  SAFECreateOutbox1773729157505: ["SAFEAddOutboxTable1773729157505"],
  SAFEAddOutboxTable1773729157505: ["SAFECreateOutbox1773729157505"],
  SAFEAddOutboxIdempotencyKey1773735000002: [
    "SAFE_AddOutboxIdempotencyKey_Expand1773735000002",
  ],
  SAFEAddEventVersion1773735000003: ["SAFE_AddEventVersion1773735000003"],
  DATA_BackfillOutboxIdempotencyKey1773735000003: [
    "DATA_BackfillOutboxIdempotencyKey1773735000003",
  ],
  BREAKING_EnforceOutboxIdempotencyKey1773735000004: [
    "BREAKING_EnforceOutboxIdempotencyKey1773735000004",
  ],
  SAFEAddWorkerLockingColumns1773735000005: [
    "SAFE_AddWorkerLockingColumns1773735000005",
  ],
  DATA_BackfillEventVersion1773735000006: [
    "DATA_BackfillEventVersion1773735000006",
  ],
  BREAKING_EnforceEventVersion1773735000007: [
    "BREAKING_EnforceEventVersion1773735000007",
  ],
  SAFE_AddEventTypeConstraint1773735000008: [
    "SAFE_AddEventTypeConstraint1773735000008",
  ],
  BREAKING_ValidateEventTypeConstraint1773735000009: [
    "BREAKING_ValidateEventTypeConstraint1773735000009",
  ],
};
