import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { SchemaDiff } from "../engine/types";

@Injectable()
export class SchemaDiffService {
  private readonly logger = new Logger(SchemaDiffService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Detect schema differences between entity definitions and database
   */
  async detectSchemaDiff(): Promise<SchemaDiff> {
    this.logger.log("Detecting schema differences...");

    try {
      // Use TypeORM's schema synchronization to detect differences
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        // Get current database schema
        const currentTables = await queryRunner.getTables();
        const currentTableNames = new Set(currentTables.map(t => t.name));

        // Get entity metadata
        const entityMetadatas = this.dataSource.entityMetadatas;
        const entityTableNames = new Set(entityMetadatas.map(m => m.tableName));

        // Find new tables (in entities but not in database)
        const newTables = entityMetadatas.filter(m => !currentTableNames.has(m.tableName));
        
        // Find dropped tables (in database but not in entities)
        const droppedTables = currentTables.filter(t => !entityTableNames.has(t.name));

        // For now, we'll return a basic structure
        // In a real implementation, this would use TypeORM's schema builder
        // to generate the actual SQL differences
        const up: string[] = [];
        const down: string[] = [];

        // Add new tables
        newTables.forEach(metadata => {
          up.push(`-- CREATE TABLE ${metadata.tableName}`);
          down.push(`-- DROP TABLE ${metadata.tableName}`);
        });

        // Add dropped tables
        droppedTables.forEach(table => {
          up.push(`-- DROP TABLE ${table.name}`);
          down.push(`-- CREATE TABLE ${table.name}`);
        });

        const diff: SchemaDiff = {
          up,
          down,
          newTables: newTables.map(m => m.tableName),
          droppedTables: droppedTables.map(t => t.name),
          alteredTables: [], // Would be populated with actual column/index changes
        };

        this.logger.log(
          `Schema diff detected: ${newTables.length} new tables, ${droppedTables.length} dropped tables`,
        );

        return diff;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error("Failed to detect schema differences", error);
      throw error;
    }
  }
}