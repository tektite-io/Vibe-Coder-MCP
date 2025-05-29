/**
 * Execution Coordinator Service for Vibe Task Manager
 *
 * Coordinates parallel task execution with resource management, load balancing,
 * and failure handling. Works with TaskScheduler to execute scheduled tasks
 * efficiently across multiple agents.
 */

import { ParallelBatch } from '../core/dependency-graph.js';
import { TaskScheduler, ScheduledTask } from './task-scheduler.js';
import logger from '../../../logger.js';

/**
 * Task execution status
 */
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Agent information and status
 */
export interface Agent {
  /** Unique agent identifier */
  id: string;

  /** Agent display name */
  name: string;

  /** Current agent status */
  status: 'idle' | 'busy' | 'offline' | 'error';

  /** Resource capacity */
  capacity: {
    maxMemoryMB: number;
    maxCpuWeight: number;
    maxConcurrentTasks: number;
  };

  /** Current resource usage */
  currentUsage: {
    memoryMB: number;
    cpuWeight: number;
    activeTasks: number;
  };

  /** Agent metadata */
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
  /** The scheduled task being executed */
  scheduledTask: ScheduledTask;

  /** Assigned agent */
  agent: Agent;

  /** Execution status */
  status: ExecutionStatus;

  /** Execution start time */
  startTime: Date;

  /** Execution end time (if completed) */
  endTime?: Date;

  /** Actual execution duration in hours */
  actualDuration?: number;

  /** Execution result or error */
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    exitCode?: number;
  };

  /** Resource usage during execution */
  resourceUsage: {
    peakMemoryMB: number;
    averageCpuWeight: number;
    networkIO?: number;
    diskIO?: number;
  };

  /** Execution metadata */
  metadata: {
    retryCount: number;
    timeoutCount: number;
    lastRetryAt?: Date;
    executionId: string;
  };
}

/**
 * Execution batch with coordination metadata
 */
export interface ExecutionBatch {
  /** The parallel batch from scheduler */
  parallelBatch: ParallelBatch;

  /** Task executions in this batch */
  executions: Map<string, TaskExecution>;

  /** Batch execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';

  /** Batch start time */
  startTime: Date;

  /** Batch end time (if completed) */
  endTime?: Date;

  /** Resource allocation for this batch */
  resourceAllocation: {
    totalMemoryMB: number;
    totalCpuWeight: number;
    agentCount: number;
  };
}

/**
 * Execution coordinator configuration
 */
export interface ExecutionConfig {
  /** Maximum concurrent batches */
  maxConcurrentBatches: number;

  /** Task execution timeout (minutes) */
  taskTimeoutMinutes: number;

  /** Maximum retry attempts */
  maxRetryAttempts: number;

  /** Retry delay (seconds) */
  retryDelaySeconds: number;

  /** Agent heartbeat interval (seconds) */
  agentHeartbeatInterval: number;

  /** Resource monitoring interval (seconds) */
  resourceMonitoringInterval: number;

  /** Enable automatic recovery */
  enableAutoRecovery: boolean;

  /** Load balancing strategy */
  loadBalancingStrategy: 'round_robin' | 'least_loaded' | 'resource_aware' | 'priority_based';
}

/**
 * Execution statistics and metrics
 */
export interface ExecutionMetrics {
  /** Total tasks executed */
  totalTasksExecuted: number;

  /** Currently running tasks */
  runningTasks: number;

  /** Queued tasks */
  queuedTasks: number;

  /** Failed tasks */
  failedTasks: number;

  /** Average execution time */
  averageExecutionTime: number;

  /** Success rate */
  successRate: number;

  /** Resource utilization */
  resourceUtilization: {
    memoryUtilization: number;
    cpuUtilization: number;
    agentUtilization: number;
  };

  /** Throughput metrics */
  throughput: {
    tasksPerHour: number;
    batchesPerHour: number;
    parallelismFactor: number;
  };
}

/**
 * Default execution configuration
 */
export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  maxConcurrentBatches: 3,
  taskTimeoutMinutes: 60,
  maxRetryAttempts: 3,
  retryDelaySeconds: 30,
  agentHeartbeatInterval: 30,
  resourceMonitoringInterval: 10,
  enableAutoRecovery: true,
  loadBalancingStrategy: 'resource_aware'
};

/**
 * Execution Coordinator Service
 *
 * Manages parallel task execution with resource allocation, load balancing,
 * and failure recovery. Coordinates with TaskScheduler for optimal execution.
 */
export class ExecutionCoordinator {
  private config: ExecutionConfig;
  private taskScheduler: TaskScheduler;
  private agents = new Map<string, Agent>();
  private activeExecutions = new Map<string, TaskExecution>();
  private executionBatches = new Map<string, ExecutionBatch>();
  private executionQueue: ScheduledTask[] = [];
  private isRunning = false;
  private coordinatorTimer: NodeJS.Timeout | null = null;
  private monitoringTimer: NodeJS.Timeout | null = null;

  constructor(
    taskScheduler: TaskScheduler,
    config: Partial<ExecutionConfig> = {}
  ) {
    this.taskScheduler = taskScheduler;
    this.config = { ...DEFAULT_EXECUTION_CONFIG, ...config };

    logger.info('ExecutionCoordinator initialized', {
      maxConcurrentBatches: this.config.maxConcurrentBatches,
      loadBalancingStrategy: this.config.loadBalancingStrategy,
      enableAutoRecovery: this.config.enableAutoRecovery
    });
  }

  /**
   * Start the execution coordinator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('ExecutionCoordinator already running');
      return;
    }

    this.isRunning = true;

    // Start coordination loop
    this.coordinatorTimer = setInterval(
      () => this.coordinationLoop(),
      1000 // Run every second
    );

    // Start resource monitoring
    this.monitoringTimer = setInterval(
      () => this.monitorResources(),
      this.config.resourceMonitoringInterval * 1000
    );

    logger.info('ExecutionCoordinator started');
  }

  /**
   * Stop the execution coordinator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop timers
    if (this.coordinatorTimer) {
      clearInterval(this.coordinatorTimer);
      this.coordinatorTimer = null;
    }

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    // Cancel running executions
    await this.cancelAllExecutions();

    logger.info('ExecutionCoordinator stopped');
  }

  /**
   * Register an agent for task execution
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);

    logger.info('Agent registered', {
      agentId: agent.id,
      agentName: agent.name,
      capacity: agent.capacity
    });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    // Cancel tasks running on this agent
    this.cancelTasksOnAgent(agentId);

    this.agents.delete(agentId);

    logger.info('Agent unregistered', { agentId });
  }

  /**
   * Execute a batch of tasks in parallel
   */
  async executeBatch(parallelBatch: ParallelBatch): Promise<ExecutionBatch> {
    const batchId = `batch_${parallelBatch.batchId}_${Date.now()}`;

    logger.info('Starting batch execution', {
      batchId,
      taskCount: parallelBatch.taskIds.length,
      estimatedDuration: parallelBatch.estimatedDuration
    });

    // Get scheduled tasks for this batch
    const currentSchedule = this.taskScheduler.getCurrentSchedule();
    if (!currentSchedule) {
      throw new Error('No current schedule available');
    }

    const scheduledTasks = parallelBatch.taskIds
      .map(taskId => currentSchedule.scheduledTasks.get(taskId))
      .filter(task => task !== undefined) as ScheduledTask[];

    // Create execution batch
    const executionBatch: ExecutionBatch = {
      parallelBatch,
      executions: new Map(),
      status: 'pending',
      startTime: new Date(),
      resourceAllocation: this.calculateBatchResourceAllocation(scheduledTasks)
    };

    // Validate resource availability
    if (!this.canExecuteBatch(executionBatch)) {
      throw new Error('Insufficient resources to execute batch');
    }

    // Create task executions
    for (const scheduledTask of scheduledTasks) {
      const agent = this.selectAgent(scheduledTask);
      if (!agent) {
        throw new Error(`No available agent for task ${scheduledTask.task.id}`);
      }

      const execution: TaskExecution = {
        scheduledTask,
        agent,
        status: 'queued',
        startTime: new Date(),
        resourceUsage: {
          peakMemoryMB: 0,
          averageCpuWeight: 0
        },
        metadata: {
          retryCount: 0,
          timeoutCount: 0,
          executionId: `exec_${scheduledTask.task.id}_${Date.now()}`
        }
      };

      executionBatch.executions.set(scheduledTask.task.id, execution);
      this.activeExecutions.set(execution.metadata.executionId, execution);
    }

    // Store batch
    this.executionBatches.set(batchId, executionBatch);

    // Start executing tasks
    executionBatch.status = 'running';
    await this.executeTasksInBatch(executionBatch);

    return executionBatch;
  }

  /**
   * Execute a single task
   */
  async executeTask(scheduledTask: ScheduledTask): Promise<TaskExecution> {
    const agent = this.selectAgent(scheduledTask);
    if (!agent) {
      throw new Error(`No available agent for task ${scheduledTask.task.id}`);
    }

    const execution: TaskExecution = {
      scheduledTask,
      agent,
      status: 'queued',
      startTime: new Date(),
      resourceUsage: {
        peakMemoryMB: 0,
        averageCpuWeight: 0
      },
      metadata: {
        retryCount: 0,
        timeoutCount: 0,
        executionId: `exec_${scheduledTask.task.id}_${Date.now()}`
      }
    };

    this.activeExecutions.set(execution.metadata.executionId, execution);

    try {
      await this.runTaskExecution(execution);
      return execution;
    } catch (error) {
      logger.error('Task execution failed', {
        taskId: scheduledTask.task.id,
        error: error instanceof Error ? error.message : String(error)
      });

      execution.status = 'failed';
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      return execution;
    }
  }

  /**
   * Get current execution metrics
   */
  getExecutionMetrics(): ExecutionMetrics {
    const executions = Array.from(this.activeExecutions.values());
    const totalExecutions = executions.length;

    const runningTasks = executions.filter(e => e.status === 'running').length;
    const queuedTasks = executions.filter(e => e.status === 'queued').length;
    const failedTasks = executions.filter(e => e.status === 'failed').length;
    const completedTasks = executions.filter(e => e.status === 'completed').length;

    const successRate = totalExecutions > 0 ? completedTasks / totalExecutions : 0;

    const completedExecutions = executions.filter(e => e.actualDuration !== undefined);
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + (e.actualDuration || 0), 0) / completedExecutions.length
      : 0;

    // Calculate resource utilization
    const totalAgentCapacity = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.capacity.maxMemoryMB,
      cpu: sum.cpu + agent.capacity.maxCpuWeight,
      agents: sum.agents + 1
    }), { memory: 0, cpu: 0, agents: 0 });

    const currentUsage = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.currentUsage.memoryMB,
      cpu: sum.cpu + agent.currentUsage.cpuWeight,
      agents: sum.agents + (agent.status === 'busy' ? 1 : 0)
    }), { memory: 0, cpu: 0, agents: 0 });

    const resourceUtilization = {
      memoryUtilization: totalAgentCapacity.memory > 0 ? currentUsage.memory / totalAgentCapacity.memory : 0,
      cpuUtilization: totalAgentCapacity.cpu > 0 ? currentUsage.cpu / totalAgentCapacity.cpu : 0,
      agentUtilization: totalAgentCapacity.agents > 0 ? currentUsage.agents / totalAgentCapacity.agents : 0
    };

    return {
      totalTasksExecuted: totalExecutions,
      runningTasks,
      queuedTasks,
      failedTasks,
      averageExecutionTime,
      successRate,
      resourceUtilization,
      throughput: {
        tasksPerHour: this.calculateTasksPerHour(),
        batchesPerHour: this.calculateBatchesPerHour(),
        parallelismFactor: this.calculateParallelismFactor()
      }
    };
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): TaskExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): TaskExecution | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Cancel a task execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }

    if (execution.status === 'running') {
      // Signal cancellation to agent
      await this.signalCancellation(execution);
    }

    execution.status = 'cancelled';
    execution.endTime = new Date();

    // Update agent status
    this.updateAgentAfterTaskCompletion(execution.agent, execution);

    // Remove from active executions
    this.activeExecutions.delete(executionId);

    logger.info('Task execution cancelled', {
      executionId,
      taskId: execution.scheduledTask.task.id
    });

    return true;
  }

  /**
   * Retry a failed task execution
   */
  async retryExecution(executionId: string): Promise<TaskExecution | null> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution || execution.status !== 'failed') {
      return null;
    }

    if (execution.metadata.retryCount >= this.config.maxRetryAttempts) {
      logger.warn('Maximum retry attempts reached', {
        executionId,
        retryCount: execution.metadata.retryCount
      });
      return null;
    }

    // Reset execution state
    execution.status = 'queued';
    execution.metadata.retryCount++;
    execution.metadata.lastRetryAt = new Date();
    execution.startTime = new Date();
    execution.endTime = undefined;
    execution.result = undefined;

    logger.info('Retrying task execution', {
      executionId,
      retryCount: execution.metadata.retryCount
    });

    try {
      await this.runTaskExecution(execution);
      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
      return execution;
    }
  }

  /**
   * Dispose of the execution coordinator
   */
  async dispose(): Promise<void> {
    await this.stop();
    this.agents.clear();
    this.activeExecutions.clear();
    this.executionBatches.clear();
    this.executionQueue = [];

    logger.info('ExecutionCoordinator disposed');
  }

  // Private helper methods

  /**
   * Main coordination loop
   */
  private async coordinationLoop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Process execution queue
      await this.processExecutionQueue();

      // Check for ready batches from scheduler
      await this.checkForReadyBatches();

      // Monitor running executions
      await this.monitorRunningExecutions();

      // Handle timeouts and failures
      await this.handleTimeoutsAndFailures();

    } catch (error) {
      logger.error('Error in coordination loop', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Process the execution queue
   */
  private async processExecutionQueue(): Promise<void> {
    if (this.executionQueue.length === 0) {
      return;
    }

    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle');

    if (availableAgents.length === 0) {
      return;
    }

    // Execute queued tasks
    const tasksToExecute = this.executionQueue.splice(0, availableAgents.length);

    for (const scheduledTask of tasksToExecute) {
      try {
        await this.executeTask(scheduledTask);
      } catch (error) {
        logger.error('Failed to execute queued task', {
          taskId: scheduledTask.task.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Check for ready batches from scheduler
   */
  private async checkForReadyBatches(): Promise<void> {
    const nextBatch = this.taskScheduler.getNextExecutionBatch();
    if (!nextBatch) {
      return;
    }

    // Check if we can execute this batch
    const currentSchedule = this.taskScheduler.getCurrentSchedule();
    if (!currentSchedule) {
      return;
    }

    const scheduledTasks = nextBatch.taskIds
      .map(taskId => currentSchedule.scheduledTasks.get(taskId))
      .filter(task => task !== undefined) as ScheduledTask[];

    if (this.canExecuteBatch({
      parallelBatch: nextBatch,
      executions: new Map(),
      status: 'pending',
      startTime: new Date(),
      resourceAllocation: this.calculateBatchResourceAllocation(scheduledTasks)
    })) {
      try {
        await this.executeBatch(nextBatch);
      } catch (error) {
        logger.error('Failed to execute batch', {
          batchId: nextBatch.batchId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Monitor running executions
   */
  private async monitorRunningExecutions(): Promise<void> {
    const runningExecutions = Array.from(this.activeExecutions.values())
      .filter(execution => execution.status === 'running');

    for (const execution of runningExecutions) {
      // Update resource usage
      await this.updateExecutionResourceUsage(execution);

      // Check for completion
      if (await this.isExecutionComplete(execution)) {
        await this.completeExecution(execution);
      }
    }
  }

  /**
   * Handle timeouts and failures
   */
  private async handleTimeoutsAndFailures(): Promise<void> {
    const now = new Date();
    const timeoutMs = this.config.taskTimeoutMinutes * 60 * 1000;

    for (const execution of this.activeExecutions.values()) {
      if (execution.status === 'running') {
        const elapsedMs = now.getTime() - execution.startTime.getTime();

        if (elapsedMs > timeoutMs) {
          logger.warn('Task execution timeout', {
            executionId: execution.metadata.executionId,
            taskId: execution.scheduledTask.task.id,
            elapsedMinutes: elapsedMs / (1000 * 60)
          });

          execution.status = 'timeout';
          execution.metadata.timeoutCount++;

          if (this.config.enableAutoRecovery &&
              execution.metadata.retryCount < this.config.maxRetryAttempts) {
            // Auto-retry after delay
            setTimeout(() => {
              this.retryExecution(execution.metadata.executionId);
            }, this.config.retryDelaySeconds * 1000);
          }
        }
      }
    }
  }

  /**
   * Execute tasks in a batch
   */
  private async executeTasksInBatch(executionBatch: ExecutionBatch): Promise<void> {
    const executions = Array.from(executionBatch.executions.values());

    // Start all tasks in parallel
    const executionPromises = executions.map(execution =>
      this.runTaskExecution(execution).catch(error => {
        logger.error('Task execution failed in batch', {
          executionId: execution.metadata.executionId,
          batchId: executionBatch.parallelBatch.batchId,
          error: error instanceof Error ? error.message : String(error)
        });

        execution.status = 'failed';
        execution.result = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      })
    );

    // Wait for all tasks to complete
    await Promise.allSettled(executionPromises);

    // Update batch status
    const allCompleted = executions.every(e =>
      e.status === 'completed' || e.status === 'failed' || e.status === 'cancelled'
    );

    if (allCompleted) {
      const hasFailures = executions.some(e => e.status === 'failed');
      executionBatch.status = hasFailures ? 'partial' : 'completed';
      executionBatch.endTime = new Date();
    }
  }

  /**
   * Run a single task execution
   */
  private async runTaskExecution(execution: TaskExecution): Promise<void> {
    execution.status = 'running';
    execution.startTime = new Date();

    // Update agent status
    this.updateAgentBeforeTaskExecution(execution.agent, execution);

    try {
      // Simulate task execution (in real implementation, this would delegate to agent)
      const result = await this.simulateTaskExecution(execution);

      execution.status = 'completed';
      execution.endTime = new Date();
      execution.actualDuration = (execution.endTime.getTime() - execution.startTime.getTime()) / (1000 * 60 * 60);
      execution.result = result;

      // Update task status in scheduler
      await this.taskScheduler.markTaskCompleted(execution.scheduledTask.task.id);

      // Remove from active executions
      this.activeExecutions.delete(execution.metadata.executionId);

      logger.info('Task execution completed', {
        executionId: execution.metadata.executionId,
        taskId: execution.scheduledTask.task.id,
        duration: execution.actualDuration
      });

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      throw error;
    } finally {
      // Update agent status
      this.updateAgentAfterTaskCompletion(execution.agent, execution);
    }
  }

  /**
   * Simulate task execution (placeholder for real agent communication)
   */
  private async simulateTaskExecution(execution: TaskExecution): Promise<{
    success: boolean;
    output?: string;
    exitCode?: number;
  }> {
    const task = execution.scheduledTask.task;
    const estimatedMs = task.estimatedHours * 60 * 60 * 1000;

    // Simulate execution time (reduced for testing)
    const actualMs = Math.min(estimatedMs, 1000); // Max 1 second for simulation

    await new Promise(resolve => setTimeout(resolve, actualMs));

    // Simulate success/failure (90% success rate)
    const success = Math.random() > 0.1;

    if (success) {
      return {
        success: true,
        output: `Task ${task.id} completed successfully`,
        exitCode: 0
      };
    } else {
      throw new Error(`Simulated failure for task ${task.id}`);
    }
  }

  /**
   * Select best agent for a task
   */
  private selectAgent(scheduledTask: ScheduledTask): Agent | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle' || agent.status === 'busy');

    if (availableAgents.length === 0) {
      return null;
    }

    switch (this.config.loadBalancingStrategy) {
      case 'round_robin':
        return this.selectAgentRoundRobin(availableAgents);

      case 'least_loaded':
        return this.selectAgentLeastLoaded(availableAgents);

      case 'resource_aware':
        return this.selectAgentResourceAware(availableAgents, scheduledTask);

      case 'priority_based':
        return this.selectAgentPriorityBased(availableAgents, scheduledTask);

      default:
        return availableAgents[0];
    }
  }

  // Agent selection strategies

  private selectAgentRoundRobin(agents: Agent[]): Agent {
    // Simple round-robin selection
    const index = Date.now() % agents.length;
    return agents[index];
  }

  private selectAgentLeastLoaded(agents: Agent[]): Agent {
    return agents.reduce((least, current) =>
      current.currentUsage.activeTasks < least.currentUsage.activeTasks ? current : least
    );
  }

  private selectAgentResourceAware(agents: Agent[], scheduledTask: ScheduledTask): Agent {
    const requiredMemory = scheduledTask.assignedResources.memoryMB;
    const requiredCpu = scheduledTask.assignedResources.cpuWeight;

    // Filter agents that can handle the resource requirements
    const capableAgents = agents.filter(agent =>
      (agent.capacity.maxMemoryMB - agent.currentUsage.memoryMB) >= requiredMemory &&
      (agent.capacity.maxCpuWeight - agent.currentUsage.cpuWeight) >= requiredCpu &&
      agent.currentUsage.activeTasks < agent.capacity.maxConcurrentTasks
    );

    if (capableAgents.length === 0) {
      return agents[0]; // Fallback to first available
    }

    // Select agent with most available resources
    return capableAgents.reduce((best, current) => {
      const bestAvailable = (best.capacity.maxMemoryMB - best.currentUsage.memoryMB) +
                           (best.capacity.maxCpuWeight - best.currentUsage.cpuWeight);
      const currentAvailable = (current.capacity.maxMemoryMB - current.currentUsage.memoryMB) +
                              (current.capacity.maxCpuWeight - current.currentUsage.cpuWeight);

      return currentAvailable > bestAvailable ? current : best;
    });
  }

  private selectAgentPriorityBased(agents: Agent[], scheduledTask: ScheduledTask): Agent {
    const taskPriority = scheduledTask.metadata.priorityScore;

    // For high priority tasks, prefer agents with better performance
    if (taskPriority > 0.8) {
      return agents.reduce((best, current) =>
        current.metadata.successRate > best.metadata.successRate ? current : best
      );
    }

    // For normal tasks, use least loaded strategy
    return this.selectAgentLeastLoaded(agents);
  }

  // Resource management methods

  private calculateBatchResourceAllocation(scheduledTasks: ScheduledTask[]): {
    totalMemoryMB: number;
    totalCpuWeight: number;
    agentCount: number;
  } {
    const totalMemoryMB = scheduledTasks.reduce((sum, task) =>
      sum + task.assignedResources.memoryMB, 0);
    const totalCpuWeight = scheduledTasks.reduce((sum, task) =>
      sum + task.assignedResources.cpuWeight, 0);
    const agentCount = new Set(scheduledTasks.map(task =>
      task.assignedResources.agentId)).size;

    return { totalMemoryMB, totalCpuWeight, agentCount };
  }

  private canExecuteBatch(executionBatch: ExecutionBatch): boolean {
    const { totalMemoryMB, totalCpuWeight, agentCount } = executionBatch.resourceAllocation;

    // Check if we have enough agents
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle' || agent.status === 'busy').length;

    if (agentCount > availableAgents) {
      return false;
    }

    // Check if we have enough total resources
    const totalCapacity = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.capacity.maxMemoryMB,
      cpu: sum.cpu + agent.capacity.maxCpuWeight
    }), { memory: 0, cpu: 0 });

    const currentUsage = Array.from(this.agents.values()).reduce((sum, agent) => ({
      memory: sum.memory + agent.currentUsage.memoryMB,
      cpu: sum.cpu + agent.currentUsage.cpuWeight
    }), { memory: 0, cpu: 0 });

    const availableMemory = totalCapacity.memory - currentUsage.memory;
    const availableCpu = totalCapacity.cpu - currentUsage.cpu;

    return availableMemory >= totalMemoryMB && availableCpu >= totalCpuWeight;
  }

  // Agent status management

  private updateAgentBeforeTaskExecution(agent: Agent, execution: TaskExecution): void {
    agent.status = 'busy';
    agent.currentUsage.memoryMB += execution.scheduledTask.assignedResources.memoryMB;
    agent.currentUsage.cpuWeight += execution.scheduledTask.assignedResources.cpuWeight;
    agent.currentUsage.activeTasks++;
    agent.metadata.lastHeartbeat = new Date();
  }

  private updateAgentAfterTaskCompletion(agent: Agent, execution: TaskExecution): void {
    agent.currentUsage.memoryMB = Math.max(0,
      agent.currentUsage.memoryMB - execution.scheduledTask.assignedResources.memoryMB);
    agent.currentUsage.cpuWeight = Math.max(0,
      agent.currentUsage.cpuWeight - execution.scheduledTask.assignedResources.cpuWeight);
    agent.currentUsage.activeTasks = Math.max(0, agent.currentUsage.activeTasks - 1);

    // Update agent statistics
    agent.metadata.totalTasksExecuted++;
    if (execution.actualDuration) {
      const currentAvg = agent.metadata.averageExecutionTime;
      const totalTasks = agent.metadata.totalTasksExecuted;
      agent.metadata.averageExecutionTime =
        (currentAvg * (totalTasks - 1) + execution.actualDuration) / totalTasks;
    }

    // Update success rate
    const wasSuccessful = execution.status === 'completed';
    const currentRate = agent.metadata.successRate;
    const totalTasks = agent.metadata.totalTasksExecuted;
    agent.metadata.successRate =
      (currentRate * (totalTasks - 1) + (wasSuccessful ? 1 : 0)) / totalTasks;

    // Update agent status
    agent.status = agent.currentUsage.activeTasks > 0 ? 'busy' : 'idle';
    agent.metadata.lastHeartbeat = new Date();
  }

  // Monitoring and utility methods

  private async updateExecutionResourceUsage(execution: TaskExecution): Promise<void> {
    // In real implementation, this would query the agent for current resource usage
    // For simulation, we'll use the assigned resources
    execution.resourceUsage.peakMemoryMB = Math.max(
      execution.resourceUsage.peakMemoryMB,
      execution.scheduledTask.assignedResources.memoryMB
    );
    execution.resourceUsage.averageCpuWeight = execution.scheduledTask.assignedResources.cpuWeight;
  }

  private async isExecutionComplete(execution: TaskExecution): Promise<boolean> {
    // In real implementation, this would check with the agent
    // For simulation, we'll check if the execution has a result
    return execution.result !== undefined;
  }

  private async completeExecution(execution: TaskExecution): Promise<void> {
    execution.status = execution.result?.success ? 'completed' : 'failed';
    execution.endTime = new Date();

    if (execution.endTime && execution.startTime) {
      execution.actualDuration =
        (execution.endTime.getTime() - execution.startTime.getTime()) / (1000 * 60 * 60);
    }

    // Remove from active executions
    this.activeExecutions.delete(execution.metadata.executionId);

    logger.info('Execution completed', {
      executionId: execution.metadata.executionId,
      taskId: execution.scheduledTask.task.id,
      status: execution.status,
      duration: execution.actualDuration
    });
  }

  private async signalCancellation(execution: TaskExecution): Promise<void> {
    // In real implementation, this would send cancellation signal to agent
    logger.info('Signaling cancellation to agent', {
      executionId: execution.metadata.executionId,
      agentId: execution.agent.id
    });
  }

  private async cancelAllExecutions(): Promise<void> {
    const activeExecutionIds = Array.from(this.activeExecutions.keys());

    for (const executionId of activeExecutionIds) {
      await this.cancelExecution(executionId);
    }
  }

  private cancelTasksOnAgent(agentId: string): void {
    const agentExecutions = Array.from(this.activeExecutions.values())
      .filter(execution => execution.agent.id === agentId);

    for (const execution of agentExecutions) {
      execution.status = 'cancelled';
      execution.endTime = new Date();
      this.activeExecutions.delete(execution.metadata.executionId);
    }
  }

  private monitorResources(): void {
    // Update agent heartbeats and detect offline agents
    const now = new Date();
    const heartbeatTimeoutMs = this.config.agentHeartbeatInterval * 2 * 1000;

    for (const agent of this.agents.values()) {
      const timeSinceHeartbeat = now.getTime() - agent.metadata.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > heartbeatTimeoutMs && agent.status !== 'offline') {
        logger.warn('Agent heartbeat timeout', {
          agentId: agent.id,
          timeSinceHeartbeat: timeSinceHeartbeat / 1000
        });

        agent.status = 'offline';
        this.cancelTasksOnAgent(agent.id);
      }
    }
  }

  // Metrics calculation methods

  private calculateTasksPerHour(): number {
    // Simple calculation based on recent completions
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCompletions = Array.from(this.activeExecutions.values())
      .filter(e => e.status === 'completed' && e.endTime && e.endTime > oneHourAgo);

    return recentCompletions.length;
  }

  private calculateBatchesPerHour(): number {
    // Simple calculation based on recent batch completions
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentBatches = Array.from(this.executionBatches.values())
      .filter(b => b.status === 'completed' && b.endTime && b.endTime > oneHourAgo);

    return recentBatches.length;
  }

  private calculateParallelismFactor(): number {
    const runningTasks = Array.from(this.activeExecutions.values())
      .filter(e => e.status === 'running').length;

    const totalAgents = this.agents.size;

    return totalAgents > 0 ? runningTasks / totalAgents : 0;
  }
}
