// src/entities/audit-log.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("audit_logs")
// @Index("idx_audit_logs_user_id", ["userId"])
// @Index("idx_audit_logs_action", ["action"])
// @Index("idx_audit_logs_resource", ["resourceType", "resourceId"])
// @Index("idx_audit_logs_created_at", ["createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /* ------------------------------------------------------------------ */
  /* User Information                                                   */
  /* ------------------------------------------------------------------ */

  @Index('idx_audit_logs_user_id')
  @Column({ 
    name: 'user_id', 
    type: 'varchar' // If DB is VARCHAR, change this to 'varchar'.
  })
  userId!: string;

  @Column({
    name: "user_email",
    type: "varchar",
    nullable: true,
  })
  userEmail?: string;

  @Column({
    name: "user_role",
    type: "varchar",
    nullable: true,
  })
  userRole?: string;

  /* ------------------------------------------------------------------ */
  /* Action Information                                                 */
  /* ------------------------------------------------------------------ */

  @Column({
    name: "action",
    type: "varchar",
  })
  action!: string; // e.g., "DRIVER_DISABLED", "ADMIN_CREATED", "DELIVERY_REASSIGNED"

  @Column({
    name: "resource_type",
    type: "varchar",
  })
  resourceType!: string; // e.g., "DRIVER", "ADMIN", "DELIVERY"

  @Index('idx_audit_logs_resource')
  @Column({ name: 'resource_id', type: 'varchar' })
  resourceId!: string; // ID of the resource being acted upon

  /* ------------------------------------------------------------------ */
  /* Change Information                                                 */
  /* ------------------------------------------------------------------ */

  @Column({
    type: "jsonb",
    nullable: true,
  })
  changes?: {
    before?: any;
    after?: any;
    fields?: string[]; // List of changed field names
  };

  /* ------------------------------------------------------------------ */
  /* Request Information                                                */
  /* ------------------------------------------------------------------ */

  @Column({
    name: "ip_address",
    type: "varchar",
    nullable: true,
  })
  ipAddress?: string;

  @Column({
    name: "user_agent",
    type: "varchar",
    nullable: true,
  })
  userAgent?: string;

  @Column({
    name: "request_id",
    type: "varchar",
    nullable: true,
  })
  requestId?: string;

  /* ------------------------------------------------------------------ */
  /* Metadata                                                           */
  /* ------------------------------------------------------------------ */

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  /* ------------------------------------------------------------------ */
  /* Indexes                                                            */
  /* ------------------------------------------------------------------ */

  // Indexes for common queries
  // @Index('idx_audit_logs_user_id', ['userId'])
  // @Index('idx_audit_logs_action', ['action'])
  // @Index('idx_audit_logs_resource', ['resourceType', 'resourceId'])
  // @Index('idx_audit_logs_created_at', ['createdAt'])
}