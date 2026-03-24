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
        // Get current database schema - filter to only public schema
        const currentTables = await queryRunner.getTables();
        const publicTables = currentTables.filter(t => {
          // Filter out system schemas
          return !t.name.startsWith('pg_') && 
                 !t.name.startsWith('information_') && 
                 !t.name.startsWith('sql_') &&
                 t.name !== '_migrations' &&
                 t.name !== '_migrations_lock';
        });
        
        const currentTableNames = new Set(publicTables.map(t => t.name));

        // Get entity metadata
        const entityMetadatas = this.dataSource.entityMetadatas;
        
        // Normalize entity table names to snake_case for comparison
        const normalizedEntityTableNames = new Set(
          entityMetadatas.map(m => this.normalizeTableName(m.tableName))
        );

        // Find new tables (in entities but not in database)
        const newTables = entityMetadatas.filter(m => {
          const normalizedTableName = this.normalizeTableName(m.tableName);
          return !currentTableNames.has(normalizedTableName);
        });
        
        // Find dropped tables (in database but not in entities)
        const droppedTables = publicTables.filter(t => {
          const normalizedTableName = this.normalizeTableName(t.name);
          return !normalizedEntityTableNames.has(normalizedTableName);
        });

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

  /**
   * Normalize table name from camelCase to snake_case for database comparison
   */
  private normalizeTableName(tableName: string): string {
    // Convert camelCase to snake_case
    return tableName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }
}