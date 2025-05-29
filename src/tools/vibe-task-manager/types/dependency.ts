/**
 * Dependency management types for the Vibe Task Manager
 */

/**
 * Types of dependencies between tasks
 */
export type DependencyType = 'blocks' | 'enables' | 'requires' | 'suggests';

/**
 * Represents a dependency relationship between two tasks
 */
export interface Dependency {
  /** Unique identifier for this dependency */
  id: string;
  
  /** ID of the task that has the dependency */
  fromTaskId: string;
  
  /** ID of the task that is depended upon */
  toTaskId: string;
  
  /** Type of dependency */
  type: DependencyType;
  
  /** Human-readable description of the dependency */
  description: string;
  
  /** Whether this dependency is critical for execution */
  critical: boolean;
  
  /** Metadata */
  metadata: {
    createdAt: Date;
    createdBy: string;
    reason: string;
  };
}

/**
 * Represents a node in the dependency graph
 */
export interface DependencyNode {
  /** Task ID */
  taskId: string;
  
  /** Task title for display */
  title: string;
  
  /** Task status */
  status: string;
  
  /** Estimated hours */
  estimatedHours: number;
  
  /** Priority level */
  priority: string;
  
  /** Dependencies (tasks this node depends on) */
  dependencies: string[];
  
  /** Dependents (tasks that depend on this node) */
  dependents: string[];
  
  /** Depth in the dependency tree */
  depth: number;
  
  /** Whether this node is on the critical path */
  criticalPath: boolean;
}

/**
 * Represents the complete dependency graph for a project
 */
export interface DependencyGraph {
  /** Project ID this graph belongs to */
  projectId: string;
  
  /** All nodes in the graph */
  nodes: Map<string, DependencyNode>;
  
  /** All dependency relationships */
  edges: Dependency[];
  
  /** Topologically sorted task order */
  executionOrder: string[];
  
  /** Critical path through the graph */
  criticalPath: string[];
  
  /** Graph statistics */
  statistics: {
    totalTasks: number;
    totalDependencies: number;
    maxDepth: number;
    cyclicDependencies: string[][];
    orphanedTasks: string[];
  };
  
  /** Graph metadata */
  metadata: {
    generatedAt: Date;
    version: string;
    isValid: boolean;
    validationErrors: string[];
  };
}

/**
 * Configuration for dependency analysis
 */
export interface DependencyAnalysisConfig {
  /** Whether to detect circular dependencies */
  detectCycles: boolean;
  
  /** Whether to optimize the execution order */
  optimizeOrder: boolean;
  
  /** Whether to identify the critical path */
  identifyCriticalPath: boolean;
  
  /** Maximum depth to analyze */
  maxDepth: number;
  
  /** Whether to suggest missing dependencies */
  suggestMissingDependencies: boolean;
  
  /** Whether to validate dependency consistency */
  validateConsistency: boolean;
}

/**
 * Result of dependency analysis
 */
export interface DependencyAnalysisResult {
  /** The analyzed dependency graph */
  graph: DependencyGraph;
  
  /** Issues found during analysis */
  issues: {
    type: 'cycle' | 'orphan' | 'missing' | 'inconsistent';
    severity: 'error' | 'warning' | 'info';
    description: string;
    affectedTasks: string[];
    suggestedFix?: string;
  }[];
  
  /** Optimization suggestions */
  optimizations: {
    type: 'reorder' | 'parallelize' | 'merge' | 'split';
    description: string;
    affectedTasks: string[];
    estimatedImprovement: string;
  }[];
  
  /** Analysis metadata */
  metadata: {
    analyzedAt: Date;
    analysisTime: number;
    configUsed: DependencyAnalysisConfig;
  };
}

/**
 * Dependency validation rules
 */
export interface DependencyValidationRule {
  /** Rule identifier */
  id: string;
  
  /** Rule name */
  name: string;
  
  /** Rule description */
  description: string;
  
  /** Rule severity */
  severity: 'error' | 'warning' | 'info';
  
  /** Validation function */
  validate: (graph: DependencyGraph) => {
    valid: boolean;
    issues: string[];
  };
}

/**
 * Dependency resolution strategy
 */
export interface DependencyResolutionStrategy {
  /** Strategy name */
  name: string;
  
  /** Strategy description */
  description: string;
  
  /** Resolution function */
  resolve: (graph: DependencyGraph) => {
    resolved: boolean;
    modifiedGraph: DependencyGraph;
    changes: string[];
  };
}

/**
 * Dependency graph operations
 */
export interface DependencyGraphOperations {
  /** Add a new dependency */
  addDependency(from: string, to: string, type: DependencyType, description: string): boolean;
  
  /** Remove a dependency */
  removeDependency(dependencyId: string): boolean;
  
  /** Update a dependency */
  updateDependency(dependencyId: string, updates: Partial<Dependency>): boolean;
  
  /** Get all dependencies for a task */
  getDependencies(taskId: string): Dependency[];
  
  /** Get all dependents for a task */
  getDependents(taskId: string): Dependency[];
  
  /** Check if adding a dependency would create a cycle */
  wouldCreateCycle(from: string, to: string): boolean;
  
  /** Get the shortest path between two tasks */
  getShortestPath(from: string, to: string): string[];
  
  /** Get all tasks that can be executed in parallel */
  getParallelExecutableTasks(): string[][];
  
  /** Validate the entire graph */
  validateGraph(): DependencyAnalysisResult;
  
  /** Optimize the execution order */
  optimizeExecutionOrder(): string[];
  
  /** Export graph to various formats */
  exportGraph(format: 'json' | 'yaml' | 'mermaid' | 'dot'): string;
}
