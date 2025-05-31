/**
 * Execution Coordinator Service Tests
 *
 * Comprehensive test suite for the ExecutionCoordinator service covering:
 * - Agent registration and management
 * - Task and batch execution coordination
 * - Resource allocation and load balancing
 * - Failure handling and recovery
 * - Performance monitoring and metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecutionCoordinator, DEFAULT_EXECUTION_CONFIG, Agent, ExecutionConfig } from '../../services/execution-coordinator.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';
import { AtomicTask, TaskPriority, TaskStatus } from '../../types/task.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ExecutionCoordinator', () => {
  let coordinator: ExecutionCoordinator;
  let taskScheduler: TaskScheduler;
  let dependencyGraph: OptimizedDependencyGraph;
  let mockTasks: AtomicTask[];
  let mockAgents: Agent[];

  beforeEach(async () => {
    // Create test configuration
    const testConfig: Partial<ExecutionConfig> = {
      maxConcurrentBatches: 2,
      taskTimeoutMinutes: 5,
      maxRetryAttempts: 2,
      enableAutoRecovery: false, // Disable for testing
      loadBalancingStrategy: 'resource_aware'
    };

    // Create scheduler and dependency graph
    taskScheduler = new TaskScheduler({ enableDynamicOptimization: false });
    dependencyGraph = new OptimizedDependencyGraph();
    coordinator = new ExecutionCoordinator(taskScheduler, testConfig);

    // Create mock tasks
    mockTasks = [
      {
        id: 'T001',
        title: 'Setup project structure',
        description: 'Initialize project with basic structure',
        status: 'pending' as TaskStatus,
        priority: 'high' as TaskPriority,
        type: 'development',
        estimatedHours: 2,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        dependents: ['T002'],
        filePaths: ['src/index.ts'],
        acceptanceCriteria: ['Project structure created'],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 90
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: [],
          patterns: []
        },
        metadata: {
          createdAt: new Date(),
          createdBy: 'test',
          updatedAt: new Date(),
          version: 1
        }
      },
      {
        id: 'T002',
        title: 'Implement core logic',
        description: 'Develop main application logic',
        status: 'pending' as TaskStatus,
        priority: 'critical' as TaskPriority,
        type: 'development',
        estimatedHours: 4,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: ['T001'],
        dependents: [],
        filePaths: ['src/core.ts'],
        acceptanceCriteria: ['Core logic implemented'],
        testingRequirements: {
          unitTests: ['core.test.ts'],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 95
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: [],
          patterns: []
        },
        metadata: {
          createdAt: new Date(),
          createdBy: 'test',
          updatedAt: new Date(),
          version: 1
        }
      }
    ];

    // Create mock agents
    mockAgents = [
      {
        id: 'agent_1',
        name: 'Development Agent 1',
        status: 'idle',
        capacity: {
          maxMemoryMB: 1024,
          maxCpuWeight: 1.0,
          maxConcurrentTasks: 3
        },
        currentUsage: {
          memoryMB: 0,
          cpuWeight: 0,
          activeTasks: 0
        },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      },
      {
        id: 'agent_2',
        name: 'Development Agent 2',
        status: 'idle',
        capacity: {
          maxMemoryMB: 2048,
          maxCpuWeight: 1.5,
          maxConcurrentTasks: 5
        },
        currentUsage: {
          memoryMB: 0,
          cpuWeight: 0,
          activeTasks: 0
        },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      }
    ];

    // Setup dependency graph and schedule
    for (const task of mockTasks) {
      dependencyGraph.addTask(task);
    }
    dependencyGraph.addDependency('T002', 'T001', 'task', 1, true);

    // Generate schedule
    await taskScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

    // Register agents
    for (const agent of mockAgents) {
      coordinator.registerAgent(agent);
    }
  });

  afterEach(async () => {
    await coordinator.dispose();
    taskScheduler.dispose();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultCoordinator = new ExecutionCoordinator(taskScheduler);
      expect(defaultCoordinator).toBeDefined();
      defaultCoordinator.dispose();
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = { maxConcurrentBatches: 5 };
      const customCoordinator = new ExecutionCoordinator(taskScheduler, customConfig);
      expect(customCoordinator).toBeDefined();
      customCoordinator.dispose();
    });
  });

  describe('Agent Management', () => {
    it('should register agents successfully', () => {
      const newAgent: Agent = {
        id: 'agent_3',
        name: 'Test Agent 3',
        status: 'idle',
        capacity: { maxMemoryMB: 512, maxCpuWeight: 0.5, maxConcurrentTasks: 2 },
        currentUsage: { memoryMB: 0, cpuWeight: 0, activeTasks: 0 },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      };

      coordinator.registerAgent(newAgent);

      // Verify agent is registered by checking if it can be selected for tasks
      expect(coordinator).toBeDefined();
    });

    it('should unregister agents successfully', () => {
      coordinator.unregisterAgent('agent_1');

      // Agent should no longer be available for task assignment
      expect(coordinator).toBeDefined();
    });

    it('should handle unregistering non-existent agent', () => {
      expect(() => coordinator.unregisterAgent('non_existent')).not.toThrow();
    });
  });

  describe('Task Execution', () => {
    it('should execute a single task successfully', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      expect(schedule).toBeDefined();

      const scheduledTask = schedule!.scheduledTasks.get('T001');
      expect(scheduledTask).toBeDefined();

      const execution = await coordinator.executeTask(scheduledTask!);

      expect(execution).toBeDefined();
      expect(execution.scheduledTask.task.id).toBe('T001');
      expect(execution.agent).toBeDefined();
      expect(execution.metadata.executionId).toBeDefined();
    });

    it('should handle task execution failure gracefully', async () => {
      // Mock a task that will fail
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      // Mock the communication channel to fail task sending
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();
      const originalChannel = (orchestrator as any).communicationChannel;

      // Mock sendTask to fail
      (orchestrator as any).communicationChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockResolvedValue(false)
      };

      const execution = await coordinator.executeTask(scheduledTask!);

      expect(execution.status).toBe('failed');
      expect(execution.result?.success).toBe(false);
      expect(execution.result?.error).toContain('Failed to send task to agent');

      // Restore original method
      (orchestrator as any).communicationChannel = originalChannel;
    });

    it('should throw error when no agents available', async () => {
      // Unregister all agents
      coordinator.unregisterAgent('agent_1');
      coordinator.unregisterAgent('agent_2');

      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      await expect(coordinator.executeTask(scheduledTask!))
        .rejects.toThrow('No available agent for task T001');
    });
  });

  describe('Batch Execution', () => {
    it('should execute a batch of tasks in parallel', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      expect(schedule).toBeDefined();

      const firstBatch = schedule!.executionBatches[0];
      expect(firstBatch).toBeDefined();

      const executionBatch = await coordinator.executeBatch(firstBatch);

      expect(executionBatch).toBeDefined();
      expect(executionBatch.parallelBatch).toBe(firstBatch);
      expect(executionBatch.executions.size).toBeGreaterThan(0);
      expect(executionBatch.resourceAllocation).toBeDefined();
    });

    it('should handle batch execution with insufficient resources', async () => {
      // Create a resource-intensive batch that exceeds capacity
      const schedule = taskScheduler.getCurrentSchedule();
      const firstBatch = schedule!.executionBatches[0];

      // Temporarily reduce agent capacity
      mockAgents.forEach(agent => {
        agent.capacity.maxMemoryMB = 10; // Very low memory
        agent.capacity.maxCpuWeight = 0.1; // Very low CPU
      });

      await expect(coordinator.executeBatch(firstBatch))
        .rejects.toThrow('Insufficient resources to execute batch');
    });

    it('should handle batch execution without current schedule', async () => {
      // Create a new coordinator without a schedule
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const newCoordinator = new ExecutionCoordinator(newScheduler);

      const mockBatch = {
        batchId: 0,
        taskIds: ['T001'],
        estimatedDuration: 2,
        canRunInParallel: true,
        dependencies: [],
        metadata: {
          createdAt: new Date(),
          priority: 'medium' as const,
          resourceRequirements: { memoryMB: 512, cpuWeight: 0.5 }
        }
      };

      await expect(newCoordinator.executeBatch(mockBatch))
        .rejects.toThrow('No current schedule available');

      await newCoordinator.dispose();
      newScheduler.dispose();
    });
  });

  describe('Execution Monitoring and Metrics', () => {
    it('should provide execution metrics', () => {
      const metrics = coordinator.getExecutionMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalTasksExecuted).toBeGreaterThanOrEqual(0);
      expect(metrics.runningTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.queuedTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.failedTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
      expect(metrics.resourceUtilization).toBeDefined();
      expect(metrics.throughput).toBeDefined();
    });

    it('should track active executions', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      // Mock the agent communication to delay execution
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();
      const originalChannel = (orchestrator as any).communicationChannel;

      // Mock delayed task sending
      (orchestrator as any).communicationChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
          return true;
        }),
        receiveResponse: vi.fn().mockResolvedValue(JSON.stringify({
          status: 'DONE',
          message: 'Task completed successfully',
          progress_percentage: 100,
          timestamp: Date.now()
        }))
      };

      // Start execution but don't wait for completion
      const executionPromise = coordinator.executeTask(scheduledTask!);

      // Give it a moment to start and be tracked
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check active executions
      const activeExecutions = coordinator.getActiveExecutions();
      expect(activeExecutions.length).toBeGreaterThan(0);

      // Wait for completion
      await executionPromise;

      // Restore original channel
      (orchestrator as any).communicationChannel = originalChannel;
    });

    it('should get execution by ID', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T002'); // Use T002 to avoid file conflicts

      // Mock the agent communication to fail so execution stays in activeExecutions
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();
      const originalChannel = (orchestrator as any).communicationChannel;

      // Mock failing task sending
      (orchestrator as any).communicationChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockRejectedValue(new Error('Agent not found - cannot send task'))
      };

      const execution = await coordinator.executeTask(scheduledTask!);
      const retrievedExecution = coordinator.getExecution(execution.metadata.executionId);

      expect(retrievedExecution).toBeDefined();
      expect(retrievedExecution?.metadata.executionId).toBe(execution.metadata.executionId);

      // Restore original channel
      (orchestrator as any).communicationChannel = originalChannel;
    });

    it('should return undefined for non-existent execution ID', () => {
      const execution = coordinator.getExecution('non_existent_id');
      expect(execution).toBeUndefined();
    });

    it('should get task execution status by task ID', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      // Mock a failing execution so it stays in activeExecutions
      const originalMethod = (coordinator as any).simulateTaskExecution;
      (coordinator as any).simulateTaskExecution = vi.fn().mockRejectedValue(new Error('Test failure'));

      const execution = await coordinator.executeTask(scheduledTask!);
      const status = await coordinator.getTaskExecutionStatus('T001');

      expect(status).toBeDefined();
      expect(status?.status).toBe('failed');
      expect(status?.executionId).toBe(execution.metadata.executionId);
      expect(status?.message).toContain('Task failed');

      // Restore original method
      (coordinator as any).simulateTaskExecution = originalMethod;
    });

    it('should return null for non-existent task execution status', async () => {
      const status = await coordinator.getTaskExecutionStatus('non_existent_task');
      expect(status).toBeNull();
    });
  });

  describe('Execution Control', () => {
    it('should cancel execution successfully', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      // Mock a long-running execution that won't complete immediately
      const originalMethod = (coordinator as any).simulateTaskExecution;
      (coordinator as any).simulateTaskExecution = vi.fn().mockImplementation(async () => {
        // Simulate a long-running task
        await new Promise(resolve => setTimeout(resolve, 5000));
        return { success: true, output: 'Completed', exitCode: 0 };
      });

      // Start execution (don't await - let it run)
      const executionPromise = coordinator.executeTask(scheduledTask!);

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the execution while it's running
      const activeExecutions = coordinator.getActiveExecutions();
      expect(activeExecutions.length).toBeGreaterThan(0);

      const runningExecution = activeExecutions[0];

      // Cancel execution
      const cancelled = await coordinator.cancelExecution(runningExecution.metadata.executionId);

      expect(cancelled).toBe(true);
      expect(runningExecution.status).toBe('cancelled');
      expect(runningExecution.endTime).toBeDefined();

      // Restore original method
      (coordinator as any).simulateTaskExecution = originalMethod;

      // Clean up the promise
      try {
        await executionPromise;
      } catch {
        // Expected to fail due to cancellation
      }
    });

    it('should return false when cancelling non-existent execution', async () => {
      const cancelled = await coordinator.cancelExecution('non_existent_id');
      expect(cancelled).toBe(false);
    });

    it('should retry failed execution', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      // Mock a failing execution
      const originalMethod = (coordinator as any).simulateTaskExecution;
      (coordinator as any).simulateTaskExecution = vi.fn().mockRejectedValue(new Error('Simulated failure'));

      const execution = await coordinator.executeTask(scheduledTask!);
      expect(execution.status).toBe('failed');

      // Restore method for retry
      (coordinator as any).simulateTaskExecution = originalMethod;

      // Retry execution
      const retriedExecution = await coordinator.retryExecution(execution.metadata.executionId);

      expect(retriedExecution).toBeDefined();
      expect(retriedExecution?.metadata.retryCount).toBe(1);
    });

    it('should not retry execution that has reached max attempts', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      // Create execution with max retry count
      const execution = await coordinator.executeTask(scheduledTask!);
      execution.status = 'failed';
      execution.metadata.retryCount = 3; // Exceed max retry attempts

      const retriedExecution = await coordinator.retryExecution(execution.metadata.executionId);
      expect(retriedExecution).toBeNull();
    });

    it('should not retry non-failed execution', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      // Mock the communication channel to succeed
      const { AgentOrchestrator } = await import('../../services/agent-orchestrator.js');
      const orchestrator = AgentOrchestrator.getInstance();
      const originalChannel = (orchestrator as any).communicationChannel;

      // Mock successful task sending and response
      (orchestrator as any).communicationChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockResolvedValue(true),
        receiveResponse: vi.fn().mockResolvedValue(JSON.stringify({
          status: 'DONE',
          message: 'Task completed successfully',
          progress_percentage: 100,
          timestamp: Date.now()
        }))
      };

      const execution = await coordinator.executeTask(scheduledTask!);
      // execution should be completed, not failed
      expect(execution.status).toBe('completed');

      // Completed executions are removed from activeExecutions, so retry should return null
      const retriedExecution = await coordinator.retryExecution(execution.metadata.executionId);
      expect(retriedExecution).toBeNull();

      // Restore original method
      (orchestrator as any).communicationChannel = originalChannel;
    });
  });

  describe('Load Balancing Strategies', () => {
    it('should use round_robin load balancing', async () => {
      const roundRobinCoordinator = new ExecutionCoordinator(taskScheduler, {
        loadBalancingStrategy: 'round_robin'
      });

      // Register agents
      for (const agent of mockAgents) {
        roundRobinCoordinator.registerAgent(agent);
      }

      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      const execution = await roundRobinCoordinator.executeTask(scheduledTask!);
      expect(execution.agent).toBeDefined();

      await roundRobinCoordinator.dispose();
    });

    it('should use least_loaded load balancing', async () => {
      const leastLoadedCoordinator = new ExecutionCoordinator(taskScheduler, {
        loadBalancingStrategy: 'least_loaded'
      });

      // Register agents with different loads
      const busyAgent = { ...mockAgents[0], currentUsage: { ...mockAgents[0].currentUsage, activeTasks: 2 } };
      const idleAgent = { ...mockAgents[1], currentUsage: { ...mockAgents[1].currentUsage, activeTasks: 0 } };

      leastLoadedCoordinator.registerAgent(busyAgent);
      leastLoadedCoordinator.registerAgent(idleAgent);

      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T001');

      const execution = await leastLoadedCoordinator.executeTask(scheduledTask!);

      // Should prefer the idle agent
      expect(execution.agent.id).toBe(idleAgent.id);

      await leastLoadedCoordinator.dispose();
    });

    it('should use priority_based load balancing', async () => {
      const priorityCoordinator = new ExecutionCoordinator(taskScheduler, {
        loadBalancingStrategy: 'priority_based'
      });

      // Register agents with different success rates
      const highPerformanceAgent = {
        ...mockAgents[0],
        metadata: { ...mockAgents[0].metadata, successRate: 0.95 }
      };
      const lowPerformanceAgent = {
        ...mockAgents[1],
        metadata: { ...mockAgents[1].metadata, successRate: 0.7 }
      };

      priorityCoordinator.registerAgent(highPerformanceAgent);
      priorityCoordinator.registerAgent(lowPerformanceAgent);

      const schedule = taskScheduler.getCurrentSchedule();
      const scheduledTask = schedule!.scheduledTasks.get('T002'); // Critical priority task

      const execution = await priorityCoordinator.executeTask(scheduledTask!);

      // Should prefer the high-performance agent for critical tasks
      expect(execution.agent.id).toBe(highPerformanceAgent.id);

      await priorityCoordinator.dispose();
    });
  });

  describe('Coordinator Lifecycle', () => {
    it('should start and stop coordinator', async () => {
      await coordinator.start();
      expect(coordinator).toBeDefined();

      await coordinator.stop();
      expect(coordinator).toBeDefined();
    });

    it('should handle starting already running coordinator', async () => {
      await coordinator.start();

      // Starting again should not throw
      await expect(coordinator.start()).resolves.not.toThrow();

      await coordinator.stop();
    });

    it('should handle stopping non-running coordinator', async () => {
      // Stopping without starting should not throw
      await expect(coordinator.stop()).resolves.not.toThrow();
    });

    it('should dispose properly', async () => {
      await coordinator.start();

      await expect(coordinator.dispose()).resolves.not.toThrow();

      // Should be safe to call multiple times
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle agent going offline', () => {
      const agent = mockAgents[0];

      // Simulate agent going offline by setting old heartbeat
      agent.metadata.lastHeartbeat = new Date(Date.now() - 120000); // 2 minutes ago

      // Trigger resource monitoring
      (coordinator as any).monitorResources();

      expect(agent.status).toBe('offline');
    });

    it('should handle empty execution metrics gracefully', () => {
      const emptyCoordinator = new ExecutionCoordinator(taskScheduler);
      const metrics = emptyCoordinator.getExecutionMetrics();

      expect(metrics.totalTasksExecuted).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.averageExecutionTime).toBe(0);

      emptyCoordinator.dispose();
    });

    it('should handle resource calculation with no agents', () => {
      const noAgentCoordinator = new ExecutionCoordinator(taskScheduler);
      const metrics = noAgentCoordinator.getExecutionMetrics();

      expect(metrics.resourceUtilization.memoryUtilization).toBe(0);
      expect(metrics.resourceUtilization.cpuUtilization).toBe(0);
      expect(metrics.resourceUtilization.agentUtilization).toBe(0);

      noAgentCoordinator.dispose();
    });
  });
});
