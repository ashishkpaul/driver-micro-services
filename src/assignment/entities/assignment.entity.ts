import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("assignments")
@Index(["sellerOrderId", "driverId"])
export class Assignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  sellerOrderId!: string;

  @Column()
  driverId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  // ⚠️ V1 RULE: No status, no acceptance workflow
  // Status is derived from Delivery.status
  // Assignment is immediate and final in v1
}
