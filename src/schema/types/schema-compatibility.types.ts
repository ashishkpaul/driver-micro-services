export interface SchemaCompatibilityGraph {
  timestamp: string;
  currentSchemaHash: string;
  proposedChanges: ClassifiedChange[];
  compatibilityGraph: CompatibilityGraph;
  breakingChanges: BreakingChanges;
  riskAssessment: RiskAssessment;
  mitigationStrategies: MitigationStrategy[];
  compatibilityScore: number;
  recommendations: Recommendation[];
}

export interface ClassifiedChange {
  type: string;
  operation: string;
  target: ChangeTarget;
  classification: 'SAFE' | 'BREAKING' | 'DATA' | 'FIX';
  description?: string;
}

export interface ChangeTarget {
  table?: string;
  column?: string;
  index?: string;
  foreignKey?: string;
  columns?: string[];
  name?: string;
}

export interface CompatibilityGraph {
  nodes: Map<number, ChangeNode>;
  edges: DependencyEdge[];
  dependencies: Map<number, number[]>;
  conflicts: Conflict[];
}

export interface ChangeNode {
  id: number;
  type: string;
  operation: string;
  target: ChangeTarget;
  dependencies: number[];
  conflicts: number[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface DependencyEdge {
  from: number;
  to: number;
  type: string;
  reason: string;
}

export interface Conflict {
  change1: number;
  change2: number;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface BreakingChanges {
  critical: BreakingChangeDetail[];
  high: BreakingChangeDetail[];
  medium: BreakingChangeDetail[];
  low: BreakingChangeDetail[];
  total: number;
}

export interface BreakingChangeDetail {
  change: ClassifiedChange;
  impact: string;
  affectedEntities: string[];
  rollbackComplexity: string;
}

export interface RiskAssessment {
  overallRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskFactors: string[];
  mitigationPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedDowntime: string;
  rollbackRisk: string;
}

export interface MitigationStrategy {
  type: string;
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  steps: string[];
}

export interface Recommendation {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  message: string;
  action: string;
}