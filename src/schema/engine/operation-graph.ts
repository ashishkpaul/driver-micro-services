/**
 * Operation Dependency Graph Builder
 *
 * Builds a dependency graph for schema operations to ensure safe execution order.
 * Handles table dependencies, foreign key relationships, and operation conflicts.
 */

import { PhasePlan, OperationGraph, SchemaOperation } from "./types";

/**
 * Build operation dependency graph from lifecycle phases
 */
export function buildOperationGraph(phases: PhasePlan[]): OperationGraph {
  console.log("  Building operation dependency graph...");

  const graph: OperationGraph = {
    nodes: new Map(),
    edges: new Map(),
    roots: [],
    leaves: [],
  };

  // Add all operations as nodes
  for (const phase of phases) {
    for (const operation of phase.operations) {
      graph.nodes.set(operation.sql, operation);
      graph.edges.set(operation.sql, []);
    }
  }

  // Build dependency edges
  const allOperations = Array.from(graph.nodes.values());

  for (const operation of allOperations) {
    const dependencies = findDependencies(operation, allOperations);
    graph.edges.set(operation.sql, dependencies);
  }

  // Identify roots and leaves
  identifyRootsAndLeaves(graph);

  console.log(
    `  Dependency graph built: ${graph.nodes.size} operations, ${countEdges(graph)} dependencies`,
  );

  return graph;
}

/**
 * Find dependencies for a given operation
 */
function findDependencies(
  operation: SchemaOperation,
  allOperations: SchemaOperation[],
): string[] {
  const dependencies: string[] = [];

  // Extract table references from operation
  const operationTables = extractTableReferences(operation.sql);

  for (const otherOp of allOperations) {
    if (otherOp.sql === operation.sql) continue;

    const otherTables = extractTableReferences(otherOp.sql);

    // Check for table conflicts
    if (hasTableConflict(operation, otherOp, operationTables, otherTables)) {
      dependencies.push(otherOp.sql);
    }

    // Check for foreign key dependencies
    if (
      hasForeignKeyDependency(operation, otherOp, operationTables, otherTables)
    ) {
      dependencies.push(otherOp.sql);
    }

    // Check for constraint dependencies
    if (
      hasConstraintDependency(operation, otherOp, operationTables, otherTables)
    ) {
      dependencies.push(otherOp.sql);
    }
  }

  return dependencies;
}

/**
 * Extract table references from SQL statement
 */
function extractTableReferences(sql: string): string[] {
  const tables: string[] = [];

  // Match various table reference patterns
  const patterns = [
    /(?:FROM|INTO|UPDATE|TABLE|JOIN)\s+["']?(\w+)["']?/gi,
    /ALTER\s+TABLE\s+["']?(\w+)["']?/gi,
    /DROP\s+(?:TABLE|INDEX)\s+["']?(\w+)["']?/gi,
    /CREATE\s+(?:TABLE|INDEX)\s+["']?(\w+)["']?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const tableName = match[1].toLowerCase();
      if (!tables.includes(tableName)) {
        tables.push(tableName);
      }
    }
  }

  return tables;
}

/**
 * Check for table conflicts between operations
 */
function hasTableConflict(
  op1: SchemaOperation,
  op2: SchemaOperation,
  tables1: string[],
  tables2: string[],
): boolean {
  // Find common tables
  const commonTables = tables1.filter((table) => tables2.includes(table));
  if (commonTables.length === 0) return false;

  // Check for conflicting operations on same table
  for (const table of commonTables) {
    if (isConflictingOperation(op1, op2)) {
      return true;
    }
  }

  return false;
}

/**
 * Check for foreign key dependencies
 */
function hasForeignKeyDependency(
  op1: SchemaOperation,
  op2: SchemaOperation,
  tables1: string[],
  tables2: string[],
): boolean {
  // If op1 modifies a table and op2 creates/drops FK referencing it
  if (op1.category === "BREAKING" && op2.category === "SAFE") {
    return tables1.some((table) => tables2.includes(table));
  }

  return false;
}

/**
 * Check for constraint dependencies
 */
function hasConstraintDependency(
  op1: SchemaOperation,
  op2: SchemaOperation,
  tables1: string[],
  tables2: string[],
): boolean {
  // If op1 drops a constraint and op2 depends on it
  if (
    op1.sql.includes("DROP CONSTRAINT") &&
    op2.sql.includes("ADD CONSTRAINT")
  ) {
    return tables1.some((table) => tables2.includes(table));
  }

  return false;
}

/**
 * Check if two operations conflict with each other
 */
function isConflictingOperation(
  op1: SchemaOperation,
  op2: SchemaOperation,
): boolean {
  // DROP vs ADD on same table
  if (
    (op1.sql.includes("DROP") && op2.sql.includes("ADD")) ||
    (op1.sql.includes("ADD") && op2.sql.includes("DROP"))
  ) {
    return true;
  }

  // ALTER vs ALTER on same table
  if (op1.sql.includes("ALTER") && op2.sql.includes("ALTER")) {
    return true;
  }

  // DATA operations should generally run after SAFE operations
  if (op1.category === "DATA" && op2.category === "SAFE") {
    return true;
  }

  return false;
}

/**
 * Identify root and leaf nodes in the graph
 */
function identifyRootsAndLeaves(graph: OperationGraph): void {
  const nodesWithDependencies = new Set<string>();

  // Collect all nodes that are dependencies of other nodes
  for (const [_, dependencies] of graph.edges) {
    for (const dep of dependencies) {
      nodesWithDependencies.add(dep);
    }
  }

  // Roots are nodes that are not dependencies of any other node
  for (const [nodeId] of graph.nodes) {
    if (!nodesWithDependencies.has(nodeId)) {
      graph.roots.push(nodeId);
    }
  }

  // Leaves are nodes that have no outgoing edges
  for (const [nodeId, dependencies] of graph.edges) {
    if (dependencies.length === 0) {
      graph.leaves.push(nodeId);
    }
  }
}

/**
 * Count total edges in the graph
 */
function countEdges(graph: OperationGraph): number {
  let count = 0;
  for (const dependencies of graph.edges.values()) {
    count += dependencies.length;
  }
  return count;
}

/**
 * Validate graph for cycles
 */
export function validateGraph(graph: OperationGraph): {
  isValid: boolean;
  cycles: string[][];
} {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): boolean {
    if (recursionStack.has(nodeId)) {
      // Found a cycle
      const cycleStart = path.indexOf(nodeId);
      cycles.push(path.slice(cycleStart));
      return false;
    }

    if (visited.has(nodeId)) {
      return true;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const dependencies = graph.edges.get(nodeId) || [];
    for (const dep of dependencies) {
      if (!dfs(dep, path)) {
        return false;
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return true;
  }

  for (const [nodeId] of graph.nodes) {
    if (!visited.has(nodeId)) {
      if (!dfs(nodeId, [])) {
        return { isValid: false, cycles };
      }
    }
  }

  return { isValid: true, cycles: [] };
}
