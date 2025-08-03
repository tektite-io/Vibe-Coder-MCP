/**
 * Unified Orchestration Engine
 * 
 * Consolidates 8 agent/workflow orchestration services into a single, comprehensive engine:
 * - agent-orchestrator.ts: Agent communication and coordination
 * - workflow-aware-agent-manager.ts: Workflow-aware agent lifecycle management
 * - workflow-state-manager.ts: Workflow state tracking and transitions
 * - intelligent-agent-assignment.ts: Intelligent workload distribution
 * - agent-integration-bridge.ts: Agent integration bridge
 * - execution-coordinator.ts: Execution coordination
 * - execution-watchdog.ts: Execution monitoring and watchdog
 * - task-scheduler.ts: Task scheduling
 * 
 * This unified engine provides:
 * - Centralized agent lifecycle management
 * - Intelligent workflow orchestration
 * - Advanced task scheduling and assignment
 * - Real-time execution monitoring and coordination
 * - Workflow state management and persistence
 * - Agent capability-based assignment
 * - Performance-aware workload distribution
 * - Comprehensive execution watchdog and recovery
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import {
  EnhancedError,
  ErrorFactory,
  createErrorContext
} from '../utils/enhanced-errors.js';
import { Result, createSuccess, createFailure } from './unified-lifecycle-manager.js';
import { AtomicTask, TaskPriority } from '../types/task.js';
import { getVibeTaskManagerOutputDir } from '../utils/config-loader.js';
import logger from '../../../logger.js';

// =============================================================================
// BRANDED TYPES FOR TYPE SAFETY
// =============================================================================

export type OrchestrationId = string & { readonly __brand: 'OrchestrationId' };
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };
export type AgentId = string & { readonly __brand: 'AgentId' };
export type ExecutionId = string & { readonly __brand: 'ExecutionId' };
export type ScheduleId = string & { readonly __brand: 'ScheduleId' };

export function createOrchestrationId(id: string): OrchestrationId {
  if (!id || id.trim().length === 0) {
    throw new Error('Orchestration ID cannot be empty');
  }
  return id as OrchestrationId;
}

export function createWorkflowId(id: string): WorkflowId {
  if (!id || id.trim().length === 0) {
    throw new Error('Workflow ID cannot be empty');
  }
  return id as WorkflowId;
}

export function createAgentId(id: string): AgentId {
  if (!id || id.trim().length === 0) {
    throw new Error('Agent ID cannot be empty');
  }
  return id as AgentId;
}

export function createExecutionId(id: string): ExecutionId {
  if (!id || id.trim().length === 0) {
    throw new Error('Execution ID cannot be empty');
  }
  return id as ExecutionId;
}

export function createScheduleId(id: string): ScheduleId {
  if (!id || id.trim().length === 0) {
    throw new Error('Schedule ID cannot be empty');
  }
  return id as ScheduleId;
}

// =============================================================================
// CORE TYPES AND INTERFACES
// =============================================================================

/**
 * Agent status types
 */
export type AgentStatus = 'online' | 'offline' | 'busy' | 'idle' | 'error' | 'maintenance';

/**
 * Agent capability types
 */
export type AgentCapability = 
  | 'task_execution' | 'code_generation' | 'testing' | 'documentation'
  | 'research' | 'analysis' | 'deployment' | 'monitoring' | 'debugging';

/**
 * Workflow phase types
 */
export type WorkflowPhase = 
  | 'initialization' | 'decomposition' | 'planning' | 'assignment'
  | 'execution' | 'monitoring' | 'validation' | 'completion' | 'error_recovery';

/**
 * Task assignment strategy
 */
export type AssignmentStrategy = 
  | 'round_robin' | 'least_loaded' | 'capability_first' 
  | 'performance_based' | 'intelligent_hybrid';

/**
 * Execution status types
 */
export type ExecutionStatus = 
  | 'pending' | 'scheduled' | 'running' | 'paused' | 'completed' 
  | 'failed' | 'cancelled' | 'timeout' | 'error';

/**
 * Agent information
 */
export interface AgentInfo {
  id: AgentId;
  name: string;
  status: AgentStatus;
  capabilities: AgentCapability[];
  currentLoad: number; // 0-1
  maxConcurrentTasks: number;
  currentTasks: string[];
  performance: {
    averageTaskTime: number;
    successRate: number;
    errorRate: number;
    lastActivity: Date;
  };
  metadata: {
    version: string;
    endpoint?: string;
    heartbeatInterval: number;
    lastHeartbeat: Date;
    registeredAt: Date;
  };
}

/**
 * Workflow state information
 */
export interface WorkflowState {
  id: WorkflowId;
  phase: WorkflowPhase;
  status: ExecutionStatus;
  projectId: string;
  sessionId: string;
  tasks: string[];
  assignedAgents: AgentId[];
  startTime: Date;
  endTime?: Date;
  progress: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    percentage: number;
  };
  metadata: {
    initiator: string;
    priority: TaskPriority;
    estimatedDuration: number;
    actualDuration?: number;
  };
}

/**
 * Task assignment information
 */
export interface TaskAssignment {
  id: string;
  taskId: string;
  agentId: AgentId;
  workflowId: WorkflowId;
  assignedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: ExecutionStatus;
  priority: TaskPriority;
  estimatedDuration: number;
  actualDuration?: number;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
}

/**
 * Execution context
 */
export interface ExecutionContext {
  id: ExecutionId;
  workflowId: WorkflowId;
  taskId: string;
  agentId: AgentId;
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;
  progress: number; // 0-100
  logs: string[];
  errors: string[];
  metrics: {
    memoryUsage: number;
    cpuUsage: number;
    responseTime: number;
  };
  watchdog: {
    enabled: boolean;
    timeoutMs: number;
    lastCheck: Date;
    violations: number;
  };
}

/**
 * Schedule entry
 */
export interface ScheduleEntry {
  id: ScheduleId;
  taskId: string;
  workflowId: WorkflowId;
  scheduledAt: Date;
  priority: TaskPriority;
  dependencies: string[];
  constraints: {
    requiredCapabilities: AgentCapability[];
    preferredAgents: AgentId[];
    excludedAgents: AgentId[];
    maxRetries: number;
    timeoutMs: number;
  };
  status: 'pending' | 'scheduled' | 'assigned' | 'completed' | 'failed';
  assignedAgent?: AgentId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Orchestration configuration
 */
export interface UnifiedOrchestrationEngineConfig {
  // Global settings
  enabled: boolean;
  maxConcurrentWorkflows: number;
  maxConcurrentExecutions: number;
  defaultTimeout: number;
  heartbeatInterval: number;
  
  // Agent management
  agentManagement: {
    maxAgents: number;
    heartbeatTimeout: number;
    offlineThreshold: number;
    autoRecovery: boolean;
    loadBalancing: boolean;
  };
  
  // Workflow management
  workflowManagement: {
    persistState: boolean;
    stateBackupInterval: number;
    maxWorkflowDuration: number;
    autoCleanup: boolean;
    cleanupInterval: number;
  };
  
  // Task scheduling
  taskScheduling: {
    strategy: AssignmentStrategy;
    batchSize: number;
    schedulingInterval: number;
    priorityWeights: Record<TaskPriority, number>;
    dependencyResolution: boolean;
  };
  
  // Execution monitoring
  executionMonitoring: {
    watchdogEnabled: boolean;
    watchdogInterval: number;
    performanceTracking: boolean;
    metricsCollection: boolean;
    alertThresholds: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
    };
  };
  
  // Recovery settings
  recovery: {
    autoRetry: boolean;
    maxRetries: number;
    retryDelay: number;
    failureEscalation: boolean;
    deadlockDetection: boolean;
  };
}

/**
 * Orchestration statistics
 */
export interface OrchestrationStatistics {
  agents: {
    total: number;
    online: number;
    busy: number;
    idle: number;
    offline: number;
    averageLoad: number;
  };
  workflows: {
    active: number;
    completed: number;
    failed: number;
    averageDuration: number;
  };
  tasks: {
    scheduled: number;
    running: number;
    completed: number;
    failed: number;
    averageExecutionTime: number;
  };
  performance: {
    throughput: number; // tasks per minute
    successRate: number;
    errorRate: number;
    averageResponseTime: number;
  };
}

// =============================================================================
// UNIFIED ORCHESTRATION ENGINE
// =============================================================================

/**
 * Unified Orchestration Engine
 * 
 * Consolidates all agent/workflow orchestration functionality into a single,
 * comprehensive engine with advanced features for agent management, workflow
 * orchestration, task scheduling, and execution monitoring.
 */
export class UnifiedOrchestrationEngine extends EventEmitter {
  private static instance: UnifiedOrchestrationEngine | null = null;
  
  // Core configuration
  private readonly config: UnifiedOrchestrationEngineConfig;
  private readonly dataDirectory: string;
  private initialized = false;
  
  // Orchestration state
  private readonly agents = new Map<AgentId, AgentInfo>();
  private readonly workflows = new Map<WorkflowId, WorkflowState>();
  private readonly assignments = new Map<string, TaskAssignment>();
  private readonly executions = new Map<ExecutionId, ExecutionContext>();
  private readonly schedule = new Map<ScheduleId, ScheduleEntry>();
  
  // Performance tracking
  private orchestrationCount = 0;
  private workflowCount = 0;
  private taskExecutionCount = 0;
  private totalExecutionTime = 0;
  private errorCount = 0;
  
  // Background processes
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  
  private constructor(config: UnifiedOrchestrationEngineConfig) {
    super();
    this.config = config;
    this.dataDirectory = getVibeTaskManagerOutputDir();
    
    logger.info('Unified Orchestration Engine initialized');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: UnifiedOrchestrationEngineConfig): UnifiedOrchestrationEngine {
    if (!UnifiedOrchestrationEngine.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      UnifiedOrchestrationEngine.instance = new UnifiedOrchestrationEngine(config);
    }
    return UnifiedOrchestrationEngine.instance;
  }
  
  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (UnifiedOrchestrationEngine.instance) {
      UnifiedOrchestrationEngine.instance.dispose();
      UnifiedOrchestrationEngine.instance = null;
    }
  }
  
  // =============================================================================
  // INITIALIZATION AND LIFECYCLE
  // =============================================================================
  
  /**
   * Initialize the orchestration engine
   */
  public async initialize(): Promise<Result<void, EnhancedError>> {
    if (this.initialized) {
      return createSuccess(undefined);
    }
    
    try {
      // Create data directories
      await this.createDataDirectories();
      
      // Load persisted state
      await this.loadPersistedState();
      
      // Start background processes
      this.startBackgroundProcesses();
      
      this.initialized = true;
      this.emit('initialized');
      logger.info('Orchestration engine initialized successfully');
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to initialize orchestration engine: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'initialize').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Create data directories
   */
  private async createDataDirectories(): Promise<void> {
    const directories = [
      join(this.dataDirectory, 'orchestration'),
      join(this.dataDirectory, 'orchestration', 'agents'),
      join(this.dataDirectory, 'orchestration', 'workflows'),
      join(this.dataDirectory, 'orchestration', 'executions'),
      join(this.dataDirectory, 'orchestration', 'schedules'),
      join(this.dataDirectory, 'orchestration', 'logs')
    ];
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
  
  /**
   * Load persisted state
   */
  private async loadPersistedState(): Promise<void> {
    if (!this.config.workflowManagement.persistState) {
      return;
    }
    
    try {
      // Load workflows
      const workflowsPath = join(this.dataDirectory, 'orchestration', 'workflows.json');
      if (await this.fileExists(workflowsPath)) {
        const workflowsData = await fs.readFile(workflowsPath, 'utf-8');
        const workflows = JSON.parse(workflowsData);
        for (const workflow of workflows) {
          this.workflows.set(workflow.id, workflow);
        }
      }
      
      // Load agents
      const agentsPath = join(this.dataDirectory, 'orchestration', 'agents.json');
      if (await this.fileExists(agentsPath)) {
        const agentsData = await fs.readFile(agentsPath, 'utf-8');
        const agents = JSON.parse(agentsData);
        for (const agent of agents) {
          this.agents.set(agent.id, agent);
        }
      }
      
      logger.info('Persisted orchestration state loaded successfully');
    } catch (error) {
      logger.warn('Failed to load persisted state, starting fresh:', error);
    }
  }
  
  /**
   * Start background processes
   */
  private startBackgroundProcesses(): void {
    // Agent heartbeat monitoring
    if (this.config.agentManagement.heartbeatTimeout > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.checkAgentHeartbeats().catch(error => {
          logger.error('Agent heartbeat check failed:', error);
        });
      }, this.config.heartbeatInterval);
    }
    
    // Task scheduler
    if (this.config.taskScheduling.schedulingInterval > 0) {
      this.schedulerTimer = setInterval(() => {
        this.processScheduledTasks().catch(error => {
          logger.error('Task scheduling failed:', error);
        });
      }, this.config.taskScheduling.schedulingInterval);
    }
    
    // Execution watchdog
    if (this.config.executionMonitoring.watchdogEnabled) {
      this.watchdogTimer = setInterval(() => {
        this.runExecutionWatchdog().catch(error => {
          logger.error('Execution watchdog failed:', error);
        });
      }, this.config.executionMonitoring.watchdogInterval);
    }
    
    // State cleanup
    if (this.config.workflowManagement.autoCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupCompletedWorkflows().catch(error => {
          logger.error('Workflow cleanup failed:', error);
        });
      }, this.config.workflowManagement.cleanupInterval);
    }
    
    // Metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, 60 * 1000); // Every minute
    
    logger.info('Orchestration background processes started');
  }
  
  // =============================================================================
  // AGENT MANAGEMENT
  // =============================================================================
  
  /**
   * Register agent
   */
  public async registerAgent(agentInfo: Omit<AgentInfo, 'id' | 'metadata'>): Promise<Result<AgentId, EnhancedError>> {
    try {
      const agentId = createAgentId(crypto.randomUUID());
      
      const agent: AgentInfo = {
        id: agentId,
        ...agentInfo,
        metadata: {
          version: '1.0.0',
          heartbeatInterval: this.config.heartbeatInterval,
          lastHeartbeat: new Date(),
          registeredAt: new Date()
        }
      };
      
      this.agents.set(agentId, agent);
      
      this.emit('agentRegistered', agent);
      logger.info(`Agent registered: ${agentId} (${agent.name})`);
      
      return createSuccess(agentId);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to register agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'registerAgent').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Update agent status
   */
  public async updateAgentStatus(agentId: AgentId, status: AgentStatus): Promise<Result<void, EnhancedError>> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Agent not found: ${agentId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'updateAgentStatus').build()
        ));
      }
      
      const oldStatus = agent.status;
      agent.status = status;
      agent.metadata.lastHeartbeat = new Date();
      
      this.emit('agentStatusChanged', { agentId, oldStatus, newStatus: status });
      logger.debug(`Agent status updated: ${agentId} ${oldStatus} -> ${status}`);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to update agent status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'updateAgentStatus').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Get available agents for task assignment
   */
  public async getAvailableAgents(requiredCapabilities?: AgentCapability[]): Promise<Result<AgentInfo[], EnhancedError>> {
    try {
      const availableAgents = Array.from(this.agents.values()).filter(agent => {
        // Check if agent is online and not at capacity
        if (agent.status !== 'online' && agent.status !== 'idle') {
          return false;
        }
        
        if (agent.currentTasks.length >= agent.maxConcurrentTasks) {
          return false;
        }
        
        // Check capabilities if specified
        if (requiredCapabilities && requiredCapabilities.length > 0) {
          const hasRequiredCapabilities = requiredCapabilities.every(cap => 
            agent.capabilities.includes(cap)
          );
          if (!hasRequiredCapabilities) {
            return false;
          }
        }
        
        return true;
      });
      
      // Sort by load and performance
      availableAgents.sort((a, b) => {
        const loadDiff = a.currentLoad - b.currentLoad;
        if (Math.abs(loadDiff) > 0.1) {
          return loadDiff;
        }
        return b.performance.successRate - a.performance.successRate;
      });
      
      return createSuccess(availableAgents);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to get available agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'getAvailableAgents').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // WORKFLOW MANAGEMENT
  // =============================================================================
  
  /**
   * Create workflow
   */
  public async createWorkflow(projectId: string, sessionId: string, tasks: string[], priority: TaskPriority = 'medium'): Promise<Result<WorkflowId, EnhancedError>> {
    try {
      const workflowId = createWorkflowId(crypto.randomUUID());
      
      const workflow: WorkflowState = {
        id: workflowId,
        phase: 'initialization',
        status: 'pending',
        projectId,
        sessionId,
        tasks,
        assignedAgents: [],
        startTime: new Date(),
        progress: {
          totalTasks: tasks.length,
          completedTasks: 0,
          failedTasks: 0,
          percentage: 0
        },
        metadata: {
          initiator: sessionId,
          priority,
          estimatedDuration: tasks.length * 300000, // 5 minutes per task estimate
        }
      };
      
      this.workflows.set(workflowId, workflow);
      this.workflowCount++;
      
      this.emit('workflowCreated', workflow);
      logger.info(`Workflow created: ${workflowId} with ${tasks.length} tasks`);
      
      return createSuccess(workflowId);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'createWorkflow').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Update workflow phase
   */
  public async updateWorkflowPhase(workflowId: WorkflowId, phase: WorkflowPhase): Promise<Result<void, EnhancedError>> {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Workflow not found: ${workflowId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'updateWorkflowPhase').build()
        ));
      }
      
      const oldPhase = workflow.phase;
      workflow.phase = phase;
      
      // Update status based on phase
      if (phase === 'execution') {
        workflow.status = 'running';
      } else if (phase === 'completion') {
        workflow.status = 'completed';
        workflow.endTime = new Date();
        workflow.metadata.actualDuration = workflow.endTime.getTime() - workflow.startTime.getTime();
      } else if (phase === 'error_recovery') {
        workflow.status = 'error';
      }
      
      this.emit('workflowPhaseChanged', { workflowId, oldPhase, newPhase: phase });
      logger.debug(`Workflow phase updated: ${workflowId} ${oldPhase} -> ${phase}`);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to update workflow phase: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'updateWorkflowPhase').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // TASK SCHEDULING AND ASSIGNMENT
  // =============================================================================
  
  /**
   * Schedule task for execution
   */
  public async scheduleTask(task: AtomicTask, workflowId: WorkflowId, constraints?: Partial<ScheduleEntry['constraints']>): Promise<Result<ScheduleId, EnhancedError>> {
    try {
      const scheduleId = createScheduleId(crypto.randomUUID());
      
      const scheduleEntry: ScheduleEntry = {
        id: scheduleId,
        taskId: task.id,
        workflowId,
        scheduledAt: new Date(),
        priority: task.priority,
        dependencies: task.dependencies,
        constraints: {
          requiredCapabilities: ['task_execution'],
          preferredAgents: [],
          excludedAgents: [],
          maxRetries: this.config.recovery.maxRetries,
          timeoutMs: this.config.defaultTimeout,
          ...constraints
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.schedule.set(scheduleId, scheduleEntry);
      
      this.emit('taskScheduled', scheduleEntry);
      logger.debug(`Task scheduled: ${task.id} in workflow ${workflowId}`);
      
      return createSuccess(scheduleId);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to schedule task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'scheduleTask').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Assign task to agent
   */
  public async assignTask(scheduleId: ScheduleId, agentId: AgentId): Promise<Result<TaskAssignment, EnhancedError>> {
    try {
      const scheduleEntry = this.schedule.get(scheduleId);
      if (!scheduleEntry) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Schedule entry not found: ${scheduleId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'assignTask').build()
        ));
      }
      
      const agent = this.agents.get(agentId);
      if (!agent) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Agent not found: ${agentId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'assignTask').build()
        ));
      }
      
      // Check agent availability
      if (agent.currentTasks.length >= agent.maxConcurrentTasks) {
        return createFailure(ErrorFactory.createError(
          'resource',
          `Agent at capacity: ${agentId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'assignTask').build()
        ));
      }
      
      // Create assignment
      const assignment: TaskAssignment = {
        id: crypto.randomUUID(),
        taskId: scheduleEntry.taskId,
        agentId,
        workflowId: scheduleEntry.workflowId,
        assignedAt: new Date(),
        status: 'scheduled',
        priority: scheduleEntry.priority,
        estimatedDuration: 300000, // 5 minutes default
        retryCount: 0,
        maxRetries: scheduleEntry.constraints.maxRetries,
        metadata: {}
      };
      
      // Update state
      this.assignments.set(assignment.id, assignment);
      scheduleEntry.status = 'assigned';
      scheduleEntry.assignedAgent = agentId;
      scheduleEntry.updatedAt = new Date();
      
      // Update agent
      agent.currentTasks.push(scheduleEntry.taskId);
      agent.currentLoad = agent.currentTasks.length / agent.maxConcurrentTasks;
      agent.status = agent.currentTasks.length > 0 ? 'busy' : 'idle';
      
      this.emit('taskAssigned', assignment);
      logger.info(`Task assigned: ${scheduleEntry.taskId} -> ${agentId}`);
      
      return createSuccess(assignment);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to assign task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'assignTask').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // EXECUTION MONITORING
  // =============================================================================
  
  /**
   * Start task execution
   */
  public async startExecution(assignmentId: string): Promise<Result<ExecutionId, EnhancedError>> {
    try {
      const assignment = this.assignments.get(assignmentId);
      if (!assignment) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Assignment not found: ${assignmentId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'startExecution').build()
        ));
      }
      
      const executionId = createExecutionId(crypto.randomUUID());
      
      const execution: ExecutionContext = {
        id: executionId,
        workflowId: assignment.workflowId,
        taskId: assignment.taskId,
        agentId: assignment.agentId,
        status: 'running',
        startTime: new Date(),
        progress: 0,
        logs: [],
        errors: [],
        metrics: {
          memoryUsage: 0,
          cpuUsage: 0,
          responseTime: 0
        },
        watchdog: {
          enabled: this.config.executionMonitoring.watchdogEnabled,
          timeoutMs: this.config.defaultTimeout,
          lastCheck: new Date(),
          violations: 0
        }
      };
      
      this.executions.set(executionId, execution);
      assignment.status = 'running';
      assignment.startedAt = new Date();
      
      this.taskExecutionCount++;
      
      this.emit('executionStarted', execution);
      logger.info(`Execution started: ${executionId} for task ${assignment.taskId}`);
      
      return createSuccess(executionId);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to start execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'startExecution').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Update execution progress
   */
  public async updateExecutionProgress(executionId: ExecutionId, progress: number, logs?: string[]): Promise<Result<void, EnhancedError>> {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Execution not found: ${executionId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'updateExecutionProgress').build()
        ));
      }
      
      execution.progress = Math.max(0, Math.min(100, progress));
      execution.watchdog.lastCheck = new Date();
      
      if (logs) {
        execution.logs.push(...logs);
      }
      
      this.emit('executionProgress', { executionId, progress });
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to update execution progress: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'updateExecutionProgress').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Complete execution
   */
  public async completeExecution(executionId: ExecutionId, success: boolean, result?: unknown): Promise<Result<void, EnhancedError>> {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Execution not found: ${executionId}`,
          createErrorContext('UnifiedOrchestrationEngine', 'completeExecution').build()
        ));
      }
      
      // Update execution
      execution.status = success ? 'completed' : 'failed';
      execution.endTime = new Date();
      execution.progress = success ? 100 : execution.progress;
      
      // Update assignment
      const assignment = Array.from(this.assignments.values()).find(a => 
        a.taskId === execution.taskId && a.agentId === execution.agentId
      );
      
      if (assignment) {
        assignment.status = success ? 'completed' : 'failed';
        assignment.completedAt = new Date();
        assignment.actualDuration = execution.endTime.getTime() - execution.startTime.getTime();
      }
      
      // Update agent
      const agent = this.agents.get(execution.agentId);
      if (agent) {
        agent.currentTasks = agent.currentTasks.filter(taskId => taskId !== execution.taskId);
        agent.currentLoad = agent.currentTasks.length / agent.maxConcurrentTasks;
        agent.status = agent.currentTasks.length > 0 ? 'busy' : 'idle';
        
        // Update performance metrics
        const executionTime = execution.endTime.getTime() - execution.startTime.getTime();
        agent.performance.averageTaskTime = (agent.performance.averageTaskTime + executionTime) / 2;
        
        if (success) {
          agent.performance.successRate = Math.min(1, agent.performance.successRate + 0.01);
        } else {
          agent.performance.errorRate = Math.min(1, agent.performance.errorRate + 0.01);
          this.errorCount++;
        }
        
        agent.performance.lastActivity = new Date();
      }
      
      // Update workflow progress
      const workflow = this.workflows.get(execution.workflowId);
      if (workflow) {
        if (success) {
          workflow.progress.completedTasks++;
        } else {
          workflow.progress.failedTasks++;
        }
        workflow.progress.percentage = 
          (workflow.progress.completedTasks / workflow.progress.totalTasks) * 100;
      }
      
      this.totalExecutionTime += execution.endTime.getTime() - execution.startTime.getTime();
      
      this.emit('executionCompleted', { execution, success, result });
      logger.info(`Execution completed: ${executionId} (${success ? 'success' : 'failed'})`);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to complete execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedOrchestrationEngine', 'completeExecution').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // BACKGROUND PROCESSES
  // =============================================================================
  
  /**
   * Check agent heartbeats
   */
  private async checkAgentHeartbeats(): Promise<void> {
    const now = new Date();
    const timeout = this.config.agentManagement.heartbeatTimeout;
    
    for (const [agentId, agent] of this.agents.entries()) {
      const timeSinceHeartbeat = now.getTime() - agent.metadata.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > timeout && agent.status !== 'offline') {
        agent.status = 'offline';
        this.emit('agentTimeout', { agentId, timeSinceHeartbeat });
        logger.warn(`Agent timeout: ${agentId} (${timeSinceHeartbeat}ms)`);
        
        // Handle agent recovery if enabled
        if (this.config.agentManagement.autoRecovery) {
          await this.handleAgentRecovery(agentId);
        }
      }
    }
  }
  
  /**
   * Process scheduled tasks
   */
  private async processScheduledTasks(): Promise<void> {
    const pendingTasks = Array.from(this.schedule.values())
      .filter(entry => entry.status === 'pending')
      .sort((a, b) => {
        // Sort by priority and scheduled time
        const priorityWeights = this.config.taskScheduling.priorityWeights;
        const priorityDiff = priorityWeights[b.priority] - priorityWeights[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.scheduledAt.getTime() - b.scheduledAt.getTime();
      });
    
    const batchSize = Math.min(pendingTasks.length, this.config.taskScheduling.batchSize);
    
    for (let i = 0; i < batchSize; i++) {
      const task = pendingTasks[i];
      
      // Get available agents
      const agentsResult = await this.getAvailableAgents(task.constraints.requiredCapabilities);
      if (!agentsResult.success || agentsResult.data.length === 0) {
        continue;
      }
      
      // Select best agent based on strategy
      const selectedAgent = this.selectAgentByStrategy(agentsResult.data, task);
      if (selectedAgent) {
        await this.assignTask(task.id, selectedAgent.id);
      }
    }
  }
  
  /**
   * Run execution watchdog
   */
  private async runExecutionWatchdog(): Promise<void> {
    const now = new Date();
    
    for (const [executionId, execution] of this.executions.entries()) {
      if (execution.status !== 'running') continue;
      
      const timeSinceLastCheck = now.getTime() - execution.watchdog.lastCheck.getTime();
      
      if (timeSinceLastCheck > execution.watchdog.timeoutMs) {
        execution.watchdog.violations++;
        
        if (execution.watchdog.violations >= 3) {
          // Mark execution as timeout
          execution.status = 'timeout';
          execution.endTime = new Date();
          
          this.emit('executionTimeout', execution);
          logger.warn(`Execution timeout: ${executionId}`);
          
          // Handle timeout recovery
          if (this.config.recovery.autoRetry) {
            await this.handleExecutionTimeout(executionId);
          }
        }
      }
    }
  }
  
  /**
   * Clean up completed workflows
   */
  private async cleanupCompletedWorkflows(): Promise<void> {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const completedWorkflows: WorkflowId[] = [];
    
    for (const [workflowId, workflow] of this.workflows.entries()) {
      if ((workflow.status === 'completed' || workflow.status === 'failed') && 
          workflow.endTime && workflow.endTime < cutoffTime) {
        completedWorkflows.push(workflowId);
      }
    }
    
    for (const workflowId of completedWorkflows) {
      this.workflows.delete(workflowId);
      
      // Clean up related assignments and executions
      for (const [assignmentId, assignment] of this.assignments.entries()) {
        if (assignment.workflowId === workflowId) {
          this.assignments.delete(assignmentId);
        }
      }
      
      for (const [executionId, execution] of this.executions.entries()) {
        if (execution.workflowId === workflowId) {
          this.executions.delete(executionId);
        }
      }
    }
    
    if (completedWorkflows.length > 0) {
      logger.debug(`Cleaned up ${completedWorkflows.length} completed workflows`);
    }
  }
  
  /**
   * Collect metrics
   */
  private collectMetrics(): void {
    const stats: OrchestrationStatistics = {
      agents: {
        total: this.agents.size,
        online: Array.from(this.agents.values()).filter(a => a.status === 'online').length,
        busy: Array.from(this.agents.values()).filter(a => a.status === 'busy').length,
        idle: Array.from(this.agents.values()).filter(a => a.status === 'idle').length,
        offline: Array.from(this.agents.values()).filter(a => a.status === 'offline').length,
        averageLoad: this.agents.size > 0 ? 
          Array.from(this.agents.values()).reduce((sum, a) => sum + a.currentLoad, 0) / this.agents.size : 0
      },
      workflows: {
        active: Array.from(this.workflows.values()).filter(w => w.status === 'running').length,
        completed: Array.from(this.workflows.values()).filter(w => w.status === 'completed').length,
        failed: Array.from(this.workflows.values()).filter(w => w.status === 'failed').length,
        averageDuration: this.workflowCount > 0 ? this.totalExecutionTime / this.workflowCount : 0
      },
      tasks: {
        scheduled: Array.from(this.schedule.values()).filter(s => s.status === 'pending').length,
        running: Array.from(this.executions.values()).filter(e => e.status === 'running').length,
        completed: Array.from(this.assignments.values()).filter(a => a.status === 'completed').length,
        failed: Array.from(this.assignments.values()).filter(a => a.status === 'failed').length,
        averageExecutionTime: this.taskExecutionCount > 0 ? this.totalExecutionTime / this.taskExecutionCount : 0
      },
      performance: {
        throughput: this.taskExecutionCount / Math.max(1, (Date.now() - this.orchestrationCount) / 60000), // per minute
        successRate: this.taskExecutionCount > 0 ? 
          (this.taskExecutionCount - this.errorCount) / this.taskExecutionCount : 1,
        errorRate: this.taskExecutionCount > 0 ? this.errorCount / this.taskExecutionCount : 0,
        averageResponseTime: this.taskExecutionCount > 0 ? this.totalExecutionTime / this.taskExecutionCount : 0
      }
    };
    
    this.emit('metricsCollected', stats);
  }
  
  // =============================================================================
  // UTILITY METHODS
  // =============================================================================
  
  /**
   * Select agent by strategy
   */
  private selectAgentByStrategy(agents: AgentInfo[], task: ScheduleEntry): AgentInfo | null {
    if (agents.length === 0) return null;
    
    switch (this.config.taskScheduling.strategy) {
      case 'round_robin':
        return agents[this.orchestrationCount % agents.length];
        
      case 'least_loaded':
        return agents.reduce((best, current) => 
          current.currentLoad < best.currentLoad ? current : best
        );
        
      case 'capability_first': {
        // Prefer agents with exact capability match
        const exactMatch = agents.find(agent => 
          task.constraints.requiredCapabilities.every(cap => agent.capabilities.includes(cap))
        );
        return exactMatch || agents[0];
      }
        
      case 'performance_based':
        return agents.reduce((best, current) => 
          current.performance.successRate > best.performance.successRate ? current : best
        );
        
      case 'intelligent_hybrid':
      default:
        // Combine load, performance, and capability matching
        return agents.reduce((best, current) => {
          const currentScore = this.calculateAgentScore(current, task);
          const bestScore = this.calculateAgentScore(best, task);
          return currentScore > bestScore ? current : best;
        });
    }
  }
  
  /**
   * Calculate agent score for intelligent assignment
   */
  private calculateAgentScore(agent: AgentInfo, task: ScheduleEntry): number {
    let score = 0;
    
    // Load factor (lower is better)
    score += (1 - agent.currentLoad) * 0.3;
    
    // Performance factor
    score += agent.performance.successRate * 0.4;
    
    // Capability match factor
    const capabilityMatch = task.constraints.requiredCapabilities.every(cap => 
      agent.capabilities.includes(cap)
    ) ? 1 : 0.5;
    score += capabilityMatch * 0.3;
    
    return score;
  }
  
  /**
   * Handle agent recovery
   */
  private async handleAgentRecovery(agentId: AgentId): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    // Reassign tasks from offline agent
    for (const taskId of agent.currentTasks) {
      const assignment = Array.from(this.assignments.values()).find(a => 
        a.taskId === taskId && a.agentId === agentId
      );
      
      if (assignment && assignment.retryCount < assignment.maxRetries) {
        assignment.retryCount++;
        assignment.status = 'pending';
        
        // Find new agent
        const agentsResult = await this.getAvailableAgents();
        if (agentsResult.success && agentsResult.data.length > 0) {
          const newAgent = agentsResult.data[0];
          assignment.agentId = newAgent.id;
          
          logger.info(`Task reassigned from offline agent: ${taskId} ${agentId} -> ${newAgent.id}`);
        }
      }
    }
    
    // Clear agent tasks
    agent.currentTasks = [];
    agent.currentLoad = 0;
  }
  
  /**
   * Handle execution timeout
   */
  private async handleExecutionTimeout(executionId: ExecutionId): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;
    
    const assignment = Array.from(this.assignments.values()).find(a => 
      a.taskId === execution.taskId && a.agentId === execution.agentId
    );
    
    if (assignment && assignment.retryCount < assignment.maxRetries) {
      assignment.retryCount++;
      assignment.status = 'pending';
      
      // Schedule retry
      setTimeout(async () => {
        const agentsResult = await this.getAvailableAgents();
        if (agentsResult.success && agentsResult.data.length > 0) {
          const newAgent = agentsResult.data[0];
          assignment.agentId = newAgent.id;
          
          logger.info(`Task retry scheduled after timeout: ${assignment.taskId}`);
        }
      }, this.config.recovery.retryDelay);
    }
  }
  
  /**
   * Check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get orchestration statistics
   */
  public getStatistics(): OrchestrationStatistics {
    return {
      agents: {
        total: this.agents.size,
        online: Array.from(this.agents.values()).filter(a => a.status === 'online').length,
        busy: Array.from(this.agents.values()).filter(a => a.status === 'busy').length,
        idle: Array.from(this.agents.values()).filter(a => a.status === 'idle').length,
        offline: Array.from(this.agents.values()).filter(a => a.status === 'offline').length,
        averageLoad: this.agents.size > 0 ? 
          Array.from(this.agents.values()).reduce((sum, a) => sum + a.currentLoad, 0) / this.agents.size : 0
      },
      workflows: {
        active: Array.from(this.workflows.values()).filter(w => w.status === 'running').length,
        completed: Array.from(this.workflows.values()).filter(w => w.status === 'completed').length,
        failed: Array.from(this.workflows.values()).filter(w => w.status === 'failed').length,
        averageDuration: this.workflowCount > 0 ? this.totalExecutionTime / this.workflowCount : 0
      },
      tasks: {
        scheduled: Array.from(this.schedule.values()).filter(s => s.status === 'pending').length,
        running: Array.from(this.executions.values()).filter(e => e.status === 'running').length,
        completed: Array.from(this.assignments.values()).filter(a => a.status === 'completed').length,
        failed: Array.from(this.assignments.values()).filter(a => a.status === 'failed').length,
        averageExecutionTime: this.taskExecutionCount > 0 ? this.totalExecutionTime / this.taskExecutionCount : 0
      },
      performance: {
        throughput: this.taskExecutionCount / Math.max(1, (Date.now() - this.orchestrationCount) / 60000),
        successRate: this.taskExecutionCount > 0 ? 
          (this.taskExecutionCount - this.errorCount) / this.taskExecutionCount : 1,
        errorRate: this.taskExecutionCount > 0 ? this.errorCount / this.taskExecutionCount : 0,
        averageResponseTime: this.taskExecutionCount > 0 ? this.totalExecutionTime / this.taskExecutionCount : 0
      }
    };
  }
  
  // =============================================================================
  // CLEANUP AND DISPOSAL
  // =============================================================================
  
  /**
   * Dispose of the engine and clean up resources
   */
  public dispose(): void {
    // Stop timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    
    // Clear state
    this.agents.clear();
    this.workflows.clear();
    this.assignments.clear();
    this.executions.clear();
    this.schedule.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    this.initialized = false;
    logger.info('Unified Orchestration Engine disposed');
  }
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Create default configuration for the unified orchestration engine
 */
export function createDefaultOrchestrationConfig(): UnifiedOrchestrationEngineConfig {
  return {
    enabled: true,
    maxConcurrentWorkflows: 10,
    maxConcurrentExecutions: 50,
    defaultTimeout: 300000, // 5 minutes
    heartbeatInterval: 30000, // 30 seconds
    
    agentManagement: {
      maxAgents: 20,
      heartbeatTimeout: 90000, // 90 seconds
      offlineThreshold: 180000, // 3 minutes
      autoRecovery: true,
      loadBalancing: true
    },
    
    workflowManagement: {
      persistState: true,
      stateBackupInterval: 60000, // 1 minute
      maxWorkflowDuration: 3600000, // 1 hour
      autoCleanup: true,
      cleanupInterval: 3600000 // 1 hour
    },
    
    taskScheduling: {
      strategy: 'intelligent_hybrid',
      batchSize: 10,
      schedulingInterval: 5000, // 5 seconds
      priorityWeights: {
        low: 1,
        medium: 2,
        high: 3,
        critical: 5
      },
      dependencyResolution: true
    },
    
    executionMonitoring: {
      watchdogEnabled: true,
      watchdogInterval: 10000, // 10 seconds
      performanceTracking: true,
      metricsCollection: true,
      alertThresholds: {
        errorRate: 0.1, // 10%
        responseTime: 300000, // 5 minutes
        memoryUsage: 0.8 // 80%
      }
    },
    
    recovery: {
      autoRetry: true,
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      failureEscalation: true,
      deadlockDetection: true
    }
  };
}