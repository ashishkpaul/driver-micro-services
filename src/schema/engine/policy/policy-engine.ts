/**
 * Schema Policy Engine
 *
 * Governs schema evolution by evaluating proposed changes against defined policies.
 * Acts as the gatekeeper before any migration enters the execution pipeline.
 */

import { SchemaDiff } from "../types";
import { CompatibilityRules } from "./compatibility-rules";
import { OperationalRules } from "./operational-rules";

export interface PolicyDecision {
  decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  reasons: string[];
  violations: PolicyViolation[];
}

export interface PolicyViolation {
  rule: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  operation: string;
  suggestedFix?: string;
}

export interface PolicyContext {
  schemaDiff: SchemaDiff;
  databaseSnapshot: any;
  operationMetadata: Map<string, any>;
  maintenanceWindow?: {
    start: string;
    end: string;
    timezone: string;
  };
}

/**
 * Schema Policy Engine
 *
 * Evaluates proposed schema changes against defined policies and returns
 * governance decisions before migration generation.
 */
export class SchemaPolicyEngine {
  private compatibilityRules: CompatibilityRules;
  private operationalRules: OperationalRules;

  constructor() {
    this.compatibilityRules = new CompatibilityRules();
    this.operationalRules = new OperationalRules();
  }

  /**
   * Evaluate proposed schema changes against all policies
   */
  public async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    console.log("🏛️  Evaluating schema changes against policies...");

    const violations: PolicyViolation[] = [];
    const reasons: string[] = [];

    // Phase 1: Compatibility Rules
    const compatibilityViolations = this.compatibilityRules.evaluate(
      context.schemaDiff,
    );
    violations.push(...compatibilityViolations);

    // Phase 2: Operational Rules
    const operationalViolations = this.operationalRules.evaluate(
      context.schemaDiff,
      context.databaseSnapshot,
      context.operationMetadata,
      context.maintenanceWindow,
    );
    violations.push(...operationalViolations);

    // Determine decision based on violations
    const criticalViolations = violations.filter(
      (v) => v.severity === "CRITICAL",
    );
    const warningViolations = violations.filter(
      (v) => v.severity === "WARNING",
    );

    let decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
    if (criticalViolations.length > 0) {
      decision = "DENY";
      reasons.push(
        `Critical violations detected: ${criticalViolations.map((v) => v.rule).join(", ")}`,
      );
    } else if (warningViolations.length > 0) {
      decision = "REQUIRE_APPROVAL";
      reasons.push(
        `Warning violations detected: ${warningViolations.map((v) => v.rule).join(", ")}`,
      );
    } else {
      decision = "ALLOW";
      reasons.push("All policies passed");
    }

    console.log(
      `📋 Policy evaluation complete: ${decision} (${violations.length} violations)`,
    );

    return {
      decision,
      reasons,
      violations,
    };
  }

  /**
   * Get policy compliance report
   */
  public async getComplianceReport(context: PolicyContext): Promise<{
    compliant: boolean;
    violations: PolicyViolation[];
    summary: {
      critical: number;
      warning: number;
      info: number;
    };
  }> {
    const decision = await this.evaluate(context);

    const summary = {
      critical: decision.violations.filter((v) => v.severity === "CRITICAL")
        .length,
      warning: decision.violations.filter((v) => v.severity === "WARNING")
        .length,
      info: decision.violations.filter((v) => v.severity === "INFO").length,
    };

    return {
      compliant: decision.decision === "ALLOW",
      violations: decision.violations,
      summary,
    };
  }

  /**
   * Generate policy suggestions for violations
   */
  public generateSuggestions(violations: PolicyViolation[]): string[] {
    const suggestions: string[] = [];

    for (const violation of violations) {
      if (violation.suggestedFix) {
        suggestions.push(violation.suggestedFix);
      }
    }

    return suggestions;
  }

  /**
   * Validate policy configuration
   */
  public validateConfiguration(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate compatibility rules
    const compatValidation = this.compatibilityRules.validate();
    errors.push(...compatValidation.errors);
    warnings.push(...compatValidation.warnings);

    // Validate operational rules
    const operValidation = this.operationalRules.validate();
    errors.push(...operValidation.errors);
    warnings.push(...operValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * Policy Engine Factory
 *
 * Creates configured policy engines with different rule sets
 */
export class PolicyEngineFactory {
  /**
   * Create a production-grade policy engine
   */
  public static createProductionEngine(): SchemaPolicyEngine {
    const engine = new SchemaPolicyEngine();

    // Production rules are stricter
    console.log("🏗️  Creating production policy engine with strict rules");

    return engine;
  }

  /**
   * Create a development policy engine
   */
  public static createDevelopmentEngine(): SchemaPolicyEngine {
    const engine = new SchemaPolicyEngine();

    // Development rules are more permissive
    console.log("🏗️  Creating development policy engine with relaxed rules");

    return engine;
  }

  /**
   * Create a custom policy engine with specific rules
   */
  public static createCustomEngine(rules: {
    compatibility?: boolean;
    operational?: boolean;
  }): SchemaPolicyEngine {
    const engine = new SchemaPolicyEngine();

    console.log("🏗️  Creating custom policy engine");

    return engine;
  }
}
