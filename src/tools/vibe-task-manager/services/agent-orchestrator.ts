/**
 * Agent Orchestrator Service
 *
 * Manages agent communication, coordination, and task assignment.
 * Handles multi-agent scenarios with load balancing and conflict resolution.
 */

import { AtomicTask } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import { SentinelProtocol, AgentResponse, AgentStatus } from '../cli/sentinel-protocol.js';
import { AppError, ValidationError } from '../../../utils/errors.js';
import { MemoryManager } from '../../code-map-generator/cache/memoryManager.js';
import logger from '../../../logger.js';

/**
 * Agent capability types
 */
export type AgentCapability =
  | 'frontend' | 'backend' | 'database' | 'testing' | 'devops'
  | 'documentation' | 'refactoring' | 'debugging' | 'general';

/**
 * Agent registration information
 */
export interface AgentInfo {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  maxConcurrentTasks: number;
  currentTasks: string[];
  status: 'available' | 'busy' | 'offline' | 'error';
  lastHeartbeat: Date;
  performance: {
    tasksCompleted: number;
    averageCompletionTime: number;
    successRate: number;
    lastTaskCompletedAt?: Date;
  };
  metadata: {
    version: string;
    supportedProtocols: string[];
    preferences: Record<string, any>;
  };
}

/**
 * Task assignment information
 */
export interface TaskAssignment {
  taskId: string;
  agentId: string;
  assignedAt: Date;
  expectedCompletionAt: Date;
  status: 'assigned' | 'in_progress' | 'completed' | 'failed' | 'timeout';
  attempts: number;
  lastStatusUpdate: Date;
}

/**
 * Agent orchestration configuration
 */
export interface OrchestratorConfig {
  heartbeatInterval: number;
  taskTimeout: number;
  maxRetries: number;
  loadBalancingStrategy: 'round_robin' | 'capability_based' | 'performance_based';
  enableHealthChecks: boolean;
  conflictResolutionStrategy: 'queue' | 'reassign' | 'parallel';
}

/**
 * Agent Orchestrator Service
 */
export class AgentOrchestrator {
  private static instance: AgentOrchestrator | null = null;

  private agents = new Map<string, AgentInfo>();
  private assignments = new Map<string, TaskAssignment>();
  private taskQueue: string[] = [];
  private sentinelProtocol: SentinelProtocol;
  private memoryManager: MemoryManager;
  private config: OrchestratorConfig;
  private heartbeatTimer?: NodeJS.Timeout;

  private constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      heartbeatInterval: 30000, // 30 seconds
      taskTimeout: 1800000, // 30 minutes
      maxRetries: 3,
      loadBalancingStrategy: 'capability_based',
      enableHealthChecks: true,
      conflictResolutionStrategy: 'queue',
      ...config
    };

    this.sentinelProtocol = new SentinelProtocol({
      timeout_minutes: this.config.taskTimeout / 60000
    });

    this.memoryManager = new MemoryManager();

    this.startHeartbeatMonitoring();
    logger.info({ config: this.config }, 'Agent orchestrator initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<OrchestratorConfig>): AgentOrchestrator {
    if (!AgentOrchestrator.instance) {
      AgentOrchestrator.instance = new AgentOrchestrator(config);
    }
    return AgentOrchestrator.instance;
  }

  /**
   * Register a new agent
   */
  async registerAgent(agentInfo: Omit<AgentInfo, 'lastHeartbeat' | 'performance'>): Promise<void> {
    try {
      const fullAgentInfo: AgentInfo = {
        ...agentInfo,
        lastHeartbeat: new Date(),
        performance: {
          tasksCompleted: 0,
          averageCompletionTime: 0,
          successRate: 1.0
        }
      };

      this.agents.set(agentInfo.id, fullAgentInfo);

      logger.info({
        agentId: agentInfo.id,
        capabilities: agentInfo.capabilities
      }, 'Agent registered');

      // Trigger memory cleanup if needed
      this.memoryManager.getMemoryStats();

    } catch (error) {
      logger.error({ err: error, agentId: agentInfo.id }, 'Failed to register agent');
      throw new AppError('Agent registration failed', { cause: error });
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new ValidationError(`Agent not found: ${agentId}`);
      }

      // Reassign any current tasks
      await this.reassignAgentTasks(agentId);

      this.agents.delete(agentId);

      logger.info({ agentId }, 'Agent unregistered');

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to unregister agent');
      throw new AppError('Agent unregistration failed', { cause: error });
    }
  }

  /**
   * Update agent heartbeat
   */
  updateAgentHeartbeat(agentId: string, status?: AgentInfo['status']): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = new Date();
      if (status) {
        agent.status = status;
      }

      logger.debug({ agentId, status }, 'Agent heartbeat updated');
    }
  }

  /**
   * Assign task to best available agent
   */
  async assignTask(
    task: AtomicTask,
    context: ProjectContext,
    epicTitle?: string
  ): Promise<TaskAssignment | null> {
    try {
      const availableAgent = this.selectBestAgent(task);

      if (!availableAgent) {
        // Add to queue if no agent available
        this.taskQueue.push(task.id);
        logger.info({ taskId: task.id }, 'Task queued - no available agents');
        return null;
      }

      // Create assignment
      const assignment: TaskAssignment = {
        taskId: task.id,
        agentId: availableAgent.id,
        assignedAt: new Date(),
        expectedCompletionAt: new Date(Date.now() + this.config.taskTimeout),
        status: 'assigned',
        attempts: 1,
        lastStatusUpdate: new Date()
      };

      // Update agent status
      availableAgent.currentTasks.push(task.id);
      if (availableAgent.currentTasks.length >= availableAgent.maxConcurrentTasks) {
        availableAgent.status = 'busy';
      }

      // Store assignment
      this.assignments.set(task.id, assignment);

      // Format task for agent
      const taskPayload = this.sentinelProtocol.formatTaskForAgent(task, context, epicTitle);

      logger.info({
        taskId: task.id,
        agentId: availableAgent.id,
        payload: taskPayload.substring(0, 200) + '...'
      }, 'Task assigned to agent');

      return assignment;

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to assign task');
      throw new AppError('Task assignment failed', { cause: error });
    }
  }

  /**
   * Process agent response
   */
  async processAgentResponse(responseText: string, agentId: string): Promise<void> {
    try {
      const response = this.sentinelProtocol.parseAgentResponse(responseText);
      const assignment = this.assignments.get(response.task_id);

      if (!assignment) {
        logger.warn({ taskId: response.task_id, agentId }, 'Received response for unknown task');
        return;
      }

      if (assignment.agentId !== agentId) {
        logger.warn({
          taskId: response.task_id,
          expectedAgent: assignment.agentId,
          actualAgent: agentId
        }, 'Response from unexpected agent');
        return;
      }

      // Update assignment status
      assignment.lastStatusUpdate = new Date();

      switch (response.status) {
        case 'DONE':
          await this.handleTaskCompletion(assignment, response);
          break;

        case 'HELP':
          await this.handleHelpRequest(assignment, response);
          break;

        case 'BLOCKED':
          await this.handleTaskBlocked(assignment, response);
          break;

        case 'IN_PROGRESS':
          assignment.status = 'in_progress';
          break;

        case 'FAILED':
          await this.handleTaskFailure(assignment, response);
          break;
      }

      logger.debug({
        taskId: response.task_id,
        agentId,
        status: response.status
      }, 'Agent response processed');

    } catch (error) {
      logger.error({ err: error, agentId, responseText }, 'Failed to process agent response');
      throw new AppError('Agent response processing failed', { cause: error });
    }
  }

  /**
   * Get agent statistics
   */
  getAgentStats(): {
    totalAgents: number;
    availableAgents: number;
    busyAgents: number;
    offlineAgents: number;
    totalAssignments: number;
    queuedTasks: number;
  } {
    const agents = Array.from(this.agents.values());

    return {
      totalAgents: agents.length,
      availableAgents: agents.filter(a => a.status === 'available').length,
      busyAgents: agents.filter(a => a.status === 'busy').length,
      offlineAgents: agents.filter(a => a.status === 'offline').length,
      totalAssignments: this.assignments.size,
      queuedTasks: this.taskQueue.length
    };
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get task assignments
   */
  getAssignments(): TaskAssignment[] {
    return Array.from(this.assignments.values());
  }

  /**
   * Select best agent for task based on strategy
   */
  private selectBestAgent(task: AtomicTask): AgentInfo | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent =>
        agent.status === 'available' &&
        agent.currentTasks.length < agent.maxConcurrentTasks
      );

    if (availableAgents.length === 0) {
      return null;
    }

    switch (this.config.loadBalancingStrategy) {
      case 'capability_based':
        return this.selectByCapability(availableAgents, task);

      case 'performance_based':
        return this.selectByPerformance(availableAgents);

      case 'round_robin':
      default:
        return availableAgents[0]; // Simple round-robin
    }
  }

  /**
   * Select agent by capability match
   */
  private selectByCapability(agents: AgentInfo[], task: AtomicTask): AgentInfo | null {
    // Map task types to required capabilities
    const taskCapabilityMap: Record<string, AgentCapability[]> = {
      'frontend': ['frontend', 'general'],
      'backend': ['backend', 'general'],
      'database': ['database', 'backend', 'general'],
      'testing': ['testing', 'general'],
      'documentation': ['documentation', 'general'],
      'refactoring': ['refactoring', 'general'],
      'debugging': ['debugging', 'general']
    };

    const requiredCapabilities = taskCapabilityMap[task.type] || ['general'];

    // Find agents with matching capabilities
    const capableAgents = agents.filter(agent =>
      requiredCapabilities.some(cap => agent.capabilities.includes(cap))
    );

    return capableAgents.length > 0 ? capableAgents[0] : agents[0];
  }

  /**
   * Select agent by performance metrics
   */
  private selectByPerformance(agents: AgentInfo[]): AgentInfo {
    return agents.reduce((best, current) => {
      const bestScore = best.performance.successRate * (1 / (best.performance.averageCompletionTime || 1));
      const currentScore = current.performance.successRate * (1 / (current.performance.averageCompletionTime || 1));

      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Handle task completion
   */
  private async handleTaskCompletion(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    assignment.status = 'completed';

    // Update agent performance
    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      agent.performance.tasksCompleted++;
      agent.performance.lastTaskCompletedAt = new Date();

      // Remove task from agent's current tasks
      agent.currentTasks = agent.currentTasks.filter(id => id !== assignment.taskId);

      // Update agent status if no longer busy
      if (agent.currentTasks.length < agent.maxConcurrentTasks) {
        agent.status = 'available';
      }
    }

    // Process next queued task if available
    await this.processTaskQueue();

    logger.info({
      taskId: assignment.taskId,
      agentId: assignment.agentId
    }, 'Task completed successfully');
  }

  /**
   * Handle help request
   */
  private async handleHelpRequest(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    logger.warn({
      taskId: assignment.taskId,
      agentId: assignment.agentId,
      helpRequest: response.help_request
    }, 'Agent requested help');

    // For now, just log the help request
    // In a full implementation, this could trigger human intervention
  }

  /**
   * Handle blocked task
   */
  private async handleTaskBlocked(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    logger.warn({
      taskId: assignment.taskId,
      agentId: assignment.agentId,
      blockerDetails: response.blocker_details
    }, 'Task blocked');

    // For now, just log the blocker
    // In a full implementation, this could trigger dependency resolution
  }

  /**
   * Handle task failure
   */
  private async handleTaskFailure(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    assignment.status = 'failed';
    assignment.attempts++;

    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      // Remove task from agent's current tasks
      agent.currentTasks = agent.currentTasks.filter(id => id !== assignment.taskId);

      // Update agent status
      if (agent.currentTasks.length < agent.maxConcurrentTasks) {
        agent.status = 'available';
      }
    }

    // Retry if under max attempts
    if (assignment.attempts < this.config.maxRetries) {
      this.taskQueue.unshift(assignment.taskId); // Add to front of queue for retry
      logger.info({
        taskId: assignment.taskId,
        attempt: assignment.attempts
      }, 'Task queued for retry');
    } else {
      logger.error({
        taskId: assignment.taskId,
        agentId: assignment.agentId
      }, 'Task failed after max retries');
    }
  }

  /**
   * Reassign tasks from an agent
   */
  private async reassignAgentTasks(agentId: string): Promise<void> {
    const agentAssignments = Array.from(this.assignments.values())
      .filter(assignment =>
        assignment.agentId === agentId &&
        ['assigned', 'in_progress'].includes(assignment.status)
      );

    for (const assignment of agentAssignments) {
      // Add back to queue for reassignment
      this.taskQueue.unshift(assignment.taskId);
      assignment.status = 'failed';

      logger.info({
        taskId: assignment.taskId,
        originalAgent: agentId
      }, 'Task queued for reassignment');
    }

    await this.processTaskQueue();
  }

  /**
   * Process queued tasks
   */
  private async processTaskQueue(): Promise<void> {
    while (this.taskQueue.length > 0) {
      const taskId = this.taskQueue[0];

      // Try to find an available agent
      const availableAgents = Array.from(this.agents.values())
        .filter(agent =>
          agent.status === 'available' &&
          agent.currentTasks.length < agent.maxConcurrentTasks
        );

      if (availableAgents.length === 0) {
        break; // No available agents, stop processing
      }

      // Remove from queue and process
      this.taskQueue.shift();

      // Note: In a full implementation, we'd need to retrieve the task and context
      // For now, just log that we're processing the queue
      logger.debug({ taskId }, 'Processing queued task');
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    if (!this.config.enableHealthChecks) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      this.checkAgentHealth();
    }, this.config.heartbeatInterval);
  }

  /**
   * Check agent health and mark offline if needed
   */
  private checkAgentHealth(): void {
    const now = new Date();
    const timeoutThreshold = this.config.heartbeatInterval * 3; // 3 missed heartbeats

    for (const agent of this.agents.values()) {
      const timeSinceHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > timeoutThreshold && agent.status !== 'offline') {
        agent.status = 'offline';
        logger.warn({
          agentId: agent.id,
          timeSinceHeartbeat
        }, 'Agent marked as offline due to missed heartbeats');

        // Reassign tasks from offline agent
        this.reassignAgentTasks(agent.id).catch(error => {
          logger.error({ err: error, agentId: agent.id }, 'Failed to reassign tasks from offline agent');
        });
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.agents.clear();
    this.assignments.clear();
    this.taskQueue = [];

    AgentOrchestrator.instance = null;
    logger.info('Agent orchestrator destroyed');
  }
}
