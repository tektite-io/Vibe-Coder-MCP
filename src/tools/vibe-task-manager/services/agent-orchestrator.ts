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
  task: AtomicTask;  // Include full task object for status reporting
  agentId: string;
  assignedAt: Date;
  expectedCompletionAt: Date;
  status: 'assigned' | 'in_progress' | 'completed' | 'failed' | 'timeout';
  attempts: number;
  lastStatusUpdate: Date;
}

/**
 * Task execution options
 */
export interface ExecutionOptions {
  /** Force execution even if agent is busy */
  force?: boolean;
  /** Task priority override */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** Session ID for tracking */
  sessionId?: string;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Enable real-time progress monitoring */
  enableMonitoring?: boolean;
}

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Task assignment information */
  assignment?: TaskAssignment;
  /** Execution status */
  status: 'completed' | 'failed' | 'timeout' | 'queued' | 'in_progress';
  /** Result message */
  message: string;
  /** Execution start time */
  startTime?: Date;
  /** Execution end time */
  endTime?: Date;
  /** Agent response details */
  agentResponse?: AgentResponse;
  /** Error information if failed */
  error?: string;
  /** Whether task was queued for later execution */
  queued?: boolean;
  /** Execution metadata */
  metadata?: {
    executionId: string;
    attempts: number;
    totalDuration?: number;
    agentId?: string;
  };
}

/**
 * Agent communication channel interface
 */
export interface AgentCommunicationChannel {
  /** Send task to agent */
  sendTask(agentId: string, taskPayload: string): Promise<boolean>;
  /** Receive response from agent */
  receiveResponse(agentId: string, timeout?: number): Promise<string>;
  /** Check if agent is reachable */
  isAgentReachable(agentId: string): Promise<boolean>;
  /** Close communication channel */
  close(): Promise<void>;
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
 * Universal Agent Communication Channel
 * Supports stdio, SSE, WebSocket, and HTTP transports
 * Provides unified communication across all transport types
 */
class UniversalAgentCommunicationChannel implements AgentCommunicationChannel {
  private agentRegistry: any; // Will be imported
  private taskQueue: any; // Will be imported
  private responseProcessor: any; // Will be imported
  private websocketServer: any; // Will be imported
  private httpAgentAPI: any; // Will be imported

  constructor() {
    // Import dependencies dynamically to avoid circular imports
    this.initializeDependencies();
  }

  private async initializeDependencies(): Promise<void> {
    try {
      const { AgentRegistry } = await import('../../agent-registry/index.js');
      const { AgentTaskQueue } = await import('../../agent-tasks/index.js');
      const { AgentResponseProcessor } = await import('../../agent-response/index.js');
      const { websocketServer } = await import('../../../services/websocket-server/index.js');
      const { httpAgentAPI } = await import('../../../services/http-agent-api/index.js');

      this.agentRegistry = AgentRegistry.getInstance();
      this.taskQueue = AgentTaskQueue.getInstance();
      this.responseProcessor = AgentResponseProcessor.getInstance();
      this.websocketServer = websocketServer;
      this.httpAgentAPI = httpAgentAPI;

      logger.info('Universal agent communication channel initialized with all transports');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize universal communication channel');
      throw error;
    }
  }

  async sendTask(agentId: string, taskPayload: string): Promise<boolean> {
    try {
      // Ensure dependencies are initialized
      if (!this.agentRegistry || !this.taskQueue) {
        await this.initializeDependencies();
      }

      // Verify agent exists and is registered
      const agent = await this.agentRegistry.getAgent(agentId);
      if (!agent) {
        logger.error({ agentId }, 'Agent not found - cannot send task');
        return false;
      }

      // Parse task ID from payload for tracking
      const taskId = this.extractTaskIdFromPayload(taskPayload);

      // Create task assignment
      const taskAssignment = {
        sentinelPayload: taskPayload,
        priority: 'normal' as const,
        estimatedDuration: 1800000, // 30 minutes default
        metadata: {
          assignedBy: 'agent-orchestrator',
          assignedAt: Date.now()
        }
      };

      // Route task based on transport type
      let success = false;
      switch (agent.transportType) {
        case 'stdio':
        case 'sse':
          // Add task to queue for polling/SSE notification
          await this.taskQueue.addTask(agentId, taskAssignment);
          success = true;
          break;

        case 'websocket':
          // Send directly via WebSocket
          if (this.websocketServer) {
            success = await this.websocketServer.sendTaskToAgent(agentId, {
              taskId,
              sentinelPayload: taskPayload,
              priority: taskAssignment.priority,
              assignedAt: taskAssignment.metadata.assignedAt
            });
          }
          break;

        case 'http':
          // Send to agent's HTTP endpoint
          if (this.httpAgentAPI && agent.httpEndpoint) {
            success = await this.httpAgentAPI.deliverTaskToAgent(agent, {
              agentId,
              taskId,
              taskPayload,
              priority: taskAssignment.priority
            });
          }
          break;

        default:
          logger.error({ agentId, transportType: agent.transportType }, 'Unknown transport type');
          return false;
      }

      if (success) {
        logger.info({
          agentId,
          taskId,
          transportType: agent.transportType,
          payloadLength: taskPayload.length
        }, 'Task sent to agent via universal communication channel');
      }

      return success;

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to send task to agent');
      return false;
    }
  }

  async receiveResponse(agentId: string, timeout: number = 30000): Promise<string> {
    try {
      // Ensure dependencies are initialized
      if (!this.responseProcessor) {
        await this.initializeDependencies();
      }

      const startTime = Date.now();

      // Poll for agent responses
      while (Date.now() - startTime < timeout) {
        const responses = await this.responseProcessor.getAgentResponses(agentId);

        // Find the most recent response
        if (responses.length > 0) {
          const latestResponse = responses[responses.length - 1];

          // Format response in expected format
          const formattedResponse = this.formatAgentResponse(latestResponse);

          logger.debug({
            agentId,
            taskId: latestResponse.taskId,
            status: latestResponse.status
          }, 'Agent response received');

          return formattedResponse;
        }

        // Wait 100ms before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      throw new Error(`Timeout waiting for response from agent ${agentId}`);

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to receive response from agent');
      throw error;
    }
  }

  async isAgentReachable(agentId: string): Promise<boolean> {
    try {
      // Ensure dependencies are initialized
      if (!this.agentRegistry) {
        await this.initializeDependencies();
      }

      const agent = await this.agentRegistry.getAgent(agentId);
      if (!agent) {
        return false;
      }

      // Transport-specific reachability checks
      let isReachable = false;
      const now = Date.now();
      const lastSeen = agent.lastSeen || 0;
      const maxInactivity = 5 * 60 * 1000; // 5 minutes

      switch (agent.transportType) {
        case 'stdio':
        case 'sse':
          // Check if agent is online and recently active
          isReachable = agent.status === 'online' && (now - lastSeen) < maxInactivity;
          break;

        case 'websocket':
          // Check WebSocket connection status
          if (this.websocketServer) {
            isReachable = this.websocketServer.isAgentConnected(agentId) &&
                         agent.status === 'online' &&
                         (now - lastSeen) < maxInactivity;
          }
          break;

        case 'http':
          // For HTTP agents, check last heartbeat/polling activity
          isReachable = agent.status === 'online' && (now - lastSeen) < maxInactivity;
          break;

        default:
          isReachable = false;
      }

      logger.debug({
        agentId,
        transportType: agent.transportType,
        status: agent.status,
        lastSeen: new Date(lastSeen).toISOString(),
        isReachable
      }, 'Agent reachability check');

      return isReachable;

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to check agent reachability');
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      logger.info('Universal agent communication channel closed');
      // No cleanup needed for the universal channel
      // Individual components manage their own lifecycle
    } catch (error) {
      logger.error({ err: error }, 'Error closing universal communication channel');
    }
  }

  private extractTaskIdFromPayload(taskPayload: string): string {
    try {
      const lines = taskPayload.split('\n');
      const jsonStart = lines.findIndex(line => line.includes('{'));
      const jsonEnd = lines.findIndex(line => line.includes('### VIBE_TASK_END'));

      if (jsonStart === -1 || jsonEnd === -1) {
        return 'unknown';
      }

      const jsonPayload = lines.slice(jsonStart, jsonEnd).join('\n');
      const taskData = JSON.parse(jsonPayload);
      return taskData.metadata?.task_id || taskData.task?.id || 'unknown';

    } catch (error) {
      logger.debug({ err: error }, 'Failed to extract task ID from payload');
      return 'unknown';
    }
  }

  private formatAgentResponse(response: any): string {
    try {
      // Convert agent response to expected Sentinel Protocol format
      let formattedResponse = `VIBE_STATUS: ${response.status}\n`;

      if (response.response) {
        formattedResponse += response.response;
      }

      if (response.completionDetails) {
        const details = response.completionDetails;
        if (details.filesModified && details.filesModified.length > 0) {
          formattedResponse += `\nFiles modified: ${details.filesModified.join(', ')}`;
        }
        if (details.testsPass !== undefined) {
          formattedResponse += `\nTests passed: ${details.testsPass}`;
        }
        if (details.buildSuccessful !== undefined) {
          formattedResponse += `\nBuild successful: ${details.buildSuccessful}`;
        }
        if (details.executionTime) {
          formattedResponse += `\nExecution time: ${details.executionTime}ms`;
        }
        if (details.errorDetails) {
          formattedResponse += `\nError details: ${details.errorDetails}`;
        }
      }

      return formattedResponse;

    } catch (error) {
      logger.error({ err: error }, 'Failed to format agent response');
      return `VIBE_STATUS: ERROR\nFailed to format response: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
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

  // New execution tracking and communication
  private activeExecutions = new Map<string, TaskExecutionResult>();
  private communicationChannel: AgentCommunicationChannel;
  private executionMonitors = new Map<string, NodeJS.Timeout>();

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
    this.communicationChannel = new UniversalAgentCommunicationChannel();

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
        task: task,  // Include full task object
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
   * Execute task with complete flow: assignment, delivery, monitoring, and result processing
   */
  async executeTask(
    task: AtomicTask,
    context: ProjectContext,
    options: ExecutionOptions = {}
  ): Promise<TaskExecutionResult> {
    const executionId = `exec_${task.id}_${Date.now()}`;
    const startTime = new Date();

    // Validate task inputs
    if (!task.id || task.id.trim() === '') {
      return {
        success: false,
        status: 'failed',
        message: 'Invalid task: Task ID is required',
        startTime,
        endTime: new Date(),
        error: 'Invalid task ID',
        metadata: {
          executionId,
          attempts: 0
        }
      };
    }

    if (!task.title || task.title.trim() === '') {
      return {
        success: false,
        status: 'failed',
        message: 'Invalid task: Task title is required',
        startTime,
        endTime: new Date(),
        error: 'Invalid task title',
        metadata: {
          executionId,
          attempts: 0
        }
      };
    }

    // Set default options
    const execOptions = {
      timeout: this.config.taskTimeout,
      maxRetries: this.config.maxRetries,
      enableMonitoring: true,
      ...options
    };

    logger.info({
      taskId: task.id,
      executionId,
      options: execOptions
    }, 'Starting task execution');

    try {
      // Step 1: Assign task to agent
      const assignment = await this.assignTask(task, context);

      if (!assignment) {
        // No agents available - queue for later execution
        const result: TaskExecutionResult = {
          success: false,
          status: 'queued',
          message: 'No available agents. Task queued for execution when agents become available.',
          startTime,
          queued: true,
          metadata: {
            executionId,
            attempts: 0
          }
        };

        this.activeExecutions.set(executionId, result);
        return result;
      }

      // Step 2: Deliver task to agent
      const taskPayload = this.sentinelProtocol.formatTaskForAgent(task, context);
      const deliverySuccess = await this.communicationChannel.sendTask(assignment.agentId, taskPayload);

      if (!deliverySuccess) {
        // Task delivery failed
        await this.handleExecutionFailure(assignment, 'Task delivery failed');

        return {
          success: false,
          status: 'failed',
          message: 'Failed to deliver task to agent',
          startTime,
          endTime: new Date(),
          assignment,
          error: 'Task delivery failed',
          metadata: {
            executionId,
            attempts: assignment.attempts,
            agentId: assignment.agentId
          }
        };
      }

      // Step 3: Monitor execution and wait for completion
      const result = await this.monitorTaskExecution(assignment, execOptions, executionId, startTime);

      // Step 4: Store and return result
      this.activeExecutions.set(executionId, result);

      logger.info({
        taskId: task.id,
        executionId,
        status: result.status,
        duration: result.endTime ? result.endTime.getTime() - startTime.getTime() : undefined
      }, 'Task execution completed');

      return result;

    } catch (error) {
      logger.error({ err: error, taskId: task.id, executionId }, 'Task execution failed with error');

      const result: TaskExecutionResult = {
        success: false,
        status: 'failed',
        message: `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        startTime,
        endTime: new Date(),
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionId,
          attempts: 1
        }
      };

      this.activeExecutions.set(executionId, result);
      return result;
    }
  }

  /**
   * Monitor task execution with real-time progress tracking
   */
  private async monitorTaskExecution(
    assignment: TaskAssignment,
    options: ExecutionOptions,
    executionId: string,
    startTime: Date
  ): Promise<TaskExecutionResult> {
    const timeout = options.timeout || this.config.taskTimeout;
    const maxRetries = options.maxRetries || this.config.maxRetries;

    return new Promise((resolve) => {
      let attempts = 0;
      let timeoutHandle: NodeJS.Timeout;
      let monitoringHandle: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (monitoringHandle) clearInterval(monitoringHandle);
        this.executionMonitors.delete(executionId);
      };

      const completeExecution = (result: TaskExecutionResult) => {
        cleanup();
        resolve(result);
      };

      // Set up timeout
      timeoutHandle = setTimeout(async () => {
        logger.warn({ taskId: assignment.taskId, executionId }, 'Task execution timeout');

        if (attempts < maxRetries) {
          attempts++;
          logger.info({ taskId: assignment.taskId, attempt: attempts }, 'Retrying task execution');

          // Retry execution
          try {
            const retryResult = await this.retryTaskExecution(assignment, options, executionId, startTime, attempts);
            completeExecution(retryResult);
          } catch (error) {
            completeExecution({
              success: false,
              status: 'failed',
              message: `Retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              startTime,
              endTime: new Date(),
              assignment,
              error: error instanceof Error ? error.message : String(error),
              metadata: {
                executionId,
                attempts,
                agentId: assignment.agentId
              }
            });
          }
        } else {
          completeExecution({
            success: false,
            status: 'timeout',
            message: `Task execution timed out after ${timeout}ms`,
            startTime,
            endTime: new Date(),
            assignment,
            error: 'Execution timeout',
            metadata: {
              executionId,
              attempts,
              totalDuration: Date.now() - startTime.getTime(),
              agentId: assignment.agentId
            }
          });
        }
      }, timeout);

      // Set up monitoring
      if (options.enableMonitoring) {
        monitoringHandle = setInterval(async () => {
          try {
            // Check for agent response
            const responseText = await this.communicationChannel.receiveResponse(assignment.agentId, 1000);

            if (responseText) {
              // Process the response
              const agentResponse = this.sentinelProtocol.parseAgentResponse(responseText, assignment.taskId);

              // Update assignment status based on response
              assignment.lastStatusUpdate = new Date();

              switch (agentResponse.status) {
                case 'DONE':
                  assignment.status = 'completed';
                  completeExecution({
                    success: true,
                    status: 'completed',
                    message: 'Task completed successfully',
                    startTime,
                    endTime: new Date(),
                    assignment,
                    agentResponse,
                    metadata: {
                      executionId,
                      attempts: attempts + 1,
                      totalDuration: Date.now() - startTime.getTime(),
                      agentId: assignment.agentId
                    }
                  });
                  break;

                case 'IN_PROGRESS':
                  assignment.status = 'in_progress';
                  logger.debug({
                    taskId: assignment.taskId,
                    progress: agentResponse.progress_percentage
                  }, 'Task progress update');
                  break;

                case 'FAILED':
                  assignment.status = 'failed';
                  completeExecution({
                    success: false,
                    status: 'failed',
                    message: agentResponse.message || 'Task failed',
                    startTime,
                    endTime: new Date(),
                    assignment,
                    agentResponse,
                    error: agentResponse.message,
                    metadata: {
                      executionId,
                      attempts: attempts + 1,
                      totalDuration: Date.now() - startTime.getTime(),
                      agentId: assignment.agentId
                    }
                  });
                  break;

                case 'HELP':
                case 'BLOCKED':
                  logger.warn({
                    taskId: assignment.taskId,
                    status: agentResponse.status,
                    details: agentResponse.help_request || agentResponse.blocker_details
                  }, 'Task requires intervention');

                  completeExecution({
                    success: false,
                    status: 'failed',
                    message: `Task ${agentResponse.status.toLowerCase()}: ${agentResponse.message}`,
                    startTime,
                    endTime: new Date(),
                    assignment,
                    agentResponse,
                    error: `Task ${agentResponse.status.toLowerCase()}`,
                    metadata: {
                      executionId,
                      attempts: attempts + 1,
                      totalDuration: Date.now() - startTime.getTime(),
                      agentId: assignment.agentId
                    }
                  });
                  break;
              }
            }
          } catch (error) {
            // No response yet, continue monitoring
            logger.debug({ taskId: assignment.taskId }, 'No agent response yet, continuing to monitor');
          }
        }, 2000); // Check every 2 seconds
      }

      // Store monitoring handle for cleanup if monitoring is enabled
      if (options.enableMonitoring && monitoringHandle) {
        this.executionMonitors.set(executionId, monitoringHandle);
      }
    });
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
   * Get active executions
   */
  getActiveExecutions(): TaskExecutionResult[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution result by ID
   */
  getExecutionResult(executionId: string): TaskExecutionResult | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Cancel task execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }

    // Clean up monitoring
    const monitoringHandle = this.executionMonitors.get(executionId);
    if (monitoringHandle) {
      clearInterval(monitoringHandle);
      this.executionMonitors.delete(executionId);
    }

    // Update execution status
    execution.status = 'failed';
    execution.endTime = new Date();
    execution.error = 'Execution cancelled';
    execution.message = 'Task execution was cancelled';

    logger.info({ executionId }, 'Task execution cancelled');
    return true;
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
   * Handle execution failure
   */
  private async handleExecutionFailure(assignment: TaskAssignment, reason: string): Promise<void> {
    assignment.status = 'failed';
    assignment.lastStatusUpdate = new Date();

    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      // Remove task from agent's current tasks
      agent.currentTasks = agent.currentTasks.filter(id => id !== assignment.taskId);

      // Update agent status if no longer busy
      if (agent.currentTasks.length < agent.maxConcurrentTasks) {
        agent.status = 'available';
      }
    }

    logger.error({
      taskId: assignment.taskId,
      agentId: assignment.agentId,
      reason
    }, 'Task execution failed');
  }

  /**
   * Retry task execution
   */
  private async retryTaskExecution(
    assignment: TaskAssignment,
    options: ExecutionOptions,
    executionId: string,
    startTime: Date,
    attempt: number
  ): Promise<TaskExecutionResult> {
    logger.info({
      taskId: assignment.taskId,
      attempt,
      maxRetries: options.maxRetries
    }, 'Retrying task execution');

    try {
      // Reset assignment status
      assignment.status = 'assigned';
      assignment.attempts = attempt;
      assignment.lastStatusUpdate = new Date();

      // Get task payload again
      const agent = this.agents.get(assignment.agentId);
      if (!agent) {
        throw new Error(`Agent ${assignment.agentId} not found for retry`);
      }

      // For retry, we need to reconstruct the task and context
      // In a full implementation, these would be stored with the assignment
      // For now, return failure since we don't have the original task/context

      return {
        success: false,
        status: 'failed',
        message: `Task retry failed: Original task and context not available for retry attempt ${attempt}`,
        startTime,
        endTime: new Date(),
        assignment,
        error: 'Task and context reconstruction not implemented for retries',
        metadata: {
          executionId,
          attempts: attempt,
          totalDuration: Date.now() - startTime.getTime(),
          agentId: assignment.agentId
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId: assignment.taskId, attempt }, 'Task retry failed');
      throw error;
    }
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
  async destroy(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Clean up all execution monitors
    for (const [executionId, handle] of this.executionMonitors.entries()) {
      clearInterval(handle);
      logger.debug({ executionId }, 'Cleaned up execution monitor');
    }
    this.executionMonitors.clear();

    // Close communication channel
    if (this.communicationChannel && typeof this.communicationChannel.close === 'function') {
      await this.communicationChannel.close();
    }

    this.agents.clear();
    this.assignments.clear();
    this.activeExecutions.clear();
    this.taskQueue = [];

    AgentOrchestrator.instance = null;
    logger.info('Agent orchestrator destroyed');
  }
}
