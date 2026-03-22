/**
 * Migration Engine Type Definitions
 * 
 * Centralized type definitions for the automated migration system.
 */

export type SqlCategory = 'SAFE' | 'DATA' | 'BREAKING' | 'FIX';

export type MigrationType = 'SAFE' | 'DATA' | 'BREAKING';

export type Prefix = 'SAFE_' | 'DATA_' | 'BREAKING_' | 'FIX_' | 'BASELINE_';

export interface ClassifiedStatement {
  sql: string;
  category: SqlCategory;
  reason: string;
}

export interface MigrationLifecycleSet {
  safe: string[];
  data: string[];
  breaking: string[];
}

export interface MigrationClassification {
  categories: Set<SqlCategory>;
  statements: ClassifiedStatement[];
  dominantPrefix: Prefix;
  needsPhaseDecomposition: boolean;
  phases: SqlCategory[];
}

export interface CompanionMigration {
  phase: 'DATA' | 'BREAKING';
  sql: string;
  reason: string;
}

export interface HeaderOptions {
  prefix: Prefix;
  description?: string;
  phase?: string;
  phaseTotal?: number;
  companions?: string[];
  isAutoFixed?: boolean;
}

export interface SchemaDiff {
  up: string[];
  down: string[];
}

export interface MigrationGenerationOptions {
  name: string;
  outputDir: string;
  config: string;
}

export interface LifecycleSplitResult {
  safe: string[];
  data: string[];
  breaking: string[];
  companions: CompanionMigration[];
}