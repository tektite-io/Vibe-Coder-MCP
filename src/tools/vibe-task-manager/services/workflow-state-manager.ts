/**
 * Workflow State Manager for Decomposition → Orchestration → Execution Flow
 * 
 * Provides comprehensive state tracking, transitions, and persistence for the
 * complete workflow lifecycle with proper state validation and recovery.
 */

import path from 'path';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import logger from '../../../logger.js';
import { FileUtils } from '../utils/file-utils.js';
import { createErrorContext } from '../utils/enhanced-errors.js';
import { getVibeTaskManagerOutputDir } from '../utils/config-loader.js';

/**
 * Branded types for domain-specific type safety
 */
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type ProjectId = string & { readonly __brand: 'ProjectId' };

/**
 * Factory functions for branded type construction with validation
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
 * Result type for explicit error handling without undefined returns
 */
export type Result<T, E = Error> = {
  readonly success: true;
  readonly data: T;
} | {
  readonly success: false;
  readonly error: E;
};

/**
 * Helper functions for Result type construction
 */
export function createSuccess<T, E = Error>(data: T): Result<T, E> {
  return { success: true, data };
}

export function createFailure<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Type-safe ID resolution result
 */
export interface IdResolutionResult {
  readonly workflowId: WorkflowId | null;
  readonly sessionId: SessionId | null;
  readonly taskId: TaskId | null;
  readonly source: 'workflowId' | 'sessionId' | 'taskId' | 'none';
}

/**
 * Minimal interface for ID resolution - compatible with any progress event data
 */
export interface IdResolvable {
  readonly taskId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * Centralized ID resolution utility following ProgressJobBridge pattern
 * Ensures consistent workflow lookup across all services
 */
export function resolveWorkflowId(data: IdResolvable): Result<WorkflowId, string> {
  try {
    // Follow the existing ProgressJobBridge.extractJobId() priority order
    const metadata = data.metadata as { jobId?: string; sessionId?: string } | undefined;
    const resolvedId = (
      metadata?.jobId ||
      metadata?.sessionId ||
      data.taskId ||
      null
    );

    if (!resolvedId || resolvedId.trim().length === 0) {
      return createFailure<string>('No valid ID found in progress event data');
    }

    // Create and return workflow ID with validation
    const workflowId = createWorkflowId(resolvedId.trim());
    return createSuccess<WorkflowId, string>(workflowId);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during ID resolution';
    return createFailure<string>(`Failed to resolve workflow ID: ${errorMessage}`);
  }
}

/**
 * ID mapping utility for handling subtask-to-parent workflow resolution
 * Supports RDD engine subtask patterns like task-123-atomic-01, task-123-plan-01, etc.
 */
export function mapSubtaskToParentWorkflowId(taskId: string): string {
  // Handle RDD engine subtask patterns: task-{timestamp}-{type}-{number}
  // Examples: task-1751860355315-atomic-01 -> task-1751860355315
  //          task-1751860355315-plan-01 -> task-1751860355315
  //          task-1751860355315-impl-02 -> task-1751860355315
  
  const rddSubtaskPattern = /^(task-\d+)-(?:atomic|plan|impl)-\d+$/;
  const match = taskId.match(rddSubtaskPattern);
  
  if (match) {
    const parentId = match[1];
    logger.debug({
      originalTaskId: taskId,
      parentTaskId: parentId,
      pattern: 'rdd_subtask',
      matchType: 'RDD engine subtask'
    }, 'Mapped RDD subtask to parent task ID');
    
    return parentId;
  }
  
  // Handle other potential subtask patterns in the future
  // Pattern: any-id-suffix-number -> any-id
  const genericSubtaskPattern = /^(.+)-[a-zA-Z]+-\d+$/;
  const genericMatch = taskId.match(genericSubtaskPattern);
  
  if (genericMatch) {
    const parentId = genericMatch[1];
    logger.debug({
      originalTaskId: taskId,
      parentTaskId: parentId,
      pattern: 'generic_subtask',
      matchType: 'Generic subtask pattern'
    }, 'Mapped generic subtask to parent task ID');
    
    return parentId;
  }
  
  // If no subtask pattern detected, return the original ID
  logger.debug({
    taskId: taskId,
    pattern: 'no_mapping',
    matchType: 'Direct task ID (no mapping needed)'
  }, 'No subtask pattern detected, using original task ID');
  
  return taskId;
}

/**
 * Enhanced workflow ID resolution with subtask-to-parent mapping
 * Handles both direct workflow IDs and subtask IDs that need parent mapping
 */
export function resolveWorkflowIdWithMapping(data: IdResolvable): Result<WorkflowId, string> {
  try {
    // Log resolution attempt for debugging
    logger.debug({
      dataKeys: Object.keys(data),
      taskId: data.taskId,
      metadataJobId: data.metadata?.jobId,
      metadataSessionId: data.metadata?.sessionId
    }, 'Starting enhanced workflow ID resolution');

    // First attempt standard resolution
    const standardResult = resolveWorkflowId(data);
    if (standardResult.success) {
      const workflowId = standardResult.data;
      
      // Check if this is a subtask ID that needs parent mapping
      const mappedId = mapSubtaskToParentWorkflowId(workflowId);
      
      if (mappedId !== workflowId) {
        // This was a subtask ID, return the mapped parent ID
        logger.debug({
          originalWorkflowId: workflowId,
          mappedWorkflowId: mappedId,
          resolution: 'subtask_mapped_to_parent'
        }, 'Successfully mapped subtask ID to parent workflow ID');
        
        return createSuccess<WorkflowId, string>(createWorkflowId(mappedId));
      }
      
      // This was already a parent ID, return as-is
      logger.debug({
        workflowId: workflowId,
        resolution: 'direct_workflow_id'
      }, 'Successfully resolved direct workflow ID');
      
      return standardResult;
    }
    
    // Standard resolution failed, return the failure
    logger.debug({
      error: standardResult.error,
      resolution: 'failed'
    }, 'Enhanced workflow ID resolution failed');
    
    return standardResult;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during enhanced ID resolution';
    logger.error({
      err: error,
      dataKeys: Object.keys(data),
      taskId: data.taskId
    }, 'Exception during enhanced workflow ID resolution');
    
    return createFailure<string>(`Failed to resolve workflow ID with mapping: ${errorMessage}`);
  }
}

/**
 * Workflow phases in the decomposition → orchestration → execution flow
 */
export enum WorkflowPhase {
  INITIALIZATION = 'initialization',
  DECOMPOSITION = 'decomposition', 
  ORCHESTRATION = 'orchestration',
  EXECUTION = 'execution',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Workflow state for each phase
 */
export enum WorkflowState {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  BLOCKED = 'blocked',
  RETRYING = 'retrying'
}

/**
 * Workflow transition metadata
 */
export interface WorkflowTransition {
  fromPhase: WorkflowPhase;
  fromState: WorkflowState;
  toPhase: WorkflowPhase;
  toState: WorkflowState;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, unknown>;
  triggeredBy?: string;
}

/**
 * Phase execution details
 */
export interface PhaseExecution {
  phase: WorkflowPhase;
  state: WorkflowState;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  progress: number; // 0-100
  error?: string;
  metadata: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  subPhases?: Map<string, SubPhaseExecution>; // Enhanced with sub-phase tracking
}

/**
 * Sub-phase execution details within a workflow phase
 */
export interface SubPhaseExecution {
  subPhase: string;
  parentPhase: WorkflowPhase;
  state: WorkflowState;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  progress: number; // 0-100
  weight: number; // Weight contribution to parent phase (0-1)
  order: number; // Execution order within parent phase
  metadata: Record<string, unknown>;
  error?: string;
}

/**
 * Sub-phase mapping for each workflow phase
 */
export const SUB_PHASES: Record<WorkflowPhase, Array<{ name: string; weight: number; order: number }>> = {
  [WorkflowPhase.INITIALIZATION]: [
    { name: 'setup', weight: 0.4, order: 1 },
    { name: 'validation', weight: 0.3, order: 2 },
    { name: 'preparation', weight: 0.3, order: 3 }
  ],
  [WorkflowPhase.DECOMPOSITION]: [
    { name: 'research', weight: 0.2, order: 1 },
    { name: 'context_gathering', weight: 0.25, order: 2 },
    { name: 'decomposition', weight: 0.3, order: 3 },
    { name: 'validation', weight: 0.15, order: 4 },
    { name: 'dependency_detection', weight: 0.1, order: 5 }
  ],
  [WorkflowPhase.ORCHESTRATION]: [
    { name: 'task_preparation', weight: 0.4, order: 1 },
    { name: 'dependency_resolution', weight: 0.3, order: 2 },
    { name: 'agent_assignment', weight: 0.3, order: 3 }
  ],
  [WorkflowPhase.EXECUTION]: [
    { name: 'task_execution', weight: 0.7, order: 1 },
    { name: 'monitoring', weight: 0.2, order: 2 },
    { name: 'completion_verification', weight: 0.1, order: 3 }
  ],
  [WorkflowPhase.COMPLETED]: [],
  [WorkflowPhase.FAILED]: [],
  [WorkflowPhase.CANCELLED]: []
};

/**
 * Complete workflow state
 */
export interface WorkflowStateSnapshot {
  workflowId: string;
  sessionId: string;
  projectId: string;
  currentPhase: WorkflowPhase;
  currentState: WorkflowState;
  overallProgress: number; // 0-100
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;
  
  // Phase tracking
  phases: Map<WorkflowPhase, PhaseExecution>;
  transitions: WorkflowTransition[];
  
  // Workflow metadata
  metadata: {
    taskCount?: number;
    epicCount?: number;
    agentCount?: number;
    dependencyCount?: number;
    [key: string]: unknown;
  };
  
  // Persistence info
  persistedAt: Date;
  version: string;
}

/**
 * Workflow state change event
 */
export interface WorkflowStateChangeEvent {
  workflowId: string;
  sessionId: string;
  projectId: string;
  transition: WorkflowTransition;
  snapshot: WorkflowStateSnapshot;
}

/**
 * Valid workflow transitions
 */
const VALID_TRANSITIONS: Map<string, Set<string>> = new Map([
  // From INITIALIZATION
  [`${WorkflowPhase.INITIALIZATION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.INITIALIZATION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.COMPLETED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.PENDING}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.INITIALIZATION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.INITIALIZATION}:${WorkflowState.COMPLETED}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.PENDING}`
  ])],
  
  // From DECOMPOSITION
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.COMPLETED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.CANCELLED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.RETRYING}`
  ])],
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.COMPLETED}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.PENDING}`
  ])],
  [`${WorkflowPhase.DECOMPOSITION}:${WorkflowState.RETRYING}`, new Set([
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.DECOMPOSITION}:${WorkflowState.CANCELLED}`
  ])],
  
  // From ORCHESTRATION
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.COMPLETED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.CANCELLED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.RETRYING}`
  ])],
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.COMPLETED}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.PENDING}`
  ])],
  [`${WorkflowPhase.ORCHESTRATION}:${WorkflowState.RETRYING}`, new Set([
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.ORCHESTRATION}:${WorkflowState.CANCELLED}`
  ])],
  
  // From EXECUTION
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.PENDING}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.CANCELLED}`
  ])],
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.IN_PROGRESS}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.COMPLETED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.CANCELLED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.RETRYING}`
  ])],
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.COMPLETED}`, new Set([
    `${WorkflowPhase.COMPLETED}:${WorkflowState.COMPLETED}`
  ])],
  [`${WorkflowPhase.EXECUTION}:${WorkflowState.RETRYING}`, new Set([
    `${WorkflowPhase.EXECUTION}:${WorkflowState.IN_PROGRESS}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.FAILED}`,
    `${WorkflowPhase.EXECUTION}:${WorkflowState.CANCELLED}`
  ])]
]);

/**
 * Workflow State Manager
 */
export class WorkflowStateManager extends EventEmitter {
  private static instance: WorkflowStateManager | null = null;
  private workflows: Map<string, WorkflowStateSnapshot> = new Map();
  private persistenceEnabled: boolean = true;
  private persistenceDirectory: string;
  private readonly version = '1.0.0';

  constructor(persistenceDirectory?: string) {
    super();
    // Use absolute path by default instead of relative path
    this.persistenceDirectory = persistenceDirectory ||
      path.join(getVibeTaskManagerOutputDir(), 'workflow-states');
  }

  /**
   * Get singleton instance
   */
  static getInstance(persistenceDirectory?: string): WorkflowStateManager {
    if (!WorkflowStateManager.instance) {
      WorkflowStateManager.instance = new WorkflowStateManager(persistenceDirectory);
    }
    return WorkflowStateManager.instance;
  }

  /**
   * Initialize a new workflow
   */
  async initializeWorkflow(
    workflowId: string,
    sessionId: string,
    projectId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<WorkflowStateSnapshot> {
    const context = createErrorContext('WorkflowStateManager', 'initializeWorkflow')
      .sessionId(sessionId)
      .projectId(projectId)
      .metadata({ workflowId })
      .build();

    try {
      const now = new Date();
      
      const initialPhase: PhaseExecution = {
        phase: WorkflowPhase.INITIALIZATION,
        state: WorkflowState.PENDING,
        startTime: now,
        progress: 0,
        metadata: {},
        retryCount: 0,
        maxRetries: 3
      };

      const workflow: WorkflowStateSnapshot = {
        workflowId,
        sessionId,
        projectId,
        currentPhase: WorkflowPhase.INITIALIZATION,
        currentState: WorkflowState.PENDING,
        overallProgress: 0,
        startTime: now,
        phases: new Map([[WorkflowPhase.INITIALIZATION, initialPhase]]),
        transitions: [],
        metadata,
        persistedAt: now,
        version: this.version
      };

      this.workflows.set(workflowId, workflow);
      
      if (this.persistenceEnabled) {
        await this.persistWorkflow(workflow);
      }

      logger.info({
        workflowId,
        sessionId,
        projectId,
        phase: WorkflowPhase.INITIALIZATION,
        state: WorkflowState.PENDING
      }, 'Workflow initialized');

      this.emit('workflow:initialized', { workflowId, sessionId, projectId, snapshot: workflow });
      
      return workflow;

    } catch (error) {
      logger.error({ err: error, ...context }, 'Failed to initialize workflow');
      throw error;
    }
  }

  /**
   * Transition workflow to a new phase and state
   */
  async transitionWorkflow(
    workflowId: string,
    toPhase: WorkflowPhase,
    toState: WorkflowState,
    options: {
      reason?: string;
      metadata?: Record<string, unknown>;
      triggeredBy?: string;
      progress?: number;
    } = {}
  ): Promise<WorkflowStateSnapshot> {
    const context = createErrorContext('WorkflowStateManager', 'transitionWorkflow')
      .metadata({ workflowId, toPhase, toState, ...options })
      .build();

    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const fromPhase = workflow.currentPhase;
      const fromState = workflow.currentState;

      // Validate transition
      const isValidTransition = this.validateTransition(fromPhase, fromState, toPhase, toState);
      if (!isValidTransition) {
        throw new Error(
          `Invalid transition from ${fromPhase}:${fromState} to ${toPhase}:${toState}`
        );
      }

      const now = new Date();

      // Create transition record
      const transition: WorkflowTransition = {
        fromPhase,
        fromState,
        toPhase,
        toState,
        timestamp: now,
        reason: options.reason,
        metadata: options.metadata,
        triggeredBy: options.triggeredBy
      };

      // Update current phase execution if completing
      if (workflow.phases.has(fromPhase)) {
        const currentPhaseExecution = workflow.phases.get(fromPhase)!;
        if (toState === WorkflowState.COMPLETED || toState === WorkflowState.FAILED) {
          currentPhaseExecution.endTime = now;
          currentPhaseExecution.duration = now.getTime() - currentPhaseExecution.startTime.getTime();
          currentPhaseExecution.state = toState;
          if (options.progress !== undefined) {
            currentPhaseExecution.progress = options.progress;
          }
        }
      }

      // Create new phase execution if transitioning to new phase
      if (toPhase !== fromPhase) {
        const newPhaseExecution: PhaseExecution = {
          phase: toPhase,
          state: toState,
          startTime: now,
          progress: options.progress || 0,
          metadata: options.metadata || {},
          retryCount: 0,
          maxRetries: 3
        };
        workflow.phases.set(toPhase, newPhaseExecution);
      } else {
        // Update existing phase execution
        const phaseExecution = workflow.phases.get(toPhase)!;
        phaseExecution.state = toState;
        if (options.progress !== undefined) {
          phaseExecution.progress = options.progress;
        }
        if (options.metadata) {
          phaseExecution.metadata = { ...phaseExecution.metadata, ...options.metadata };
        }
      }

      // Update workflow state
      workflow.currentPhase = toPhase;
      workflow.currentState = toState;
      workflow.transitions.push(transition);
      workflow.persistedAt = now;

      // Calculate overall progress
      workflow.overallProgress = this.calculateOverallProgress(workflow);

      // Mark workflow as completed if in final state
      if (toPhase === WorkflowPhase.COMPLETED || toPhase === WorkflowPhase.FAILED) {
        workflow.endTime = now;
        workflow.totalDuration = now.getTime() - workflow.startTime.getTime();
      }

      // Persist workflow state
      if (this.persistenceEnabled) {
        await this.persistWorkflow(workflow);
      }

      logger.info({
        workflowId,
        fromPhase,
        fromState,
        toPhase,
        toState,
        progress: workflow.overallProgress,
        reason: options.reason
      }, 'Workflow transitioned');

      // Emit state change event
      const stateChangeEvent: WorkflowStateChangeEvent = {
        workflowId,
        sessionId: workflow.sessionId,
        projectId: workflow.projectId,
        transition,
        snapshot: workflow
      };

      this.emit('workflow:state-changed', stateChangeEvent);
      this.emit(`workflow:${toPhase}:${toState}`, stateChangeEvent);

      return workflow;

    } catch (error) {
      logger.error({ err: error, ...context }, 'Failed to transition workflow');
      throw error;
    }
  }

  /**
   * Update phase progress
   */
  async updatePhaseProgress(
    workflowId: string,
    phase: WorkflowPhase,
    progress: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const phaseExecution = workflow.phases.get(phase);
    if (!phaseExecution) {
      throw new Error(`Phase ${phase} not found in workflow ${workflowId}`);
    }

    phaseExecution.progress = Math.max(0, Math.min(100, progress));
    if (metadata) {
      phaseExecution.metadata = { ...phaseExecution.metadata, ...metadata };
    }

    // Update overall progress
    workflow.overallProgress = this.calculateOverallProgress(workflow);
    workflow.persistedAt = new Date();

    // Persist if enabled
    if (this.persistenceEnabled) {
      await this.persistWorkflow(workflow);
    }

    logger.debug({
      workflowId,
      phase,
      progress,
      overallProgress: workflow.overallProgress
    }, 'Phase progress updated');

    this.emit('workflow:progress-updated', {
      workflowId,
      sessionId: workflow.sessionId,
      projectId: workflow.projectId,
      phase,
      progress,
      overallProgress: workflow.overallProgress
    });
  }

  /**
   * Initialize sub-phases for a workflow phase
   */
  initializeSubPhases(workflowId: string, phase: WorkflowPhase): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const phaseExecution = workflow.phases.get(phase);
    if (!phaseExecution) {
      throw new Error(`Phase ${phase} not found in workflow ${workflowId}`);
    }

    // Initialize sub-phases if they don't exist
    if (!phaseExecution.subPhases) {
      phaseExecution.subPhases = new Map();
    }

    const subPhaseDefinitions = SUB_PHASES[phase];
    for (const subPhaseDef of subPhaseDefinitions) {
      if (!phaseExecution.subPhases.has(subPhaseDef.name)) {
        phaseExecution.subPhases.set(subPhaseDef.name, {
          subPhase: subPhaseDef.name,
          parentPhase: phase,
          state: WorkflowState.PENDING,
          startTime: new Date(),
          progress: 0,
          weight: subPhaseDef.weight,
          order: subPhaseDef.order,
          metadata: {}
        });
      }
    }

    logger.debug({
      workflowId,
      phase,
      subPhaseCount: subPhaseDefinitions.length
    }, 'Sub-phases initialized for phase');
  }

  /**
   * Update sub-phase progress and calculate parent phase progress
   * Returns Result type for graceful error handling
   */
  async updateSubPhaseProgress(
    workflowId: string,
    phase: WorkflowPhase,
    subPhase: string,
    progress: number,
    state?: WorkflowState,
    metadata?: Record<string, unknown>
  ): Promise<Result<void, string>> {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        return createFailure<string>(`Workflow ${workflowId} not found`);
      }

      const phaseExecution = workflow.phases.get(phase);
      if (!phaseExecution) {
        return createFailure<string>(`Phase ${phase} not found in workflow ${workflowId}`);
      }

      // Initialize sub-phases if not already done
      this.initializeSubPhases(workflowId, phase);

      const subPhaseExecution = phaseExecution.subPhases!.get(subPhase);
      if (!subPhaseExecution) {
        return createFailure<string>(`Sub-phase ${subPhase} not found in phase ${phase} for workflow ${workflowId}`);
      }

      // Update sub-phase
      subPhaseExecution.progress = Math.max(0, Math.min(100, progress));
      if (state) {
        subPhaseExecution.state = state;
      }
      if (metadata) {
        subPhaseExecution.metadata = { ...subPhaseExecution.metadata, ...metadata };
      }

      // Mark as completed if progress is 100%
      if (progress >= 100 && subPhaseExecution.state !== WorkflowState.COMPLETED) {
        subPhaseExecution.state = WorkflowState.COMPLETED;
        subPhaseExecution.endTime = new Date();
        subPhaseExecution.duration = subPhaseExecution.endTime.getTime() - subPhaseExecution.startTime.getTime();
      }

      // Calculate weighted progress for parent phase
      const phaseProgress = this.calculatePhaseProgressFromSubPhases(phaseExecution);
      phaseExecution.progress = phaseProgress;

      // Update overall progress
      workflow.overallProgress = this.calculateOverallProgress(workflow);
      workflow.persistedAt = new Date();

      // Persist if enabled
      if (this.persistenceEnabled) {
        await this.persistWorkflow(workflow);
      }

      logger.debug({
        workflowId,
        phase,
        subPhase,
        subPhaseProgress: progress,
        phaseProgress,
        overallProgress: workflow.overallProgress
      }, 'Sub-phase progress updated');

      this.emit('workflow:subphase-updated', {
        workflowId,
        sessionId: workflow.sessionId,
        projectId: workflow.projectId,
        phase,
        subPhase,
        progress,
        phaseProgress,
        overallProgress: workflow.overallProgress
      });

      return createSuccess<void, string>(undefined);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during sub-phase progress update';
      logger.error({
        err: error,
        workflowId,
        phase,
        subPhase,
        progress
      }, 'Failed to update sub-phase progress');
      
      return createFailure<string>(`Failed to update sub-phase progress: ${errorMessage}`);
    }
  }

  /**
   * Calculate phase progress from sub-phases using weighted average
   */
  private calculatePhaseProgressFromSubPhases(phaseExecution: PhaseExecution): number {
    if (!phaseExecution.subPhases || phaseExecution.subPhases.size === 0) {
      return phaseExecution.progress; // Return existing progress if no sub-phases
    }

    let weightedProgress = 0;
    let totalWeight = 0;

    for (const subPhase of phaseExecution.subPhases.values()) {
      weightedProgress += subPhase.progress * subPhase.weight;
      totalWeight += subPhase.weight;
    }

    return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  }

  /**
   * Get sub-phase status for a workflow phase
   */
  getSubPhaseStatus(workflowId: string, phase: WorkflowPhase): Map<string, SubPhaseExecution> | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return null;
    }

    const phaseExecution = workflow.phases.get(phase);
    if (!phaseExecution || !phaseExecution.subPhases) {
      return null;
    }

    return new Map(phaseExecution.subPhases);
  }

  /**
   * Start a sub-phase (transition from PENDING to IN_PROGRESS)
   */
  async startSubPhase(
    workflowId: string,
    phase: WorkflowPhase,
    subPhase: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.updateSubPhaseProgress(
      workflowId,
      phase,
      subPhase,
      0,
      WorkflowState.IN_PROGRESS,
      metadata
    );

    logger.info({
      workflowId,
      phase,
      subPhase
    }, 'Sub-phase started');
  }

  /**
   * Complete a sub-phase (transition to COMPLETED with 100% progress)
   */
  async completeSubPhase(
    workflowId: string,
    phase: WorkflowPhase,
    subPhase: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.updateSubPhaseProgress(
      workflowId,
      phase,
      subPhase,
      100,
      WorkflowState.COMPLETED,
      metadata
    );

    logger.info({
      workflowId,
      phase,
      subPhase
    }, 'Sub-phase completed');
  }

  /**
   * Get workflow state
   */
  getWorkflow(workflowId: string): WorkflowStateSnapshot | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all workflows for a project
   */
  getProjectWorkflows(projectId: string): WorkflowStateSnapshot[] {
    return Array.from(this.workflows.values()).filter(w => w.projectId === projectId);
  }

  /**
   * Get workflows by session
   */
  getSessionWorkflows(sessionId: string): WorkflowStateSnapshot[] {
    return Array.from(this.workflows.values()).filter(w => w.sessionId === sessionId);
  }

  /**
   * Check if workflow exists
   */
  hasWorkflow(workflowId: string): boolean {
    return this.workflows.has(workflowId);
  }

  /**
   * Check if specific phase exists in workflow
   */
  hasPhase(workflowId: string, phase: WorkflowPhase): boolean {
    const workflow = this.workflows.get(workflowId);
    return workflow ? workflow.phases.has(phase) : false;
  }

  /**
   * Validate workflow transition
   */
  private validateTransition(
    fromPhase: WorkflowPhase,
    fromState: WorkflowState,
    toPhase: WorkflowPhase,
    toState: WorkflowState
  ): boolean {
    const fromKey = `${fromPhase}:${fromState}`;
    const toKey = `${toPhase}:${toState}`;

    const validTransitions = VALID_TRANSITIONS.get(fromKey);
    return validTransitions ? validTransitions.has(toKey) : false;
  }

  /**
   * Calculate overall workflow progress
   */
  private calculateOverallProgress(workflow: WorkflowStateSnapshot): number {
    const phaseWeights: Record<WorkflowPhase, number> = {
      [WorkflowPhase.INITIALIZATION]: 5,
      [WorkflowPhase.DECOMPOSITION]: 30,
      [WorkflowPhase.ORCHESTRATION]: 15,
      [WorkflowPhase.EXECUTION]: 45,
      [WorkflowPhase.COMPLETED]: 5,
      [WorkflowPhase.FAILED]: 0,
      [WorkflowPhase.CANCELLED]: 0
    };

    let totalWeight = 0;
    let completedWeight = 0;

    for (const [phase, execution] of workflow.phases) {
      const weight = phaseWeights[phase] || 0;
      totalWeight += weight;

      if (execution.state === WorkflowState.COMPLETED) {
        completedWeight += weight;
      } else if (execution.state === WorkflowState.IN_PROGRESS) {
        completedWeight += (weight * execution.progress) / 100;
      }
    }

    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  }

  /**
   * Persist workflow to file system
   */
  private async persistWorkflow(workflow: WorkflowStateSnapshot): Promise<void> {
    try {
      // Ensure persistence directory exists
      await fs.ensureDir(this.persistenceDirectory);

      // Convert Map to object for serialization
      const workflowToSave = {
        ...workflow,
        phases: Object.fromEntries(workflow.phases),
        persistedAt: new Date()
      };

      const filePath = `${this.persistenceDirectory}/${workflow.workflowId}.json`;
      const saveResult = await FileUtils.writeJsonFile(filePath, workflowToSave);

      if (!saveResult.success) {
        logger.warn({
          workflowId: workflow.workflowId,
          error: saveResult.error
        }, 'Failed to persist workflow state');
      }

    } catch (error) {
      logger.error({
        err: error,
        workflowId: workflow.workflowId
      }, 'Error persisting workflow state');
    }
  }

  /**
   * Load workflow from persistence
   */
  async loadWorkflow(workflowId: string): Promise<WorkflowStateSnapshot | null> {
    try {
      const filePath = `${this.persistenceDirectory}/${workflowId}.json`;
      const loadResult = await FileUtils.readJsonFile<Record<string, unknown>>(filePath);

      if (!loadResult.success) {
        return null;
      }

      const workflowData = loadResult.data;

      // Validate and convert phases object back to Map
      if (!workflowData || typeof workflowData !== 'object') {
        logger.warn({ workflowId }, 'Invalid workflow data structure');
        return null;
      }

      const phases = workflowData.phases && typeof workflowData.phases === 'object'
        ? new Map(Object.entries(workflowData.phases as Record<string, unknown>))
        : new Map();

      const startTime = typeof workflowData.startTime === 'string' || typeof workflowData.startTime === 'number'
        ? new Date(workflowData.startTime)
        : new Date();

      const endTime = workflowData.endTime && (typeof workflowData.endTime === 'string' || typeof workflowData.endTime === 'number')
        ? new Date(workflowData.endTime)
        : undefined;

      const persistedAt = typeof workflowData.persistedAt === 'string' || typeof workflowData.persistedAt === 'number'
        ? new Date(workflowData.persistedAt)
        : new Date();

      const transitions = Array.isArray(workflowData.transitions)
        ? workflowData.transitions.map((t: unknown) => {
            const transition = t as Record<string, unknown>;
            return {
              ...transition,
              timestamp: typeof transition.timestamp === 'string' || typeof transition.timestamp === 'number'
                ? new Date(transition.timestamp)
                : new Date()
            };
          })
        : [];

      const workflow: WorkflowStateSnapshot = {
        ...workflowData,
        phases,
        startTime,
        endTime,
        persistedAt,
        transitions
      } as WorkflowStateSnapshot;

      this.workflows.set(workflowId, workflow);
      return workflow;

    } catch (error) {
      logger.error({ err: error, workflowId }, 'Failed to load workflow from persistence');
      return null;
    }
  }

  /**
   * Clean up completed workflows older than specified days
   */
  async cleanupOldWorkflows(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleanedCount = 0;

    for (const [workflowId, workflow] of this.workflows) {
      if (workflow.endTime && workflow.endTime < cutoffDate) {
        this.workflows.delete(workflowId);

        // Remove persisted file
        try {
          const filePath = `${this.persistenceDirectory}/${workflowId}.json`;
          await fs.remove(filePath);
          cleanedCount++;
        } catch (error) {
          logger.warn({ err: error, workflowId }, 'Failed to remove persisted workflow file');
        }
      }
    }

    logger.info({ cleanedCount, olderThanDays }, 'Workflow cleanup completed');
    return cleanedCount;
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(): {
    total: number;
    byPhase: Record<WorkflowPhase, number>;
    byState: Record<WorkflowState, number>;
    averageDuration: number;
    completionRate: number;
  } {
    const workflows = Array.from(this.workflows.values());
    const total = workflows.length;

    const byPhase: Record<WorkflowPhase, number> = {} as Record<WorkflowPhase, number>;
    const byState: Record<WorkflowState, number> = {} as Record<WorkflowState, number>;

    let totalDuration = 0;
    let completedCount = 0;
    let durationCount = 0;

    for (const workflow of workflows) {
      // Count by current phase
      byPhase[workflow.currentPhase] = (byPhase[workflow.currentPhase] || 0) + 1;

      // Count by current state
      byState[workflow.currentState] = (byState[workflow.currentState] || 0) + 1;

      // Calculate durations and completion rate
      if (workflow.totalDuration) {
        totalDuration += workflow.totalDuration;
        durationCount++;
      }

      if (workflow.currentPhase === WorkflowPhase.COMPLETED) {
        completedCount++;
      }
    }

    return {
      total,
      byPhase,
      byState,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      completionRate: total > 0 ? (completedCount / total) * 100 : 0
    };
  }
}
