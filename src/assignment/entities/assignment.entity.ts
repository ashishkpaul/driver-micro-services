import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("assignments")
@Index("idx_assignments_seller_driver", ["sellerOrderId", "driverId"])
export class Assignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  sellerOrderId!: string;

  @Column({ type: "varchar" })
  driverId!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  // ⚠️ V1 RULE: No status, no acceptance workflow
  // Status is derived from Delivery.status
  // Assignment is immediate and final in v1
}
