/**
 * Agent communication and coordination types for the Vibe Task Manager
 */

/**
 * Represents the status of an agent
 */
export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline' | 'initializing';

/**
 * Represents the capabilities of an agent
 */
export type AgentCapability = 
  | 'code_generation' 
  | 'testing' 
  | 'documentation' 
  | 'research' 
  | 'deployment' 
  | 'review' 
  | 'debugging' 
  | 'optimization';

/**
 * Represents an AI agent in the system
 */
export interface Agent {
  /** Unique agent identifier */
  id: string;
  
  /** Human-readable agent name */
  name: string;
  
  /** Agent description */
  description: string;
  
  /** Current status */
  status: AgentStatus;
  
  /** Agent capabilities */
  capabilities: AgentCapability[];
  
  /** Current task assignment */
  currentTask?: string;
  
  /** Task queue */
  taskQueue: string[];
  
  /** Performance metrics */
  performance: {
    tasksCompleted: number;
    averageCompletionTime: number;
    successRate: number;
    lastActiveAt: Date;
  };
  
  /** Configuration */
  config: {
    maxConcurrentTasks: number;
    preferredTaskTypes: string[];
    workingHours?: {
      start: string;
      end: string;
      timezone: string;
    };
  };
  
  /** Communication settings */
  communication: {
    protocol: 'sentinel' | 'direct' | 'webhook';
    endpoint?: string;
    apiKey?: string;
    timeout: number;
  };
  
  /** Metadata */
  metadata: {
    createdAt: Date;
    lastUpdatedAt: Date;
    version: string;
    tags: string[];
  };
}

/**
 * Message types for agent communication
 */
export type MessageType = 
  | 'task_assignment' 
  | 'task_update' 
  | 'task_completion' 
  | 'task_error' 
  | 'status_request' 
  | 'status_response' 
  | 'heartbeat' 
  | 'shutdown' 
  | 'configuration_update';

/**
 * Represents a message in the agent communication protocol
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string;
  
  /** Message type */
  type: MessageType;
  
  /** Sender agent ID */
  from: string;
  
  /** Recipient agent ID (or 'broadcast' for all agents) */
  to: string;
  
  /** Message payload */
  payload: Record<string, unknown>;
  
  /** Message priority */
  priority: 'low' | 'normal' | 'high' | 'urgent';
  
  /** Timestamp */
  timestamp: Date;
  
  /** Expiration time */
  expiresAt?: Date;
  
  /** Whether this message requires acknowledgment */
  requiresAck: boolean;
  
  /** Correlation ID for request-response patterns */
  correlationId?: string;
  
  /** Retry count */
  retryCount: number;
  
  /** Maximum retries allowed */
  maxRetries: number;
}

/**
 * Agent task assignment information
 */
export interface TaskAssignment {
  /** Assignment ID */
  id: string;
  
  /** Task ID being assigned */
  taskId: string;
  
  /** Agent ID receiving the assignment */
  agentId: string;
  
  /** Assignment timestamp */
  assignedAt: Date;
  
  /** Expected completion time */
  expectedCompletionAt: Date;
  
  /** Assignment priority */
  priority: 'low' | 'normal' | 'high' | 'urgent';
  
  /** Assignment context */
  context: {
    projectId: string;
    epicId: string;
    dependencies: string[];
    resources: string[];
    constraints: string[];
  };
  
  /** Assignment status */
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  
  /** Progress information */
  progress: {
    percentage: number;
    currentStep: string;
    estimatedTimeRemaining: number;
    lastUpdateAt: Date;
  };
  
  /** Results (when completed) */
  results?: {
    success: boolean;
    output: string;
    artifacts: string[];
    metrics: Record<string, number>;
    logs: string[];
    errors: string[];
  };
}

/**
 * Agent coordination strategy
 */
export interface CoordinationStrategy {
  /** Strategy name */
  name: string;
  
  /** Strategy description */
  description: string;
  
  /** Load balancing algorithm */
  loadBalancing: 'round_robin' | 'least_loaded' | 'capability_based' | 'priority_based';
  
  /** Task distribution rules */
  distributionRules: {
    maxTasksPerAgent: number;
    preferredAgentTypes: Record<string, AgentCapability[]>;
    fallbackStrategy: 'queue' | 'reassign' | 'fail';
  };
  
  /** Conflict resolution */
  conflictResolution: {
    strategy: 'queue' | 'priority' | 'merge' | 'split';
    timeout: number;
    escalation: boolean;
  };
  
  /** Health monitoring */
  healthMonitoring: {
    heartbeatInterval: number;
    timeoutThreshold: number;
    retryAttempts: number;
    failoverEnabled: boolean;
  };
}

/**
 * Sentinel protocol configuration
 */
export interface SentinelProtocolConfig {
  /** Protocol version */
  version: string;
  
  /** Communication settings */
  communication: {
    port: number;
    host: string;
    secure: boolean;
    timeout: number;
    retryInterval: number;
    maxRetries: number;
  };
  
  /** Message settings */
  messaging: {
    maxMessageSize: number;
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
    batchingEnabled: boolean;
    batchSize: number;
  };
  
  /** Agent registration */
  registration: {
    autoRegister: boolean;
    registrationTimeout: number;
    capabilityValidation: boolean;
    authenticationRequired: boolean;
  };
  
  /** Monitoring and logging */
  monitoring: {
    metricsEnabled: boolean;
    loggingLevel: 'debug' | 'info' | 'warn' | 'error';
    performanceTracking: boolean;
    alertingEnabled: boolean;
  };
}

/**
 * Agent orchestration result
 */
export interface OrchestrationResult {
  /** Orchestration session ID */
  sessionId: string;
  
  /** Assigned tasks */
  assignments: TaskAssignment[];
  
  /** Orchestration status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  
  /** Overall progress */
  progress: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    percentage: number;
  };
  
  /** Performance metrics */
  metrics: {
    startTime: Date;
    endTime?: Date;
    totalDuration?: number;
    averageTaskTime: number;
    throughput: number;
    errorRate: number;
  };
  
  /** Issues encountered */
  issues: {
    type: 'agent_unavailable' | 'task_failed' | 'timeout' | 'dependency_error';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedTasks: string[];
    resolution?: string;
  }[];
  
  /** Final results */
  results?: {
    success: boolean;
    completedTasks: string[];
    failedTasks: string[];
    artifacts: string[];
    logs: string[];
  };
}
