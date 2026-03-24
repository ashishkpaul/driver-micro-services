import { Injectable, Logger } from "@nestjs/common";
import { IntentTranslator as CoreIntentTranslator } from "../intent/intent-translator";
import { SchemaIntent, IntentTranslation } from "../intent/schema-intent";

@Injectable()
export class IntentTranslatorService {
  private readonly logger = new Logger(IntentTranslatorService.name);
  private readonly coreTranslator = new CoreIntentTranslator();

  /**
   * Translate a schema intent into a migration plan
   */
  translateIntent(intent: SchemaIntent): IntentTranslation {
    this.logger.log(`Translating intent: ${intent.type}`);
    
    const translation = this.coreTranslator.translate(intent);
    
    this.logger.log(`✅ Intent translation complete: ${translation.phases.length} phases`);
    
    return translation;
  }

  /**
   * Generate SQL operations for a specific intent
   */
  generateSqlOperations(intent: SchemaIntent): string[] {
    const translation = this.translateIntent(intent);
    const sqlOperations: string[] = [];

    for (const phase of translation.phases) {
      for (const operation of phase.operations) {
        if (operation.sql) {
          sqlOperations.push(operation.sql);
        }
      }
    }

    return sqlOperations;
  }

  /**
   * Calculate migration complexity score
   */
  calculateComplexity(intent: SchemaIntent): {
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    factors: string[];
  } {
    const intentTranslation = this.translateIntent(intent);
    let score = 0;
    const factors: string[] = [];

    // Base score from intent type
    switch (intent.type) {
      case "ADD_COLUMN":
      case "ADD_INDEX":
        score += 1;
        factors.push("Simple addition operation");
        break;
      case "DROP_COLUMN":
      case "DROP_INDEX":
        score += 2;
        factors.push("Destructive operation");
        break;
      case "RENAME_COLUMN":
        score += 3;
        factors.push("Rename requires data migration");
        break;
      case "CHANGE_COLUMN_TYPE":
        score += 4;
        factors.push("Type conversion with data migration");
        break;
      case "ADD_CONSTRAINT":
        score += 2;
        factors.push("Constraint validation required");
        break;
      case "DROP_CONSTRAINT":
        score += 3;
        factors.push("Constraint removal with validation");
        break;
      case "RENAME_TABLE":
        score += 4;
        factors.push("Table rename with potential references");
        break;
      case "SPLIT_TABLE":
        score += 5;
        factors.push("Complex table restructuring");
        break;
      case "MERGE_TABLES":
        score += 6;
        factors.push("Complex data merging operation");
        break;
    }

    // Adjust score based on metadata
    if (intent.metadata.priority === "CRITICAL") {
      score += 2;
      factors.push("High priority operation");
    }

    if (intent.metadata.estimatedImpact === "MASSIVE") {
      score += 3;
      factors.push("Massive impact operation");
    } else if (intent.metadata.estimatedImpact === "SIGNIFICANT") {
      score += 2;
      factors.push("Significant impact operation");
    }

    // Adjust based on number of phases
    score += intentTranslation.phases.length;

    // Determine complexity level
    let level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    if (score <= 3) {
      level = "LOW";
    } else if (score <= 6) {
      level = "MEDIUM";
    } else if (score <= 9) {
      level = "HIGH";
    } else {
      level = "CRITICAL";
    }

    return { score, level, factors };
  }

  /**
   * Generate migration summary
   */
  generateSummary(intent: SchemaIntent): {
    intentType: string;
    estimatedTime: string;
    complexity: string;
    requiredApprovals: string[];
    rollbackPlan: string[];
    operationsCount: number;
  } {
    const translation = this.translateIntent(intent);
    const complexity = this.calculateComplexity(intent);

    return {
      intentType: intent.type,
      estimatedTime: translation.estimatedTime,
      complexity: complexity.level,
      requiredApprovals: translation.requiredApprovals,
      rollbackPlan: translation.rollbackPlan,
      operationsCount: translation.phases.reduce(
        (total, phase) => total + phase.operations.length,
        0,
      ),
    };
  }

  /**
   * Validate intent translation
   */
  validateTranslation(intent: SchemaIntent): {
    valid: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      const intentTranslation = this.translateIntent(intent);

      // Check for missing dependencies
      for (const phase of intentTranslation.phases) {
        for (const dep of phase.dependencies) {
          const hasDependency = intentTranslation.phases.some(p => p.phase === dep);
          if (!hasDependency) {
            issues.push(`Missing dependency: ${dep} for phase ${phase.phase}`);
          }
        }
      }

      // Check for circular dependencies
      const phases = intentTranslation.phases.map(p => p.phase);
      for (const phase of phases) {
        if (phases.includes(phase)) {
          // Simple circular dependency check
          const phaseObj = intentTranslation.phases.find(p => p.phase === phase);
          if (phaseObj?.dependencies.includes(phase)) {
            issues.push(`Circular dependency detected in phase ${phase}`);
          }
        }
      }

      // Check for operations without SQL
      for (const phase of intentTranslation.phases) {
        for (const operation of phase.operations) {
          if (operation.type === "SQL" && !operation.sql) {
            issues.push(`Operation in phase ${phase.phase} missing SQL`);
          }
        }
      }

      // Check for estimated time consistency
      const totalEstimatedTime = intentTranslation.phases.reduce(
        (total, phase) => {
          const [h, m, s] = phase.estimatedDuration.split(":").map(Number);
          return total + (h * 3600) + (m * 60) + s;
        },
        0,
      );

      const translationTime = intentTranslation.estimatedTime;
      const [h, m, s] = translationTime.split(":").map(Number);
      const translationSeconds = (h * 3600) + (m * 60) + s;

      if (Math.abs(totalEstimatedTime - translationSeconds) > 60) {
        warnings.push("Estimated time mismatch between phases and total");
      }

    } catch (error) {
      issues.push(`Translation validation failed: ${error.message}`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }
}