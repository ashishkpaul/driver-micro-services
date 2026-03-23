// COMPATIBILITY SHIM — do not add @Entity() here.
// The canonical outbox entity lives in src/domain-events/outbox.entity.ts.
// This file exists only to prevent import errors from any legacy reference.
export { OutboxEvent } from "../domain-events/outbox.entity";
