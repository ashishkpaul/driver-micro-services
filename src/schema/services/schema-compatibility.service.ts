import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SchemaDiffService } from './schema-diff.service';
import { SchemaClassificationService } from './schema-classification.service';
import { SchemaSnapshotService } from './schema-snapshot.service';
import { SchemaCompatibilityGraph } from '../types/schema-compatibility.types';

@Injectable()
export class SchemaCompatibilityService {
  private readonly logger = new Logger(SchemaCompatibilityService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schemaDiffService: SchemaDiffService,
    private readonly schemaClassificationService: SchemaClassificationService,
    private readonly schemaSnapshotService: SchemaSnapshotService,
  ) {}

  /**
   * Analyzes schema compatibility between current state and proposed changes
   */
  async analyzeCompatibility(
    proposedChanges: string[],
    currentSnapshot?: any,
  ): Promise<SchemaCompatibilityGraph> {
    this.logger.log('🔍 Analyzing schema compatibility...');

    try {
      // Get current schema snapshot if not provided
      const snapshot = currentSnapshot || await this.schemaSnapshotService.createSnapshot();

      // Classify proposed changes
      const classifiedChanges = await this.schemaClassificationService.classifyChanges(proposedChanges);

      // Build compatibility graph
      const graph = this.buildCompatibilityGraph(classifiedChanges, snapshot);

      // Analyze breaking changes
      const breakingChanges = this.analyzeBreakingChanges(classifiedChanges);

      // Calculate risk assessment
      const riskAssessment = this.calculateRiskAssessment(classifiedChanges, breakingChanges);

      // Generate mitigation strategies
      const mitigationStrategies = this.generateMitigationStrategies(breakingChanges);

      const compatibilityGraph: SchemaCompatibilityGraph = {
        timestamp: new Date().toISOString(),
        currentSchemaHash: snapshot.hash,
        proposedChanges: classifiedChanges,
        compatibilityGraph: graph,
        breakingChanges,
        riskAssessment,
        mitigationStrategies,
        compatibilityScore: this.calculateCompatibilityScore(classifiedChanges, breakingChanges),
        recommendations: this.generateRecommendations(classifiedChanges, breakingChanges),
      };

      this.logger.log(`✅ Compatibility analysis complete. Score: ${compatibilityGraph.compatibilityScore}/100`);
      return compatibilityGraph;

    } catch (error) {
      this.logger.error('❌ Compatibility analysis failed', error.stack);
      throw new Error(`Schema compatibility analysis failed: ${error.message}`);
    }
  }

  /**
   * Builds a dependency graph of schema changes
   */
  private buildCompatibilityGraph(classifiedChanges: any, snapshot: any) {
    const graph = {
      nodes: new Map(),
      edges: [] as Array<{
        from: number;
        to: number;
        type: string;
        reason: string;
      }>,
      dependencies: new Map(),
      conflicts: [] as Array<{
        change1: number;
        change2: number;
        type: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        description: string;
      }>,
    };

    // Add nodes for each change
    classifiedChanges.forEach((change: any, index: number) => {
      graph.nodes.set(index, {
        id: index,
        type: change.type,
        operation: change.operation,
        target: change.target,
        dependencies: [],
        conflicts: [],
        riskLevel: this.calculateChangeRisk(change),
      });
    });

    // Analyze dependencies between changes
    for (let i = 0; i < classifiedChanges.length; i++) {
      for (let j = i + 1; j < classifiedChanges.length; j++) {
        const dependency = this.analyzeDependency(classifiedChanges[i], classifiedChanges[j]);
        if (dependency) {
          graph.edges.push({
            from: i,
            to: j,
            type: dependency.type,
            reason: dependency.reason,
          });
          graph.nodes.get(j).dependencies.push(i);
        }

        // Check for conflicts
        const conflict = this.analyzeConflict(classifiedChanges[i], classifiedChanges[j]);
        if (conflict) {
          graph.conflicts.push({
            change1: i,
            change2: j,
            type: conflict.type,
            severity: conflict.severity as 'critical' | 'high' | 'medium' | 'low',
            description: conflict.description,
          });
          graph.nodes.get(i).conflicts.push(j);
          graph.nodes.get(j).conflicts.push(i);
        }
      }
    }

    return graph;
  }

  /**
   * Analyzes breaking changes in the proposed changes
   */
  private analyzeBreakingChanges(classifiedChanges: any) {
    const breakingChanges = {
      critical: [] as Array<{
        change: any;
        impact: string;
        affectedEntities: string[];
        rollbackComplexity: string;
      }>,
      high: [] as Array<{
        change: any;
        impact: string;
        affectedEntities: string[];
        rollbackComplexity: string;
      }>,
      medium: [] as Array<{
        change: any;
        impact: string;
        affectedEntities: string[];
        rollbackComplexity: string;
      }>,
      low: [] as Array<{
        change: any;
        impact: string;
        affectedEntities: string[];
        rollbackComplexity: string;
      }>,
      total: 0,
    };

    classifiedChanges.forEach((change: any) => {
      if (change.classification === 'BREAKING') {
        const riskLevel = this.calculateChangeRisk(change);
        breakingChanges[riskLevel].push({
          change,
          impact: this.assessImpact(change),
          affectedEntities: this.getAffectedEntities(change),
          rollbackComplexity: this.assessRollbackComplexity(change),
        });
        breakingChanges.total++;
      }
    });

    return breakingChanges;
  }

  /**
   * Calculates overall compatibility score
   */
  private calculateCompatibilityScore(classifiedChanges: any, breakingChanges: any): number {
    const totalChanges = classifiedChanges.length;
    if (totalChanges === 0) return 100;

    const breakingCount = breakingChanges.total;
    const criticalCount = breakingChanges.critical.length;
    const highCount = breakingChanges.high.length;

    // Base score starts at 100
    let score = 100;

    // Deduct points for breaking changes
    score -= (breakingCount * 10);
    score -= (criticalCount * 25);
    score -= (highCount * 15);

    // Additional penalties for specific high-risk operations
    const highRiskOperations = classifiedChanges.filter((c: any) => 
      c.operation === 'DROP_TABLE' || 
      c.operation === 'DROP_COLUMN' ||
      c.operation === 'ALTER_COLUMN_TYPE'
    );
    score -= (highRiskOperations.length * 20);

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculates risk level for individual changes
   */
  private calculateChangeRisk(change: any): 'critical' | 'high' | 'medium' | 'low' {
    if (change.classification === 'BREAKING') {
      if (change.operation === 'DROP_TABLE') return 'critical';
      if (change.operation === 'DROP_COLUMN') return 'high';
      if (change.operation === 'ALTER_COLUMN_TYPE') return 'high';
      if (change.operation === 'DROP_INDEX') return 'medium';
      return 'medium';
    }

    if (change.classification === 'SAFE') {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Analyzes dependency between two changes
   */
  private analyzeDependency(change1: any, change2: any): any {
    // Table creation must happen before column/index operations on that table
    if (change1.operation === 'CREATE_TABLE' && 
        (change2.operation === 'ADD_COLUMN' || change2.operation === 'ADD_INDEX') &&
        change2.target.table === change1.target.table) {
      return {
        type: 'table_dependency',
        reason: `Change 2 depends on table created in Change 1: ${change1.target.table}`,
      };
    }

    // Column creation must happen before index creation on that column
    if (change1.operation === 'ADD_COLUMN' && 
        change2.operation === 'ADD_INDEX' &&
        change1.target.table === change2.target.table &&
        change2.target.columns.includes(change1.target.column)) {
      return {
        type: 'column_dependency',
        reason: `Change 2 depends on column created in Change 1: ${change1.target.column}`,
      };
    }

    // Index creation must happen before foreign key creation that uses it
    if (change1.operation === 'ADD_INDEX' && 
        change2.operation === 'ADD_FOREIGN_KEY' &&
        change1.target.table === change2.target.table &&
        change2.target.columns.includes(change1.target.columns[0])) {
      return {
        type: 'index_dependency',
        reason: `Change 2 depends on index created in Change 1: ${change1.target.name}`,
      };
    }

    return null;
  }

  /**
   * Analyzes conflicts between two changes
   */
  private analyzeConflict(change1: any, change2: any): any {
    // Same table operations that might conflict
    if (change1.target.table === change2.target.table) {
      // DROP vs ADD operations on same table
      if ((change1.operation === 'DROP_TABLE' || change1.operation === 'DROP_COLUMN') &&
          (change2.operation === 'ADD_TABLE' || change2.operation === 'ADD_COLUMN')) {
        return {
          type: 'drop_add_conflict',
          severity: 'critical',
          description: `Conflicting operations on table ${change1.target.table}: ${change1.operation} vs ${change2.operation}`,
        };
      }

      // Multiple operations on same column
      if (change1.target.column && change2.target.column && 
          change1.target.column === change2.target.column) {
        return {
          type: 'column_conflict',
          severity: 'high',
          description: `Multiple operations on column ${change1.target.column}: ${change1.operation} vs ${change2.operation}`,
        };
      }
    }

    return null;
  }

  /**
   * Assesses impact of a breaking change
   */
  private assessImpact(change: any): string {
    switch (change.operation) {
      case 'DROP_TABLE':
        return 'CRITICAL: Will result in complete data loss for the table';
      case 'DROP_COLUMN':
        return 'HIGH: Will result in data loss for the column and may break application code';
      case 'ALTER_COLUMN_TYPE':
        return 'MEDIUM: May cause data conversion issues and application compatibility problems';
      case 'DROP_INDEX':
        return 'LOW: Will impact query performance but no data loss';
      default:
        return 'UNKNOWN: Impact assessment not available';
    }
  }

  /**
   * Gets affected entities for a change
   */
  private getAffectedEntities(change: any): string[] {
    const entities: string[] = [];

    if (change.target.table) {
      entities.push(`Table: ${change.target.table}`);
    }

    if (change.target.column) {
      entities.push(`Column: ${change.target.column}`);
    }

    if (change.target.index) {
      entities.push(`Index: ${change.target.index}`);
    }

    if (change.target.foreignKey) {
      entities.push(`Foreign Key: ${change.target.foreignKey}`);
    }

    return entities;
  }

  /**
   * Assesses rollback complexity
   */
  private assessRollbackComplexity(change: any): string {
    switch (change.operation) {
      case 'DROP_TABLE':
        return 'CRITICAL: Rollback requires data restoration from backup';
      case 'DROP_COLUMN':
        return 'HIGH: Rollback requires data restoration and schema modification';
      case 'ALTER_COLUMN_TYPE':
        return 'MEDIUM: Rollback requires data conversion back to original type';
      case 'DROP_INDEX':
        return 'LOW: Rollback is straightforward index recreation';
      default:
        return 'UNKNOWN: Rollback complexity not assessed';
    }
  }

  /**
   * Calculates risk assessment
   */
  private calculateRiskAssessment(classifiedChanges: any, breakingChanges: any) {
    const totalChanges = classifiedChanges.length;
    const breakingCount = breakingChanges.total;

    return {
      overallRisk: this.calculateOverallRisk(breakingChanges),
      riskFactors: this.identifyRiskFactors(classifiedChanges, breakingChanges),
      mitigationPriority: this.calculateMitigationPriority(breakingChanges),
      estimatedDowntime: this.estimateDowntime(breakingChanges),
      rollbackRisk: this.calculateRollbackRisk(breakingChanges),
    };
  }

  /**
   * Calculates overall risk level
   */
  private calculateOverallRisk(breakingChanges: any): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    const criticalCount = breakingChanges.critical.length;
    const highCount = breakingChanges.high.length;

    if (criticalCount > 0) return 'CRITICAL';
    if (highCount > 2) return 'HIGH';
    if (highCount > 0) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Identifies specific risk factors
   */
  private identifyRiskFactors(classifiedChanges: any, breakingChanges: any): string[] {
    const factors: string[] = [];

    if (breakingChanges.critical.length > 0) {
      factors.push('Critical breaking changes detected');
    }

    if (breakingChanges.high.length > 0) {
      factors.push('High-risk operations identified');
    }

    const dataLossOperations = classifiedChanges.filter((c: any) => 
      c.operation === 'DROP_TABLE' || c.operation === 'DROP_COLUMN'
    );
    if (dataLossOperations.length > 0) {
      factors.push('Data loss operations detected');
    }

    const performanceImpacting = classifiedChanges.filter((c: any) => 
      c.operation === 'DROP_INDEX' || c.operation === 'ALTER_COLUMN_TYPE'
    );
    if (performanceImpacting.length > 0) {
      factors.push('Performance-impacting changes identified');
    }

    return factors;
  }

  /**
   * Calculates mitigation priority
   */
  private calculateMitigationPriority(breakingChanges: any): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    const criticalCount = breakingChanges.critical.length;
    const highCount = breakingChanges.high.length;

    if (criticalCount > 0) return 'CRITICAL';
    if (highCount > 1) return 'HIGH';
    if (highCount > 0) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Estimates downtime required
   */
  private estimateDowntime(breakingChanges: any): string {
    const criticalCount = breakingChanges.critical.length;
    const highCount = breakingChanges.high.length;

    if (criticalCount > 0) return 'CRITICAL: Extended downtime required (hours)';
    if (highCount > 2) return 'HIGH: Significant downtime required (30-60 minutes)';
    if (highCount > 0) return 'MEDIUM: Moderate downtime required (10-30 minutes)';
    return 'LOW: Minimal downtime required (< 10 minutes)';
  }

  /**
   * Calculates rollback risk
   */
  private calculateRollbackRisk(breakingChanges: any): string {
    const criticalCount = breakingChanges.critical.length;
    const highCount = breakingChanges.high.length;

    if (criticalCount > 0) return 'CRITICAL: Rollback may be impossible without data loss';
    if (highCount > 2) return 'HIGH: Rollback is complex and risky';
    if (highCount > 0) return 'MEDIUM: Rollback is possible but requires careful execution';
    return 'LOW: Rollback is straightforward';
  }

  /**
   * Generates mitigation strategies
   */
  private generateMitigationStrategies(breakingChanges: any) {
    const strategies: Array<{
      type: string;
      description: string;
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      steps: string[];
    }> = [];

    if (breakingChanges.critical.length > 0) {
      strategies.push({
        type: 'CRITICAL_BACKUP_REQUIRED',
        description: 'Full database backup required before migration',
        priority: 'CRITICAL' as const,
        steps: [
          'Create complete database backup',
          'Verify backup integrity',
          'Plan rollback procedure',
          'Coordinate with stakeholders for extended downtime'
        ]
      });
    }

    if (breakingChanges.high.length > 0) {
      strategies.push({
        type: 'HIGH_RISK_MITIGATION',
        description: 'High-risk operations require careful planning',
        priority: 'HIGH' as const,
        steps: [
          'Create table/column backups',
          'Test migration in staging environment',
          'Prepare rollback scripts',
          'Coordinate application deployment'
        ]
      });
    }

    strategies.push({
      type: 'VALIDATION_REQUIRED',
      description: 'Post-migration validation required',
      priority: 'MEDIUM' as const,
      steps: [
        'Verify data integrity',
        'Test application functionality',
        'Monitor performance metrics',
        'Validate backup/restore procedures'
      ]
    });

    return strategies;
  }

  /**
   * Generates recommendations
   */
  private generateRecommendations(classifiedChanges: any, breakingChanges: any) {
    const recommendations: Array<{
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      category: string;
      message: string;
      action: string;
    }> = [];

    if (breakingChanges.critical.length > 0) {
      recommendations.push({
        priority: 'CRITICAL' as const,
        category: 'BREAKING_CHANGES',
        message: 'Critical breaking changes detected. Consider alternative approaches or extensive testing.',
        action: 'Review breaking changes and consider non-breaking alternatives'
      });
    }

    if (breakingChanges.high.length > 0) {
      recommendations.push({
        priority: 'HIGH' as const,
        category: 'TESTING_REQUIRED',
        message: 'High-risk operations require comprehensive testing.',
        action: 'Test migration in staging environment with production-like data'
      });
    }

    const conflicts = this.findConflicts(classifiedChanges);
    if (conflicts.length > 0) {
      recommendations.push({
        priority: 'HIGH' as const,
        category: 'DEPENDENCY_RESOLUTION',
        message: 'Conflicting operations detected. Reorder changes to resolve conflicts.',
        action: 'Reorder migration operations to resolve dependencies and conflicts'
      });
    }

    if (classifiedChanges.length > 10) {
      recommendations.push({
        priority: 'MEDIUM' as const,
        category: 'BATCH_SIZE',
        message: 'Large number of changes detected. Consider splitting into smaller migrations.',
        action: 'Split large migrations into smaller, focused changes'
      });
    }

    return recommendations;
  }

  /**
   * Finds conflicts in changes
   */
  private findConflicts(classifiedChanges: any): Array<{
    change1: number;
    change2: number;
    type: string;
    severity: string;
    description: string;
  }> {
    const conflicts: Array<{
      change1: number;
      change2: number;
      type: string;
      severity: string;
      description: string;
    }> = [];
    
    for (let i = 0; i < classifiedChanges.length; i++) {
      for (let j = i + 1; j < classifiedChanges.length; j++) {
        const conflict = this.analyzeConflict(classifiedChanges[i], classifiedChanges[j]);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }
}