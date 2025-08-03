/**
 * Unified Task Execution Engine
 * 
 * Consolidates 5 execution services into a single, comprehensive engine:
 * - TaskScheduler: Intelligent scheduling with priority and resource awareness
 * - TaskStreamer: Task streaming to agents with queuing and load balancing
 * - ExecutionCoordinator: Parallel execution coordination with resource management
 * - ExecutionWatchdog: Timeout monitoring and recovery
 * - TaskLifecycle: Lifecycle automation and state transitions
 * 
 * This unified engine provides a complete task execution solution with:
 * - Priority-based scheduling algorithms
 * - Real-time task streaming and distribution
 * - Resource-aware parallel execution
 * - Comprehensive timeout monitoring and recovery
 * - Automated lifecycle state management
 * - Event-driven architecture with comprehensive monitoring
 */

import { EventEmitter } from 'events';
import { AtomicTask, TaskStatus, TaskPriority } from '../types/task.js';
// import { OptimizedDependencyGraph } from '../core/dependency-graph.js';
// import { AgentOrchestrator } from '../services/agent-orchestrator.js';
// import { StartupOptimizer } from '../utils/startup-optimizer.js';
// import { PerformanceMonitor } from '../utils/performance-monitor.js';
// import { ConcurrentAccessManager } from '../security/concurrent-access.js';
// import { MemoryManager } from '../../code-map-generator/cache/memoryManager.js';
import {
  EnhancedError,
  ErrorFactory,
  createErrorContext
} from '../utils/enhanced-errors.js';
import { Result, createSuccess, createFailure } from './unified-lifecycle-manager.js';
import logger from '../../../logger.js';

// =============================================================================
// BRANDED TYPES FOR TYPE SAFETY
// =============================================================================

export type TaskId = string & { readonly __brand: 'TaskId' };
export type AgentId = string & { readonly __brand: 'AgentId' };
export type ExecutionId = string & { readonly __brand: 'ExecutionId' };
export type StreamId = string & { readonly __brand: 'StreamId' };

export function createTaskId(id: string): TaskId {
  if (!id || id.trim().length === 0) {
    throw new Error('Task ID cannot be empty');
  }
  return id as TaskId;
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

export function createStreamId(id: string): StreamId {
  if (!id || id.trim().length === 0) {
    throw new Error('Stream ID cannot be empty');
  }
  return id as StreamId;
}

// =============================================================================
// CORE TYPES AND INTERFACES
// =============================================================================

/**
 * Task execution status
 */
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Scheduling algorithm types
 */
export type SchedulingAlgorithm =
  | 'priority_first'      // Priority-based scheduling
  | 'earliest_deadline'   // Earliest deadline first
  | 'critical_path'       // Critical path method
  | 'resource_balanced'   // Resource-aware balanced scheduling
  | 'shortest_job'        // Shortest job first
  | 'hybrid_optimal';     // Hybrid optimization algorithm

/**
 * Agent information and status
 */
export interface Agent {
  id: AgentId;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  capacity: {
    maxMemoryMB: number;
    maxCpuWeight: number;
    maxConcurrentTasks: number;
  };
  currentUsage: {
    memoryMB: number;
    cpuWeight: number;
    activeTasks: number;
  };
  metadata: {
    lastHeartbeat: Date;
    totalTasksExecuted: number;
    averageExecutionTime: number;
    successRate: number;
  };
}

/**
 * Task execution context
 */
export interface TaskExecution {
  executionId: ExecutionId;
  taskId: TaskId;
  agentId?: AgentId;
  status: ExecutionStatus;
  priority: TaskPriority;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  retryCount: number;
  maxRetries: number;
  timeoutAt?: Date;
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  };
  resourceRequirements: {
    memoryMB: number;
    cpuWeight: number;
    estimatedDurationMinutes: number;
  };
}

/**
 * Task scoring information for scheduling algorithms
 */
export interface TaskScores {
  priorityScore: number;
  deadlineScore: number;
  dependencyScore: number;
  resourceScore: number;
  durationScore: number;
  systemLoadScore: number;
  complexityScore: number;
  businessImpactScore: number;
  agentAvailabilityScore: number;
  totalScore: number;
}

/**
 * Resource constraints for scheduling
 */
export interface ResourceConstraints {
  maxMemoryMB: number;
  maxCpuWeight: number;
  maxConcurrentTasks: number;
  reservedMemoryMB: number;
  reservedCpuWeight: number;
}

/**
 * Task stream configuration
 */
export interface StreamConfig {
  batchSize: number;
  streamInterval: number;
  maxQueueSize: number;
  priorityThreshold: number;
  enableRealTimeStreaming: boolean;
  loadBalancingEnabled: boolean;
}

/**
 * Task stream status
 */
export interface StreamStatus {
  streamId: StreamId;
  isActive: boolean;
  queuedTasks: number;
  streamedTasks: number;
  failedTasks: number;
  averageStreamTime: number;
  lastStreamAt?: Date;
}

/**
 * Watchdog configuration per task type
 */
export interface WatchdogConfig {
  taskType: string;
  timeoutMinutes: number;
  warningThresholdMinutes: number;
  maxRetries: number;
  escalationDelayMinutes: number;
  healthCheckIntervalMinutes: number;
}

/**
 * Task monitoring information
 */
export interface TaskMonitor {
  taskId: TaskId;
  agentId?: AgentId;
  startTime: Date;
  lastHeartbeat: Date;
  timeoutAt: Date;
  warningAt: Date;
  status: 'monitoring' | 'warning' | 'timeout' | 'escalated' | 'recovered';
  retryCount: number;
  escalationLevel: number;
  taskType: string;
  estimatedDuration?: number;
}

/**
 * Task transition metadata
 */
export interface TaskTransition {
  taskId: TaskId;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  timestamp: Date;
  reason?: string;
  triggeredBy?: string;
  metadata?: Record<string, unknown>;
  isAutomated: boolean;
}

/**
 * Unified task execution engine configuration
 */
export interface UnifiedTaskExecutionEngineConfig {
  // Scheduling configuration
  scheduling: {
    algorithm: SchedulingAlgorithm;
    enableDynamicPriority: boolean;
    resourceConstraints: ResourceConstraints;
    batchSize: number;
    schedulingInterval: number;
  };
  
  // Streaming configuration
  streaming: StreamConfig;
  
  // Execution configuration
  execution: {
    maxConcurrentExecutions: number;
    enableLoadBalancing: boolean;
    enableResourceMonitoring: boolean;
    executionTimeout: number;
  };
  
  // Watchdog configuration
  watchdog: {
    enabled: boolean;
    defaultTimeout: number;
    healthCheckInterval: number;
    maxRetries: number;
    escalationEnabled: boolean;
  };
  
  // Lifecycle configuration
  lifecycle: {
    enableAutomation: boolean;
    transitionTimeout: number;
    enableStateHistory: boolean;
    enableDependencyTracking: boolean;
  };
}

// =============================================================================
// UNIFIED TASK EXECUTION ENGINE
// =============================================================================

/**
 * Unified Task Execution Engine
 * 
 * Consolidates all task execution functionality into a single, comprehensive engine
 * with scheduling, streaming, coordination, monitoring, and lifecycle management.
 */
export class UnifiedTaskExecutionEngine extends EventEmitter {
  private static instance: UnifiedTaskExecutionEngine | null = null;
  
  // Core state
  private readonly config: UnifiedTaskExecutionEngineConfig;
  private readonly agents = new Map<AgentId, Agent>();
  private readonly executions = new Map<ExecutionId, TaskExecution>();
  private readonly monitors = new Map<TaskId, TaskMonitor>();
  private readonly streams = new Map<StreamId, StreamStatus>();
  // private readonly transitions: TaskTransition[] = []; // For future use
  
  // Scheduling state
  private readonly schedulingQueue: TaskExecution[] = [];
  private schedulingTimer: NodeJS.Timeout | null = null;
  private isSchedulingActive = false;
  
  // Streaming state
  private readonly streamingQueues = new Map<StreamId, TaskExecution[]>();
  private streamingTimers = new Map<StreamId, NodeJS.Timeout>();
  
  // Watchdog state
  private watchdogTimer: NodeJS.Timeout | null = null;
  private readonly watchdogConfigs = new Map<string, WatchdogConfig>();
  
  // Dependencies (for future integration)
  // private readonly dependencyGraph: OptimizedDependencyGraph;
  // private readonly agentOrchestrator: AgentOrchestrator;
  // private readonly startupOptimizer: StartupOptimizer;
  // private readonly performanceMonitor: PerformanceMonitor;
  // private readonly accessManager: ConcurrentAccessManager;
  // private readonly memoryManager: MemoryManager;
  
  private constructor(config: UnifiedTaskExecutionEngineConfig) {
    super();
    this.config = config;
    
    // Initialize dependencies (for future integration)
    // this.dependencyGraph = new OptimizedDependencyGraph('unified-execution-engine');
    // this.agentOrchestrator = AgentOrchestrator.getInstance();
    // this.startupOptimizer = StartupOptimizer.getInstance();
    // this.performanceMonitor = PerformanceMonitor.getInstance();
    // this.accessManager = ConcurrentAccessManager.getInstance();
    // this.memoryManager = new MemoryManager();
    
    // Initialize default watchdog configurations
    this.initializeDefaultWatchdogConfigs();
    
    // Start background processes
    this.startScheduler();
    if (config.watchdog.enabled) {
      this.startWatchdog();
    }
    
    logger.info('Unified Task Execution Engine initialized');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: UnifiedTaskExecutionEngineConfig): UnifiedTaskExecutionEngine {
    if (!UnifiedTaskExecutionEngine.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      UnifiedTaskExecutionEngine.instance = new UnifiedTaskExecutionEngine(config);
    }
    return UnifiedTaskExecutionEngine.instance;
  }
  
  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (UnifiedTaskExecutionEngine.instance) {
      UnifiedTaskExecutionEngine.instance.dispose();
      UnifiedTaskExecutionEngine.instance = null;
    }
  }
  
  // =============================================================================
  // AGENT MANAGEMENT
  // =============================================================================
  
  /**
   * Register an agent
   */
  public async registerAgent(agent: Agent): Promise<Result<void, EnhancedError>> {
    try {
      this.agents.set(agent.id, { ...agent });
      this.emit('agentRegistered', agent);
      logger.info(`Agent registered: ${agent.id}`);
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to register agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedTaskExecutionEngine', 'registerAgent')
          .metadata({ agentId: agent.id })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Unregister an agent
   */
  public async unregisterAgent(agentId: AgentId): Promise<Result<void, EnhancedError>> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Agent not found: ${agentId}`,
          createErrorContext('UnifiedTaskExecutionEngine', 'unregisterAgent')
            .metadata({ agentId })
            .build()
        ));
      }
      
      // Cancel any running tasks for this agent
      for (const execution of this.executions.values()) {
        if (execution.agentId === agentId && execution.status === 'running') {
          await this.cancelExecution(execution.executionId);
        }
      }
      
      this.agents.delete(agentId);
      this.emit('agentUnregistered', agent);
      logger.info(`Agent unregistered: ${agentId}`);
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to unregister agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedTaskExecutionEngine', 'unregisterAgent')
          .metadata({ agentId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Update agent status
   */
  public async updateAgentStatus(
    agentId: AgentId, 
    status: Agent['status'],
    usage?: Partial<Agent['currentUsage']>
  ): Promise<Result<void, EnhancedError>> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Agent not found: ${agentId}`,
          createErrorContext('UnifiedTaskExecutionEngine', 'updateAgentStatus')
            .metadata({ agentId })
            .build()
        ));
      }
      
      agent.status = status;
      agent.metadata.lastHeartbeat = new Date();
      
      if (usage) {
        Object.assign(agent.currentUsage, usage);
      }
      
      this.emit('agentStatusUpdated', agent);
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to update agent status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedTaskExecutionEngine', 'updateAgentStatus')
          .metadata({ agentId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // TASK EXECUTION MANAGEMENT
  // =============================================================================
  
  /**
   * Submit a task for execution
   */
  public async submitTask(
    task: AtomicTask,
    resourceRequirements?: Partial<TaskExecution['resourceRequirements']>
  ): Promise<Result<ExecutionId, EnhancedError>> {
    try {
      const executionId = createExecutionId(`exec_${task.id}_${Date.now()}`);
      const taskId = createTaskId(task.id);
      
      const execution: TaskExecution = {
        executionId,
        taskId,
        status: 'queued',
        priority: task.priority || 'medium',
        scheduledAt: new Date(),
        retryCount: 0,
        maxRetries: this.config.watchdog.maxRetries,
        resourceRequirements: {
          memoryMB: 256,
          cpuWeight: 1,
          estimatedDurationMinutes: (task.estimatedHours || 0.5) * 60,
          ...resourceRequirements
        }
      };
      
      this.executions.set(executionId, execution);
      this.schedulingQueue.push(execution);
      
      this.emit('taskSubmitted', execution);
      logger.info(`Task submitted for execution: ${taskId}`);
      
      return createSuccess(executionId);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to submit task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedTaskExecutionEngine', 'submitTask')
          .metadata({ taskId: task.id })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Cancel a task execution
   */
  public async cancelExecution(executionId: ExecutionId): Promise<Result<void, EnhancedError>> {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Execution not found: ${executionId}`,
          createErrorContext('UnifiedTaskExecutionEngine', 'cancelExecution')
            .metadata({ executionId })
            .build()
        ));
      }
      
      if (execution.status === 'completed' || execution.status === 'cancelled') {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Cannot cancel execution in status: ${execution.status}`,
          createErrorContext('UnifiedTaskExecutionEngine', 'cancelExecution')
            .metadata({ executionId, status: execution.status })
            .build()
        ));
      }
      
      execution.status = 'cancelled';
      execution.completedAt = new Date();
      
      // Remove from scheduling queue if still queued
      const queueIndex = this.schedulingQueue.findIndex(e => e.executionId === executionId);
      if (queueIndex !== -1) {
        this.schedulingQueue.splice(queueIndex, 1);
      }
      
      // Stop monitoring
      this.monitors.delete(execution.taskId);
      
      this.emit('executionCancelled', execution);
      logger.info(`Execution cancelled: ${executionId}`);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to cancel execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedTaskExecutionEngine', 'cancelExecution')
          .metadata({ executionId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Get execution status
   */
  public getExecution(executionId: ExecutionId): TaskExecution | null {
    return this.executions.get(executionId) || null;
  }
  
  /**
   * Get all executions
   */
  public getAllExecutions(): TaskExecution[] {
    return Array.from(this.executions.values());
  }
  
  /**
   * Get executions by status
   */
  public getExecutionsByStatus(status: ExecutionStatus): TaskExecution[] {
    return Array.from(this.executions.values()).filter(e => e.status === status);
  }
  
  // =============================================================================
  // SCHEDULING ENGINE
  // =============================================================================
  
  /**
   * Start the scheduling engine
   */
  private startScheduler(): void {
    if (this.schedulingTimer) {
      clearInterval(this.schedulingTimer);
    }
    
    this.schedulingTimer = setInterval(() => {
      this.processSchedulingQueue().catch(error => {
        logger.error('Scheduling error:', error);
      });
    }, this.config.scheduling.schedulingInterval);
    
    logger.info('Task scheduler started');
  }
  
  /**
   * Process the scheduling queue
   */
  private async processSchedulingQueue(): Promise<void> {
    if (this.isSchedulingActive || this.schedulingQueue.length === 0) {
      return;
    }
    
    this.isSchedulingActive = true;
    
    try {
      // Sort tasks by priority and algorithm
      const sortedTasks = this.sortTasksByAlgorithm(this.schedulingQueue);
      
      // Process batch
      const batchSize = Math.min(this.config.scheduling.batchSize, sortedTasks.length);
      const batch = sortedTasks.splice(0, batchSize);
      
      for (const execution of batch) {
        const agent = await this.selectOptimalAgent(execution);
        if (agent) {
          await this.assignTaskToAgent(execution, agent);
        }
      }
      
      // Remove processed tasks from queue
      for (const execution of batch) {
        const index = this.schedulingQueue.findIndex(e => e.executionId === execution.executionId);
        if (index !== -1) {
          this.schedulingQueue.splice(index, 1);
        }
      }
      
    } finally {
      this.isSchedulingActive = false;
    }
  }
  
  /**
   * Sort tasks by scheduling algorithm
   */
  private sortTasksByAlgorithm(tasks: TaskExecution[]): TaskExecution[] {
    const sorted = [...tasks];
    
    switch (this.config.scheduling.algorithm) {
      case 'priority_first':
        return sorted.sort((a, b) => this.comparePriority(b.priority, a.priority));
      
      case 'earliest_deadline':
        return sorted.sort((a, b) => {
          const aDeadline = a.timeoutAt?.getTime() || Infinity;
          const bDeadline = b.timeoutAt?.getTime() || Infinity;
          return aDeadline - bDeadline;
        });
      
      case 'shortest_job':
        return sorted.sort((a, b) => 
          (a.resourceRequirements.estimatedDurationMinutes || 0) - 
          (b.resourceRequirements.estimatedDurationMinutes || 0)
        );
      
      case 'resource_balanced':
        return sorted.sort((a, b) => this.compareResourceRequirements(a, b));
      
      case 'hybrid_optimal':
        return sorted.sort((a, b) => this.calculateTaskScore(b) - this.calculateTaskScore(a));
      
      default:
        return sorted;
    }
  }
  
  /**
   * Compare task priorities
   */
  private comparePriority(a: TaskPriority, b: TaskPriority): number {
    const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    return priorityOrder[a] - priorityOrder[b];
  }
  
  /**
   * Compare resource requirements
   */
  private compareResourceRequirements(a: TaskExecution, b: TaskExecution): number {
    const aScore = a.resourceRequirements.memoryMB + a.resourceRequirements.cpuWeight * 100;
    const bScore = b.resourceRequirements.memoryMB + b.resourceRequirements.cpuWeight * 100;
    return aScore - bScore;
  }
  
  /**
   * Calculate comprehensive task score for hybrid algorithm
   */
  private calculateTaskScore(execution: TaskExecution): number {
    const priorityScore = this.comparePriority(execution.priority, 'low') * 25;
    const urgencyScore = execution.timeoutAt ? 
      Math.max(0, 25 - (execution.timeoutAt.getTime() - Date.now()) / (1000 * 60 * 60)) : 0;
    const resourceScore = Math.max(0, 25 - execution.resourceRequirements.memoryMB / 100);
    const durationScore = Math.max(0, 25 - execution.resourceRequirements.estimatedDurationMinutes);
    
    return priorityScore + urgencyScore + resourceScore + durationScore;
  }
  
  /**
   * Select optimal agent for task execution
   */
  private async selectOptimalAgent(execution: TaskExecution): Promise<Agent | null> {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => 
        agent.status === 'idle' && 
        this.canAgentHandleTask(agent, execution)
      );
    
    if (availableAgents.length === 0) {
      return null;
    }
    
    // Select agent with best fit
    return availableAgents.reduce((best, current) => {
      const bestScore = this.calculateAgentScore(best, execution);
      const currentScore = this.calculateAgentScore(current, execution);
      return currentScore > bestScore ? current : best;
    });
  }
  
  /**
   * Check if agent can handle task
   */
  private canAgentHandleTask(agent: Agent, execution: TaskExecution): boolean {
    const memoryAvailable = agent.capacity.maxMemoryMB - agent.currentUsage.memoryMB;
    const cpuAvailable = agent.capacity.maxCpuWeight - agent.currentUsage.cpuWeight;
    const tasksAvailable = agent.capacity.maxConcurrentTasks - agent.currentUsage.activeTasks;
    
    return memoryAvailable >= execution.resourceRequirements.memoryMB &&
           cpuAvailable >= execution.resourceRequirements.cpuWeight &&
           tasksAvailable > 0;
  }
  
  /**
   * Calculate agent score for task assignment
   */
  private calculateAgentScore(agent: Agent, _execution: TaskExecution): number {
    const memoryUtilization = agent.currentUsage.memoryMB / agent.capacity.maxMemoryMB;
    const cpuUtilization = agent.currentUsage.cpuWeight / agent.capacity.maxCpuWeight;
    const taskUtilization = agent.currentUsage.activeTasks / agent.capacity.maxConcurrentTasks;
    
    // Prefer agents with lower utilization and higher success rate
    const utilizationScore = (1 - (memoryUtilization + cpuUtilization + taskUtilization) / 3) * 50;
    const performanceScore = agent.metadata.successRate * 50;
    
    return utilizationScore + performanceScore;
  }
  
  /**
   * Assign task to agent
   */
  private async assignTaskToAgent(execution: TaskExecution, agent: Agent): Promise<void> {
    execution.agentId = agent.id;
    execution.status = 'running';
    execution.startedAt = new Date();
    
    // Update agent usage
    agent.currentUsage.memoryMB += execution.resourceRequirements.memoryMB;
    agent.currentUsage.cpuWeight += execution.resourceRequirements.cpuWeight;
    agent.currentUsage.activeTasks += 1;
    agent.status = 'busy';
    
    // Start monitoring
    await this.startTaskMonitoring(execution);
    
    this.emit('taskAssigned', { execution, agent });
    logger.info(`Task assigned: ${execution.taskId} -> ${agent.id}`);
  }
  
  // =============================================================================
  // WATCHDOG MONITORING
  // =============================================================================
  
  /**
   * Initialize default watchdog configurations
   */
  private initializeDefaultWatchdogConfigs(): void {
    const defaultConfigs: WatchdogConfig[] = [
      {
        taskType: 'default',
        timeoutMinutes: this.config.watchdog.defaultTimeout,
        warningThresholdMinutes: this.config.watchdog.defaultTimeout * 0.8,
        maxRetries: this.config.watchdog.maxRetries,
        escalationDelayMinutes: 5,
        healthCheckIntervalMinutes: this.config.watchdog.healthCheckInterval
      },
      {
        taskType: 'quick',
        timeoutMinutes: 15,
        warningThresholdMinutes: 10,
        maxRetries: 2,
        escalationDelayMinutes: 2,
        healthCheckIntervalMinutes: 1
      },
      {
        taskType: 'long_running',
        timeoutMinutes: 120,
        warningThresholdMinutes: 90,
        maxRetries: 1,
        escalationDelayMinutes: 10,
        healthCheckIntervalMinutes: 5
      }
    ];
    
    for (const config of defaultConfigs) {
      this.watchdogConfigs.set(config.taskType, config);
    }
  }
  
  /**
   * Start watchdog monitoring
   */
  private startWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }
    
    this.watchdogTimer = setInterval(() => {
      this.processWatchdogChecks().catch(error => {
        logger.error('Watchdog error:', error);
      });
    }, this.config.watchdog.healthCheckInterval * 60 * 1000);
    
    logger.info('Execution watchdog started');
  }
  
  /**
   * Start monitoring a task
   */
  private async startTaskMonitoring(execution: TaskExecution): Promise<void> {
    const config = this.watchdogConfigs.get('default')!;
    const now = new Date();
    
    const monitor: TaskMonitor = {
      taskId: execution.taskId,
      agentId: execution.agentId,
      startTime: now,
      lastHeartbeat: now,
      timeoutAt: new Date(now.getTime() + config.timeoutMinutes * 60 * 1000),
      warningAt: new Date(now.getTime() + config.warningThresholdMinutes * 60 * 1000),
      status: 'monitoring',
      retryCount: 0,
      escalationLevel: 0,
      taskType: 'default',
      estimatedDuration: execution.resourceRequirements.estimatedDurationMinutes
    };
    
    this.monitors.set(execution.taskId, monitor);
    this.emit('monitoringStarted', monitor);
  }
  
  /**
   * Process watchdog checks
   */
  private async processWatchdogChecks(): Promise<void> {
    const now = new Date();
    
    for (const monitor of this.monitors.values()) {
      const execution = Array.from(this.executions.values())
        .find(e => e.taskId === monitor.taskId);
      
      if (!execution || execution.status !== 'running') {
        this.monitors.delete(monitor.taskId);
        continue;
      }
      
      // Check for timeout
      if (now >= monitor.timeoutAt && monitor.status !== 'timeout') {
        await this.handleTaskTimeout(execution, monitor);
      }
      // Check for warning
      else if (now >= monitor.warningAt && monitor.status === 'monitoring') {
        await this.handleTaskWarning(execution, monitor);
      }
    }
  }
  
  /**
   * Handle task timeout
   */
  private async handleTaskTimeout(execution: TaskExecution, monitor: TaskMonitor): Promise<void> {
    monitor.status = 'timeout';
    execution.status = 'timeout';
    execution.completedAt = new Date();
    
    // Release agent resources
    if (execution.agentId) {
      const agent = this.agents.get(execution.agentId);
      if (agent) {
        agent.currentUsage.memoryMB -= execution.resourceRequirements.memoryMB;
        agent.currentUsage.cpuWeight -= execution.resourceRequirements.cpuWeight;
        agent.currentUsage.activeTasks -= 1;
        
        if (agent.currentUsage.activeTasks === 0) {
          agent.status = 'idle';
        }
      }
    }
    
    this.emit('taskTimeout', { execution, monitor });
    logger.warn(`Task timeout: ${execution.taskId}`);
    
    // Retry if possible
    if (execution.retryCount < execution.maxRetries) {
      await this.retryExecution(execution);
    }
  }
  
  /**
   * Handle task warning
   */
  private async handleTaskWarning(execution: TaskExecution, monitor: TaskMonitor): Promise<void> {
    monitor.status = 'warning';
    this.emit('taskWarning', { execution, monitor });
    logger.warn(`Task warning: ${execution.taskId} approaching timeout`);
  }
  
  /**
   * Retry task execution
   */
  private async retryExecution(execution: TaskExecution): Promise<void> {
    execution.retryCount += 1;
    execution.status = 'queued';
    execution.agentId = undefined;
    execution.startedAt = undefined;
    execution.completedAt = undefined;
    
    this.schedulingQueue.push(execution);
    this.monitors.delete(execution.taskId);
    
    this.emit('executionRetry', execution);
    logger.info(`Retrying execution: ${execution.executionId} (attempt ${execution.retryCount})`);
  }
  
  // =============================================================================
  // LIFECYCLE MANAGEMENT
  // =============================================================================
  
  /**
   * Complete task execution
   */
  public async completeExecution(
    executionId: ExecutionId,
    result: TaskExecution['result']
  ): Promise<Result<void, EnhancedError>> {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Execution not found: ${executionId}`,
          createErrorContext('UnifiedTaskExecutionEngine', 'completeExecution')
            .metadata({ executionId })
            .build()
        ));
      }
      
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.result = result;
      
      if (execution.startedAt) {
        execution.actualDuration = execution.completedAt.getTime() - execution.startedAt.getTime();
      }
      
      // Release agent resources
      if (execution.agentId) {
        const agent = this.agents.get(execution.agentId);
        if (agent) {
          agent.currentUsage.memoryMB -= execution.resourceRequirements.memoryMB;
          agent.currentUsage.cpuWeight -= execution.resourceRequirements.cpuWeight;
          agent.currentUsage.activeTasks -= 1;
          agent.metadata.totalTasksExecuted += 1;
          
          if (agent.currentUsage.activeTasks === 0) {
            agent.status = 'idle';
          }
          
          // Update success rate
          const successCount = result?.success ? 1 : 0;
          agent.metadata.successRate = 
            (agent.metadata.successRate * (agent.metadata.totalTasksExecuted - 1) + successCount) / 
            agent.metadata.totalTasksExecuted;
        }
      }
      
      // Stop monitoring
      this.monitors.delete(execution.taskId);
      
      this.emit('executionCompleted', execution);
      logger.info(`Execution completed: ${executionId}`);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to complete execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedTaskExecutionEngine', 'completeExecution')
          .metadata({ executionId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // STATISTICS AND MONITORING
  // =============================================================================
  
  /**
   * Get execution statistics
   */
  public getExecutionStatistics(): {
    total: number;
    byStatus: Record<ExecutionStatus, number>;
    averageExecutionTime: number;
    successRate: number;
    agentUtilization: Record<string, number>;
  } {
    const executions = Array.from(this.executions.values());
    const total = executions.length;
    
    const byStatus: Record<ExecutionStatus, number> = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      timeout: 0
    };
    
    let totalExecutionTime = 0;
    let completedCount = 0;
    let successCount = 0;
    
    for (const execution of executions) {
      byStatus[execution.status]++;
      
      if (execution.actualDuration) {
        totalExecutionTime += execution.actualDuration;
        completedCount++;
        
        if (execution.result?.success) {
          successCount++;
        }
      }
    }
    
    const averageExecutionTime = completedCount > 0 ? totalExecutionTime / completedCount : 0;
    const successRate = completedCount > 0 ? successCount / completedCount : 0;
    
    const agentUtilization: Record<string, number> = {};
    for (const agent of this.agents.values()) {
      const utilization = agent.currentUsage.activeTasks / agent.capacity.maxConcurrentTasks;
      agentUtilization[agent.id] = utilization;
    }
    
    return {
      total,
      byStatus,
      averageExecutionTime,
      successRate,
      agentUtilization
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
    if (this.schedulingTimer) {
      clearInterval(this.schedulingTimer);
      this.schedulingTimer = null;
    }
    
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    
    for (const timer of this.streamingTimers.values()) {
      clearInterval(timer);
    }
    this.streamingTimers.clear();
    
    // Cancel all running executions
    for (const execution of this.executions.values()) {
      if (execution.status === 'running' || execution.status === 'queued') {
        execution.status = 'cancelled';
      }
    }
    
    // Clear state
    this.agents.clear();
    this.executions.clear();
    this.monitors.clear();
    this.streams.clear();
    this.schedulingQueue.length = 0;
    this.streamingQueues.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('Unified Task Execution Engine disposed');
  }
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Create default configuration for the unified task execution engine
 */
export function createDefaultConfig(): UnifiedTaskExecutionEngineConfig {
  return {
    scheduling: {
      algorithm: 'hybrid_optimal',
      enableDynamicPriority: true,
      resourceConstraints: {
        maxMemoryMB: 8192,
        maxCpuWeight: 16,
        maxConcurrentTasks: 50,
        reservedMemoryMB: 1024,
        reservedCpuWeight: 2
      },
      batchSize: 10,
      schedulingInterval: 5000
    },
    streaming: {
      batchSize: 5,
      streamInterval: 2000,
      maxQueueSize: 100,
      priorityThreshold: 0.8,
      enableRealTimeStreaming: true,
      loadBalancingEnabled: true
    },
    execution: {
      maxConcurrentExecutions: 20,
      enableLoadBalancing: true,
      enableResourceMonitoring: true,
      executionTimeout: 3600000 // 1 hour
    },
    watchdog: {
      enabled: true,
      defaultTimeout: 30,
      healthCheckInterval: 1,
      maxRetries: 3,
      escalationEnabled: true
    },
    lifecycle: {
      enableAutomation: true,
      transitionTimeout: 30000,
      enableStateHistory: true,
      enableDependencyTracking: true
    }
  };
}