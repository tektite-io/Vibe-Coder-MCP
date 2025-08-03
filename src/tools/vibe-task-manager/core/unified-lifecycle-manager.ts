/**
 * Unified Lifecycle Manager for Vibe Task Manager
 * 
 * Consolidates task lifecycle, service lifecycle, workflow state management,
 * and execution coordination into a single, cohesive service.
 * 
 * Replaces:
 * - task-lifecycle.ts
 * - service-lifecycle-manager.ts  
 * - workflow-state-manager.ts
 * - execution-coordinator.ts (lifecycle aspects)
 */

import { EventEmitter } from 'events';
import path from 'path';
import * as fs from 'fs-extra';
import { TaskStatus } from '../types/task.js';
import { getTaskOperations } from './operations/task-operations.js';
import { createErrorContext, EnhancedError, ErrorFactory } from '../utils/enhanced-errors.js';
import { getVibeTaskManagerOutputDir } from '../utils/config-loader.js';
import logger from '../../../logger.js';

/**
 * Branded types for domain-specific type safety
 */
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type ProjectId = string & { readonly __brand: 'ProjectId' };

/**
 * Factory functions for branded type construction
 */
export function createWorkflowId(id: string): WorkflowId {
  if (!id || id.trim().length === 0) {
    throw new Error('Workflow ID cannot be empty');
  }
  return id.trim() as WorkflowId;
}

export function createSessionId(id: string): SessionId {
  if (!id || id.trim().length === 0) {
    throw new Error('Session ID cannot be empty');
  }
  return id.trim() as SessionId;
}

export function createTaskId(id: string): TaskId {
  if (!id || id.trim().length === 0) {
    throw new Error('Task ID cannot be empty');
  }
  return id.trim() as TaskId;
}

export function createProjectId(id: string): ProjectId {
  if (!id || id.trim().length === 0) {
    throw new Error('Project ID cannot be empty');
  }
  return id.trim() as ProjectId;
}

/**
 * Result type for explicit error handling
 */
export type Result<T, E = Error> = {
  readonly success: true;
  readonly data: T;
} | {
  readonly success: false;
  readonly error: E;
};

export function createSuccess<T, E = Error>(data: T): Result<T, E> {
  return { success: true, data };
}

export function createFailure<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Task transition metadata
 */
export interface TaskTransition {
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  timestamp: Date;
  reason?: string;
  triggeredBy?: string;
  metadata?: Record<string, unknown>;
  isAutomated: boolean;
}

/**
 * Service instance for lifecycle management
 */
export interface ServiceInstance {
  name: string;
  instance: unknown;
  isStarted: boolean;
  isDisposed: boolean;
  startMethod?: string;
  stopMethod?: string;
  disposeMethod?: string;
  resetStaticMethod?: string;
}

/**
 * Service dependency configuration
 */
export interface ServiceDependency {
  service: string;
  dependsOn: string[];
}

/**
 * Workflow state information
 */
export interface WorkflowState {
  workflowId: WorkflowId;
  sessionId: SessionId;
  status: 'initializing' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  phase: 'decomposition' | 'orchestration' | 'execution' | 'monitoring' | 'cleanup';
  startTime: Date;
  endTime?: Date;
  metadata: Record<string, unknown>;
  tasks: TaskId[];
  dependencies: Record<string, string[]>;
}

/**
 * Execution status for tasks
 */
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Task execution context
 */
export interface TaskExecution {
  taskId: TaskId;
  workflowId: WorkflowId;
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;
  actualDuration?: number;
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    exitCode?: number;
  };
  metadata: {
    retryCount: number;
    timeoutCount: number;
    lastRetryAt?: Date;
    executionId: string;
  };
}

/**
 * Unified lifecycle configuration
 */
export interface UnifiedLifecycleConfig {
  // Task lifecycle settings
  enableTaskAutomation: boolean;
  taskTransitionTimeout: number;
  maxTaskRetries: number;
  enableStateHistory: boolean;
  enableDependencyTracking: boolean;
  
  // Service lifecycle settings
  serviceStartupTimeout: number;
  serviceShutdownTimeout: number;
  enableServiceHealthChecks: boolean;
  
  // Workflow state settings
  enableWorkflowPersistence: boolean;
  workflowStateBackupInterval: number;
  maxWorkflowHistory: number;
  
  // Execution settings
  maxConcurrentExecutions: number;
  executionTimeout: number;
  enableExecutionMetrics: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: UnifiedLifecycleConfig = {
  enableTaskAutomation: true,
  taskTransitionTimeout: 30000,
  maxTaskRetries: 3,
  enableStateHistory: true,
  enableDependencyTracking: true,
  serviceStartupTimeout: 60000,
  serviceShutdownTimeout: 30000,
  enableServiceHealthChecks: true,
  enableWorkflowPersistence: true,
  workflowStateBackupInterval: 300000, // 5 minutes
  maxWorkflowHistory: 100,
  maxConcurrentExecutions: 10,
  executionTimeout: 300000, // 5 minutes
  enableExecutionMetrics: true
};

/**
 * Valid task status transitions
 */
const VALID_TRANSITIONS: Map<TaskStatus, TaskStatus[]> = new Map([
  ['pending', ['in_progress', 'cancelled', 'blocked']],
  ['in_progress', ['completed', 'failed', 'blocked', 'cancelled']],
  ['blocked', ['in_progress', 'cancelled', 'failed']],
  ['completed', ['cancelled']],
  ['failed', ['pending', 'cancelled']],
  ['cancelled', ['pending']]
]);

/**
 * Unified Lifecycle Manager
 * 
 * Provides comprehensive lifecycle management for tasks, services, workflows,
 * and executions in a single, cohesive service.
 */
export class UnifiedLifecycleManager extends EventEmitter {
  private static instance: UnifiedLifecycleManager | null = null;
  private config: UnifiedLifecycleConfig;
  
  // Task lifecycle state
  private taskTransitions = new Map<string, TaskTransition[]>();
  private taskAutomationInterval?: NodeJS.Timeout;
  
  // Service lifecycle state
  private services = new Map<string, ServiceInstance>();
  private serviceDependencies: ServiceDependency[] = [];
  private startupInProgress = false;
  private shutdownInProgress = false;
  
  // Workflow state management
  private workflows = new Map<WorkflowId, WorkflowState>();
  private workflowBackupInterval?: NodeJS.Timeout;
  
  // Execution management
  private executions = new Map<TaskId, TaskExecution>();
  private executionQueue: TaskId[] = [];
  private runningExecutions = new Set<TaskId>();

  private constructor(config: Partial<UnifiedLifecycleConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupAutomation();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<UnifiedLifecycleConfig>): UnifiedLifecycleManager {
    if (!UnifiedLifecycleManager.instance) {
      UnifiedLifecycleManager.instance = new UnifiedLifecycleManager(config);
    }
    return UnifiedLifecycleManager.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (UnifiedLifecycleManager.instance) {
      UnifiedLifecycleManager.instance.dispose();
    }
    UnifiedLifecycleManager.instance = null;
  }

  // =============================================================================
  // TASK LIFECYCLE MANAGEMENT
  // =============================================================================

  /**
   * Transition a task to a new status
   */
  async transitionTask(
    taskId: string,
    toStatus: TaskStatus,
    options: {
      reason?: string;
      triggeredBy?: string;
      metadata?: Record<string, unknown>;
      isAutomated?: boolean;
    } = {}
  ): Promise<Result<TaskTransition, EnhancedError>> {
    try {
      // Get current task status
      const taskOps = getTaskOperations();
      const taskResult = await taskOps.getTask(taskId);
      
      if (!taskResult.success || !taskResult.data) {
        return createFailure(ErrorFactory.createError(
          'task',
          `Task not found: ${taskId}`,
          createErrorContext('UnifiedLifecycleManager', 'transitionTask')
            .taskId(taskId)
            .build()
        ));
      }

      const task = taskResult.data;
      const fromStatus = task.status;

      // Validate transition
      const validTransitions = VALID_TRANSITIONS.get(fromStatus) || [];
      if (!validTransitions.includes(toStatus)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Invalid transition from ${fromStatus} to ${toStatus}`,
          createErrorContext('UnifiedLifecycleManager', 'transitionTask')
            .taskId(taskId)
            .metadata({ fromStatus, toStatus, validTransitions })
            .build()
        ));
      }

      // Create transition record
      const transition: TaskTransition = {
        taskId,
        fromStatus,
        toStatus,
        timestamp: new Date(),
        reason: options.reason,
        triggeredBy: options.triggeredBy,
        metadata: options.metadata,
        isAutomated: options.isAutomated ?? false
      };

      // Update task status
      const updatedTask = { ...task, status: toStatus };
      await taskOps.updateTask(taskId, updatedTask);

      // Record transition
      if (this.config.enableStateHistory) {
        const transitions = this.taskTransitions.get(taskId) || [];
        transitions.push(transition);
        this.taskTransitions.set(taskId, transitions);
      }

      // Emit transition event
      this.emit('taskTransition', transition);

      logger.info(`Task ${taskId} transitioned from ${fromStatus} to ${toStatus}`, {
        taskId,
        fromStatus,
        toStatus,
        reason: options.reason,
        isAutomated: options.isAutomated
      });

      return createSuccess(transition);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'task',
        `Failed to transition task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedLifecycleManager', 'transitionTask')
          .taskId(taskId)
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }

  /**
   * Get task transition history
   */
  getTaskTransitions(taskId: string): TaskTransition[] {
    return this.taskTransitions.get(taskId) || [];
  }

  // =============================================================================
  // SERVICE LIFECYCLE MANAGEMENT
  // =============================================================================

  /**
   * Register a service for lifecycle management
   */
  registerService(config: Omit<ServiceInstance, 'isStarted' | 'isDisposed'>): void {
    const service: ServiceInstance = {
      ...config,
      isStarted: false,
      isDisposed: false
    };

    this.services.set(config.name, service);
    logger.debug(`Service registered: ${config.name}`);
    this.emit('serviceRegistered', service);
  }

  /**
   * Register service dependencies
   */
  registerServiceDependency(service: string, dependsOn: string[]): void {
    this.serviceDependencies.push({ service, dependsOn });
    logger.debug(`Dependencies registered for ${service}: ${dependsOn.join(', ')}`);
  }

  /**
   * Start all services in dependency order
   */
  async startAllServices(): Promise<Result<void, EnhancedError>> {
    if (this.startupInProgress) {
      return createFailure(ErrorFactory.createError(
        'system',
        'Service startup already in progress',
        createErrorContext('UnifiedLifecycleManager', 'startAllServices').build()
      ));
    }

    if (this.shutdownInProgress) {
      return createFailure(ErrorFactory.createError(
        'system',
        'Service shutdown in progress, cannot start services',
        createErrorContext('UnifiedLifecycleManager', 'startAllServices').build()
      ));
    }

    this.startupInProgress = true;

    try {
      const startOrder = this.calculateStartupOrder();
      logger.info(`Starting services in order: ${startOrder.join(' -> ')}`);

      for (const serviceName of startOrder) {
        const result = await this.startService(serviceName);
        if (!result.success) {
          return result;
        }
      }

      this.emit('allServicesStarted');
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to start services: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedLifecycleManager', 'startAllServices').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    } finally {
      this.startupInProgress = false;
    }
  }

  /**
   * Start a specific service
   */
  private async startService(serviceName: string): Promise<Result<void, EnhancedError>> {
    const service = this.services.get(serviceName);
    if (!service) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Service not found: ${serviceName}`,
        createErrorContext('UnifiedLifecycleManager', 'startService')
          .metadata({ serviceName })
          .build()
      ));
    }

    if (service.isStarted) {
      return createSuccess(undefined);
    }

    try {
      // Call start method if available
      if (service.startMethod && typeof (service.instance as Record<string, unknown>)[service.startMethod] === 'function') {
        await (service.instance as Record<string, () => Promise<void>>)[service.startMethod]();
      }

      service.isStarted = true;
      logger.info(`Service started: ${serviceName}`);
      this.emit('serviceStarted', service);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to start service ${serviceName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedLifecycleManager', 'startService')
          .metadata({ serviceName })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }

  /**
   * Calculate service startup order based on dependencies
   */
  private calculateStartupOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string): void => {
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving service: ${serviceName}`);
      }
      
      if (visited.has(serviceName)) {
        return;
      }

      visiting.add(serviceName);

      // Visit dependencies first
      const deps = this.serviceDependencies.find(d => d.service === serviceName);
      if (deps) {
        for (const dep of deps.dependsOn) {
          // Only visit if the dependency is a registered service
          if (this.services.has(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    // Create a sorted list of services to ensure consistent ordering
    // Services with no dependencies should be visited first
    const serviceNames = Array.from(this.services.keys()).sort();
    
    // First, visit services that have no dependencies
    const servicesWithDeps = new Set(this.serviceDependencies.map(d => d.service));
    const servicesWithoutDeps = serviceNames.filter(name => !servicesWithDeps.has(name));
    
    // Visit services without dependencies first
    for (const serviceName of servicesWithoutDeps) {
      if (!visited.has(serviceName)) {
        visit(serviceName);
      }
    }
    
    // Then visit remaining services (those with dependencies)
    for (const serviceName of serviceNames) {
      if (!visited.has(serviceName)) {
        visit(serviceName);
      }
    }

    return order;
  }

  // =============================================================================
  // WORKFLOW STATE MANAGEMENT
  // =============================================================================

  /**
   * Create a new workflow
   */
  async createWorkflow(
    workflowId: WorkflowId,
    sessionId: SessionId,
    metadata: Record<string, unknown> = {}
  ): Promise<Result<WorkflowState, EnhancedError>> {
    try {
      if (this.workflows.has(workflowId)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Workflow already exists: ${workflowId}`,
          createErrorContext('UnifiedLifecycleManager', 'createWorkflow')
            .metadata({ workflowId })
            .build()
        ));
      }

      const workflow: WorkflowState = {
        workflowId,
        sessionId,
        status: 'initializing',
        phase: 'decomposition',
        startTime: new Date(),
        metadata,
        tasks: [],
        dependencies: {}
      };

      this.workflows.set(workflowId, workflow);
      
      if (this.config.enableWorkflowPersistence) {
        this.persistWorkflowState(workflow);
      }

      this.emit('workflowCreated', workflow);
      logger.info(`Workflow created: ${workflowId}`);

      return createSuccess(workflow);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedLifecycleManager', 'createWorkflow')
          .metadata({ workflowId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }

  /**
   * Update workflow state
   */
  async updateWorkflowState(
    workflowId: WorkflowId,
    updates: Partial<Omit<WorkflowState, 'workflowId'>>
  ): Promise<Result<WorkflowState, EnhancedError>> {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Workflow not found: ${workflowId}`,
          createErrorContext('UnifiedLifecycleManager', 'updateWorkflowState')
            .metadata({ workflowId })
            .build()
        ));
      }

      const updatedWorkflow = { ...workflow, ...updates };
      this.workflows.set(workflowId, updatedWorkflow);

      if (this.config.enableWorkflowPersistence) {
        this.persistWorkflowState(updatedWorkflow);
      }

      this.emit('workflowUpdated', updatedWorkflow);
      logger.debug(`Workflow updated: ${workflowId}`);

      return createSuccess(updatedWorkflow);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to update workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedLifecycleManager', 'updateWorkflowState')
          .metadata({ workflowId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }

  /**
   * Get workflow state
   */
  getWorkflowState(workflowId: WorkflowId): WorkflowState | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Persist workflow state to disk
   */
  private async persistWorkflowState(workflow: WorkflowState): Promise<void> {
    try {
      const outputDir = getVibeTaskManagerOutputDir();
      const workflowDir = path.join(outputDir, 'workflows');
      await fs.ensureDir(workflowDir);

      const filePath = path.join(workflowDir, `${workflow.workflowId}.json`);
      await fs.writeJson(filePath, workflow, { spaces: 2 });
    } catch (error) {
      logger.error(`Failed to persist workflow state: ${workflow.workflowId}`, error);
    }
  }

  // =============================================================================
  // EXECUTION MANAGEMENT
  // =============================================================================

  /**
   * Queue task for execution
   */
  async queueTaskExecution(
    taskId: TaskId,
    workflowId: WorkflowId,
    _metadata: Record<string, unknown> = {}
  ): Promise<Result<TaskExecution, EnhancedError>> {
    try {
      if (this.executions.has(taskId)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Task execution already exists: ${taskId}`,
          createErrorContext('UnifiedLifecycleManager', 'queueTaskExecution')
            .taskId(taskId)
            .build()
        ));
      }

      const execution: TaskExecution = {
        taskId,
        workflowId,
        status: 'queued',
        startTime: new Date(),
        metadata: {
          retryCount: 0,
          timeoutCount: 0,
          executionId: `exec-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
        }
      };

      this.executions.set(taskId, execution);
      this.executionQueue.push(taskId);

      this.emit('taskQueued', execution);
      logger.debug(`Task queued for execution: ${taskId}`);

      // Process queue (only if not in test mode)
      if (process.env.NODE_ENV !== 'test') {
        void this.processExecutionQueue();
      }

      return createSuccess(execution);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to queue task execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedLifecycleManager', 'queueTaskExecution')
          .taskId(taskId)
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }

  /**
   * Process execution queue
   */
  private async processExecutionQueue(): Promise<void> {
    while (
      this.executionQueue.length > 0 && 
      this.runningExecutions.size < this.config.maxConcurrentExecutions
    ) {
      const taskId = this.executionQueue.shift();
      if (taskId) {
        this.executeTask(taskId);
      }
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(taskId: TaskId): Promise<void> {
    const execution = this.executions.get(taskId);
    if (!execution) {
      logger.error(`Execution not found for task: ${taskId}`);
      return;
    }

    this.runningExecutions.add(taskId);
    execution.status = 'running';
    execution.startTime = new Date();

    this.emit('taskExecutionStarted', execution);

    try {
      // Transition task to in_progress
      await this.transitionTask(taskId, 'in_progress', {
        reason: 'Task execution started',
        triggeredBy: 'UnifiedLifecycleManager',
        isAutomated: true
      });

      // TODO: Actual task execution logic would go here
      // For now, simulate execution
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mark as completed
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.actualDuration = (execution.endTime.getTime() - execution.startTime.getTime()) / 1000 / 3600;
      execution.result = {
        success: true,
        output: 'Task completed successfully'
      };

      await this.transitionTask(taskId, 'completed', {
        reason: 'Task execution completed',
        triggeredBy: 'UnifiedLifecycleManager',
        isAutomated: true
      });

      this.emit('taskExecutionCompleted', execution);
      logger.info(`Task execution completed: ${taskId}`);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      await this.transitionTask(taskId, 'failed', {
        reason: 'Task execution failed',
        triggeredBy: 'UnifiedLifecycleManager',
        isAutomated: true,
        metadata: { error: execution.result.error }
      });

      this.emit('taskExecutionFailed', execution);
      logger.error(`Task execution failed: ${taskId}`, error);
    } finally {
      this.runningExecutions.delete(taskId);
      // Process next tasks in queue
      this.processExecutionQueue();
    }
  }

  // =============================================================================
  // AUTOMATION AND CLEANUP
  // =============================================================================

  /**
   * Setup automation intervals
   */
  private setupAutomation(): void {
    if (this.config.enableTaskAutomation) {
      this.taskAutomationInterval = setInterval(() => {
        this.processTaskAutomation();
      }, 5000); // Check every 5 seconds
    }

    if (this.config.enableWorkflowPersistence) {
      this.workflowBackupInterval = setInterval(() => {
        this.backupWorkflowStates();
      }, this.config.workflowStateBackupInterval);
    }
  }

  /**
   * Process task automation
   */
  private async processTaskAutomation(): Promise<void> {
    // TODO: Implement task automation logic
    // This would handle automatic task transitions based on dependencies,
    // timeouts, and other conditions
  }

  /**
   * Backup workflow states
   */
  private async backupWorkflowStates(): Promise<void> {
    for (const workflow of this.workflows.values()) {
      await this.persistWorkflowState(workflow);
    }
  }

  /**
   * Dispose of the lifecycle manager
   */
  dispose(): void {
    if (this.taskAutomationInterval) {
      clearInterval(this.taskAutomationInterval);
    }

    if (this.workflowBackupInterval) {
      clearInterval(this.workflowBackupInterval);
    }

    this.removeAllListeners();
    this.taskTransitions.clear();
    this.services.clear();
    this.workflows.clear();
    this.executions.clear();
    this.executionQueue.length = 0;
    this.runningExecutions.clear();

    logger.debug('UnifiedLifecycleManager disposed');
  }
}

/**
 * Convenience function to get the unified lifecycle manager instance
 */
export function getUnifiedLifecycleManager(config?: Partial<UnifiedLifecycleConfig>): UnifiedLifecycleManager {
  return UnifiedLifecycleManager.getInstance(config);
}