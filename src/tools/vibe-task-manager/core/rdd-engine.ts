import { performFormatAwareLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
// LLM model operations handled via config system
import { AtomicTask, TaskType, TaskPriority, FunctionalArea } from '../types/task.js';
import { AtomicTaskDetector, AtomicityAnalysis } from './atomic-detector.js';
import { ProjectContext } from '../types/project-context.js';
import { getPrompt } from '../services/prompt-service.js';
import { getTimeoutManager } from '../utils/timeout-manager.js';
import { getIdGenerator } from '../utils/id-generator.js';
import logger from '../../../logger.js';

/**
 * Circuit breaker for task decomposition to prevent infinite loops
 */
class DecompositionCircuitBreaker {
  private attempts = new Map<string, number>();
  private failures = new Map<string, number>();
  private lastAttempt = new Map<string, number>();
  private readonly maxAttempts: number;
  private readonly maxFailures: number;
  private readonly cooldownPeriod: number; // milliseconds

  constructor(maxAttempts = 3, maxFailures = 2, cooldownPeriod = 60000) {
    this.maxAttempts = maxAttempts;
    this.maxFailures = maxFailures;
    this.cooldownPeriod = cooldownPeriod;
  }

  canAttempt(taskId: string): boolean {
    const attempts = this.attempts.get(taskId) || 0;
    const failures = this.failures.get(taskId) || 0;
    const lastAttemptTime = this.lastAttempt.get(taskId) || 0;
    const now = Date.now();

    // Check if in cooldown period
    if (lastAttemptTime > 0 && (now - lastAttemptTime) < this.cooldownPeriod) {
      logger.warn({ taskId, cooldownRemaining: this.cooldownPeriod - (now - lastAttemptTime) },
        'Task decomposition in cooldown period');
      return false;
    }

    // Check attempt limits
    if (attempts >= this.maxAttempts) {
      logger.warn({ taskId, attempts, maxAttempts: this.maxAttempts },
        'Task decomposition max attempts reached');
      return false;
    }

    // Check failure limits
    if (failures >= this.maxFailures) {
      logger.warn({ taskId, failures, maxFailures: this.maxFailures },
        'Task decomposition max failures reached');
      return false;
    }

    return true;
  }

  recordAttempt(taskId: string): void {
    const attempts = this.attempts.get(taskId) || 0;
    this.attempts.set(taskId, attempts + 1);
    this.lastAttempt.set(taskId, Date.now());
  }

  recordFailure(taskId: string): void {
    const failures = this.failures.get(taskId) || 0;
    this.failures.set(taskId, failures + 1);
  }

  recordSuccess(taskId: string): void {
    // Reset counters on success
    this.attempts.delete(taskId);
    this.failures.delete(taskId);
    this.lastAttempt.delete(taskId);
  }

  getStats(taskId: string): { attempts: number; failures: number; canAttempt: boolean } {
    return {
      attempts: this.attempts.get(taskId) || 0,
      failures: this.failures.get(taskId) || 0,
      canAttempt: this.canAttempt(taskId)
    };
  }

  reset(taskId?: string): void {
    if (taskId) {
      this.attempts.delete(taskId);
      this.failures.delete(taskId);
      this.lastAttempt.delete(taskId);
    } else {
      this.attempts.clear();
      this.failures.clear();
      this.lastAttempt.clear();
    }
  }
}

/**
 * Decomposition result for a single task
 * Note: subTasks field contains the decomposed atomic tasks (not sub-tasks in the traditional sense)
 */
export interface DecompositionResult {
  success: boolean;
  isAtomic: boolean;
  originalTask: AtomicTask;
  /** Decomposed atomic tasks (named subTasks for backward compatibility) */
  subTasks: AtomicTask[];
  analysis: AtomicityAnalysis;
  error?: string;
  depth: number;
}

/**
 * Epic structure for two-phase decomposition
 */
export interface EpicStructure {
  readonly name: string;
  readonly functionalArea: 'authentication' | 'user-management' | 'content-management' | 'data-management' | 'integration' | 'admin' | 'ui-components' | 'performance';
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly estimatedComplexity: 'low' | 'medium' | 'high';
}

/**
 * Raw LLM response structure for epic identification
 */
interface EpicIdentificationResponse {
  readonly epics: ReadonlyArray<{
    readonly name: string;
    readonly functionalArea: string;
    readonly description: string;
    readonly priority?: string;
    readonly estimatedComplexity?: string;
  }>;
}

/**
 * Raw LLM response structure for task generation
 */
interface TaskGenerationResponse {
  readonly tasks: ReadonlyArray<{
    readonly title: string;
    readonly description: string;
    readonly type?: string;
    readonly priority?: string;
    readonly estimatedHours?: number;
    readonly acceptanceCriteria?: ReadonlyArray<string>;
    readonly tags?: ReadonlyArray<string>;
    readonly dependencies?: ReadonlyArray<string>;
    readonly filePaths?: ReadonlyArray<string>;
    readonly functionalArea?: string;
    readonly epicContext?: {
      readonly suggestedEpicName?: string;
      readonly epicDescription?: string;
      readonly epicJustification?: string;
    };
  }>;
}

/**
 * Configuration for RDD engine
 */
export interface RDDConfig {
  readonly maxDepth: number;
  readonly maxSubTasks: number;
  readonly minConfidence: number;
  readonly enableParallelDecomposition: boolean;
  readonly epicTimeLimit: number; // Maximum hours per epic
}

/**
 * RDD (Recursive Decomposition and Decision-making) Engine
 * Implements the core Split-Solve-Merge logic for task decomposition
 */
export class RDDEngine {
  private config: OpenRouterConfig;
  private atomicDetector: AtomicTaskDetector;
  private rddConfig: RDDConfig;
  private activeOperations: Map<string, { startTime: Date; operation: string; taskId: string }> = new Map();
  private circuitBreaker: DecompositionCircuitBreaker;

  constructor(config: OpenRouterConfig, rddConfig?: Partial<RDDConfig>) {
    this.config = config;
    
    // Initialize RDD config with defaults that can be overridden by centralized config
    // The configuration hierarchy will be applied during initialization
    this.rddConfig = {
      maxDepth: 5, // Restored to 5 for comprehensive decomposition depth
      maxSubTasks: 400, // Increased to support realistic enterprise project coverage (was artificially limited to 48)
      minConfidence: 0.8, // Increased confidence threshold for stricter atomic detection
      enableParallelDecomposition: false,
      epicTimeLimit: 400, // Configurable epic time limit (was hardcoded to 8 hours)
      ...rddConfig // Apply explicitly provided config
    };
    
    // Initialize atomic detector with consistent epic time limit configuration
    this.atomicDetector = new AtomicTaskDetector(config, {
      epicTimeLimit: this.rddConfig.epicTimeLimit
    });
    
    this.circuitBreaker = new DecompositionCircuitBreaker(3, 2, 15000); // 3 attempts, 2 failures, 15 second cooldown
    
    // Apply centralized configuration asynchronously after construction
    this.initializeCentralizedConfig().catch(error => {
      logger.debug({ err: error }, 'Could not load centralized RDD config, using defaults');
    });
  }
  
  /**
   * Initialize RDD configuration from centralized config (async)
   */
  private async initializeCentralizedConfig(): Promise<void> {
    try {
      // Dynamic import to avoid circular dependencies
      const { getVibeTaskManagerConfig } = await import('../utils/config-loader.js');
      const vibeConfig = await getVibeTaskManagerConfig();
      
      if (vibeConfig?.taskManager?.rddConfig) {
        // Apply centralized config while preserving any explicitly provided config
        const configBasedRDD = vibeConfig.taskManager.rddConfig;
        
        // Merge with existing config (preserving explicit overrides)
        this.rddConfig = {
          ...configBasedRDD, // Apply centralized config
          ...this.rddConfig // Preserve any explicitly provided overrides
        };
        
        // Update atomic detector configuration
        this.atomicDetector = new AtomicTaskDetector(this.config, {
          epicTimeLimit: this.rddConfig.epicTimeLimit
        });
        
        logger.debug({ 
          finalConfig: this.rddConfig, 
          source: 'centralized_config_merged' 
        }, 'Applied centralized RDD configuration');
      }
    } catch (error) {
      logger.debug({ err: error }, 'Could not load centralized RDD config, using defaults');
    }
  }

  /**
   * Decompose a task using RDD methodology
   */
  async decomposeTask(
    task: AtomicTask,
    context: ProjectContext,
    depth: number = 0
  ): Promise<DecompositionResult> {
    const operationId = `decompose-${task.id}-${Date.now()}`;
    this.trackOperation(operationId, 'decomposition', task.id);

    // Check circuit breaker before attempting decomposition
    if (!this.circuitBreaker.canAttempt(task.id)) {
      const stats = this.circuitBreaker.getStats(task.id);
      logger.warn({
        taskId: task.id,
        depth,
        circuitBreakerStats: stats
      }, 'Circuit breaker preventing decomposition attempt');

      this.completeOperation(operationId);
      return {
        success: true,
        isAtomic: true, // Force atomic to prevent further attempts
        originalTask: task,
        subTasks: [],
        analysis: {
          isAtomic: true,
          confidence: 0.9,
          reasoning: 'Task marked as atomic due to circuit breaker protection (too many failed decomposition attempts)',
          estimatedHours: task.estimatedHours,
          complexityFactors: ['circuit_breaker_protection', 'decomposition_failure_limit'],
          recommendations: ['Manual task breakdown recommended', 'Review task complexity']
        },
        error: 'Circuit breaker protection activated',
        depth
      };
    }

    // Record decomposition attempt
    this.circuitBreaker.recordAttempt(task.id);

    logger.info({ taskId: task.id, depth, operationId }, 'Starting RDD decomposition');

    try {
      // Check depth limit
      if (depth >= this.rddConfig.maxDepth) {
        logger.warn({ taskId: task.id, depth }, 'Maximum decomposition depth reached');
        return {
          success: true,
          isAtomic: true, // Force atomic at max depth
          originalTask: task,
          subTasks: [],
          analysis: await this.atomicDetector.analyzeTask(task, context),
          depth
        };
      }

      // SOLVE: Analyze if task is atomic
      this.emitTaskProgress(task.id, 'decomposition', 'progress', 25, 'Analyzing task atomicity');
      const analysis = await this.atomicDetector.analyzeTask(task, context);

      // If atomic with high confidence, return as-is
      if (analysis.isAtomic && analysis.confidence >= this.rddConfig.minConfidence) {
        logger.info({ taskId: task.id, confidence: analysis.confidence }, 'Task determined to be atomic');
        this.circuitBreaker.recordSuccess(task.id); // Record success for atomic task
        this.completeOperation(operationId);
        return {
          success: true,
          isAtomic: true,
          originalTask: task,
          subTasks: [],
          analysis,
          depth
        };
      }

      // SPLIT: Epic-first decomposition strategy
      this.emitTaskProgress(task.id, 'decomposition', 'progress', 50, 'Using epic-first decomposition strategy');
      
      // Try epic-first approach first
      logger.info({ taskId: task.id }, 'Attempting epic-first decomposition as primary strategy');
      try {
        const epicResult = await this.decomposeTaskWithEpics(task, context, depth);
        if (epicResult.success && epicResult.subTasks && epicResult.subTasks.length > 0) {
          logger.info({ 
            taskId: task.id, 
            epicCount: epicResult.subTasks.length,
            functionalAreas: [...new Set(epicResult.subTasks.map(t => t.functionalArea))] 
          }, 'Epic-first decomposition successful');
          this.circuitBreaker.recordSuccess(task.id);
          this.completeOperation(operationId);
          return epicResult;
        }
      } catch (error) {
        logger.warn({ taskId: task.id, error: error instanceof Error ? error.message : 'Unknown error' }, 
          'Epic-first decomposition failed, falling back to traditional approach');
      }
      
      // Fallback to traditional single-phase decomposition
      this.emitTaskProgress(task.id, 'decomposition', 'progress', 60, 'Falling back to traditional decomposition');
      const subTasks = await this.splitTask(task, context, analysis);

      if (subTasks.length === 0) {
        logger.warn({ taskId: task.id }, 'No sub-tasks generated, treating as atomic');
        this.circuitBreaker.recordFailure(task.id); // Record failure for failed decomposition
        this.completeOperation(operationId);
        return {
          success: true,
          isAtomic: true,
          originalTask: task,
          subTasks: [],
          analysis,
          depth
        };
      }

      // MERGE: Process decomposed tasks recursively if needed
      this.emitTaskProgress(task.id, 'decomposition', 'progress', 75, 'Processing decomposed sub-tasks');
      const processedSubTasks = await this.processDecomposedTasks(subTasks, context, depth + 1);

      logger.info({
        taskId: task.id,
        decomposedTaskCount: processedSubTasks.length,
        depth,
        operationId
      }, 'RDD decomposition completed');

      this.circuitBreaker.recordSuccess(task.id); // Record success for successful decomposition
      this.completeOperation(operationId);
      return {
        success: true,
        isAtomic: false,
        originalTask: task,
        subTasks: processedSubTasks,
        analysis,
        depth
      };

    } catch (error) {
      this.completeOperation(operationId);
      return this.handleDecompositionFailure(task, error instanceof Error ? error : 'Unknown error', {
        depth,
        isRecursive: false,
        operationId
      });
    }
  }

  /**
   * Split a task into sub-tasks using LLM
   */
  private async splitTask(
    task: AtomicTask,
    context: ProjectContext,
    analysis: AtomicityAnalysis
  ): Promise<AtomicTask[]> {
    logger.debug({ taskId: task.id }, 'Splitting task into sub-tasks');

    try {
      let splitPrompt = this.buildSplitPrompt(task, context, analysis);
      const systemPrompt = await getPrompt('decomposition');

      // Perform LLM call with retry mechanism for parsing failures
      const timeoutManager = getTimeoutManager();
      let response: string = '';
      let subTasks: AtomicTask[] = [];
      let retryCount = 0;
      const maxRetries = 2; // Allow up to 2 retries for parsing failures
      const llmCallStartTime = Date.now();
      
      while (retryCount <= maxRetries) {
        try {
          response = await timeoutManager.raceWithTimeout(
            'llmRequest',
            performFormatAwareLlmCall(
              splitPrompt,
              systemPrompt,
              this.config,
              'task_decomposition',
              'json', // Explicitly specify JSON format for task decomposition
              undefined, // Schema will be inferred from task name
              retryCount === 0 ? 0.2 : 0.3 + (retryCount * 0.1) // Increase temperature on retries
            )
          );

          subTasks = await this.parseSplitResponse(response, task);
          
          // Emit progress for successful parsing
          this.emitTaskProgress(task.id, 'decomposition', 'progress', 60, 
            `Successfully parsed ${subTasks.length} sub-tasks from LLM response`);
          
          // Log successful LLM parsing metrics
          const totalLlmTime = Date.now() - llmCallStartTime;
          logger.info({
            taskId: task.id,
            retryCount,
            totalLlmTime,
            responseLength: response.length,
            parsedTaskCount: subTasks.length,
            performance: {
              llmLatency: totalLlmTime,
              retries: retryCount,
              parseSuccess: true,
              timestamp: new Date().toISOString()
            }
          }, 'LLM response parsing: successful task decomposition');
          
          break; // Success, exit retry loop
          
        } catch (parseError) {
          const parseErrorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
          
          // Check if this is a contextualInsights-only response that might benefit from retry
          const isContextualInsightsError = parseErrorMessage.includes('contextualInsights without tasks array');
          const isEmptyTasksError = parseErrorMessage.includes('Empty tasks array');
          const isInvalidFormatError = parseErrorMessage.includes('Invalid response format');
          const isAnalysisOnlyError = parseErrorMessage.includes('analysis fields') && parseErrorMessage.includes('without tasks array');
          
          if ((isContextualInsightsError || isEmptyTasksError || isInvalidFormatError || isAnalysisOnlyError) && retryCount < maxRetries) {
            retryCount++;
            const partialLlmTime = Date.now() - llmCallStartTime;
            logger.warn({
              taskId: task.id,
              retryCount,
              maxRetries,
              parseError: parseErrorMessage,
              retryReason: 'LLM response parsing failed, retrying with different temperature',
              partialLlmTime,
              responseLength: response?.length || 0,
              errorType: isContextualInsightsError ? 'contextual_insights_only' : 
                         isEmptyTasksError ? 'empty_tasks_array' : 
                         isAnalysisOnlyError ? 'analysis_only' : 'invalid_format',
              performance: {
                llmLatency: partialLlmTime,
                retries: retryCount,
                parseSuccess: false,
                errorCategory: isContextualInsightsError ? 'contextual_insights_only' : 
                              isEmptyTasksError ? 'empty_tasks_array' : 'invalid_format',
                timestamp: new Date().toISOString()
              }
            }, 'LLM response parsing: retry attempt due to parsing failure');
            
            // Modify the prompt slightly for retry to encourage better response format
            if (retryCount === 1) {
              if (isAnalysisOnlyError) {
                splitPrompt = `${splitPrompt}\n\nIMPORTANT: You MUST respond with a JSON object containing BOTH "contextualInsights" AND "tasks" array. Do not respond with only codebaseAlignment, researchIntegration, technologySpecifics, estimationFactors. The response must include actionable tasks in a "tasks" array.`;
              } else {
                splitPrompt = `${splitPrompt}\n\nIMPORTANT: You MUST respond with a JSON object containing a "tasks" array. Do not respond with only contextualInsights or analysis. The response must include actionable tasks.`;
              }
            } else if (retryCount === 2) {
              splitPrompt = `${splitPrompt}\n\nCRITICAL: Respond ONLY with valid JSON format: {"contextualInsights": {"codebaseAlignment": "...", "researchIntegration": "...", "technologySpecifics": "...", "estimationFactors": "..."}, "tasks": [{"title": "...", "description": "...", "type": "...", "priority": "...", "estimatedHours": 0.1}]}. No additional text or analysis.`;
            }
            continue; // Try again
          }
          
          // If not a retryable error or max retries reached, log final failure and throw
          const finalLlmTime = Date.now() - llmCallStartTime;
          logger.error({
            taskId: task.id,
            retryCount,
            maxRetries,
            finalLlmTime,
            parseError: parseErrorMessage,
            errorType: isContextualInsightsError ? 'contextual_insights_only' : 
                       isEmptyTasksError ? 'empty_tasks_array' : 
                       isAnalysisOnlyError ? 'analysis_only' :
                       isInvalidFormatError ? 'invalid_format' : 'other',
            performance: {
              llmLatency: finalLlmTime,
              retries: retryCount,
              parseSuccess: false,
              finalFailure: true,
              timestamp: new Date().toISOString()
            }
          }, 'LLM response parsing: final failure, falling back to atomic task generation');
          
          throw parseError;
        }
      }

      // Validate and limit decomposed tasks
      const validatedSubTasks = this.validateDecomposedTasks(subTasks, task);

      logger.info({
        taskId: task.id,
        decomposedTaskCount: validatedSubTasks.length
      }, 'Task split completed');

      return validatedSubTasks;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');

      // Enhanced error context logging
      const errorContext = {
        err: error,
        taskId: task.id,
        operation: 'task_splitting',
        taskTitle: task.title,
        taskType: task.type,
        taskPriority: task.priority,
        estimatedHours: task.estimatedHours,
        projectId: task.projectId,
        epicId: task.epicId,
        contextSize: context ? {
          languagesCount: context.languages?.length || 0,
          frameworksCount: context.frameworks?.length || 0,
          complexity: context.complexity
        } : null,
        stackTrace: error instanceof Error ? error.stack : undefined
      };

      if (isTimeout) {
        logger.error({
          ...errorContext,
          timeout: true,
          timeoutType: 'llm_call'
        }, 'Task splitting timed out - LLM call exceeded timeout limit');
      } else {
        logger.error(errorContext, 'Failed to split task - comprehensive error context captured');
      }

      // Return empty array to trigger fallback to atomic task handling
      return [];
    }
  }

  /**
   * Process decomposed tasks recursively if they need further decomposition
   */
  private async processDecomposedTasks(
    decomposedTasks: AtomicTask[],
    context: ProjectContext,
    depth: number
  ): Promise<AtomicTask[]> {
    const processedTasks: AtomicTask[] = [];

    for (const task of decomposedTasks) {
      // Check circuit breaker before processing each task
      if (!this.circuitBreaker.canAttempt(task.id)) {
        const stats = this.circuitBreaker.getStats(task.id);
        logger.warn({
          taskId: task.id,
          depth,
          circuitBreakerStats: stats,
          isRecursiveCall: true
        }, 'Circuit breaker preventing recursive decomposition attempt');

        // Force task to be atomic due to circuit breaker
        processedTasks.push(task);
        continue;
      }

      // Quick atomic check for decomposed tasks
      const quickAnalysis = await this.atomicDetector.analyzeTask(task, context);

      if (quickAnalysis.isAtomic && quickAnalysis.confidence >= this.rddConfig.minConfidence) {
        // Task is atomic, add as-is
        this.circuitBreaker.recordSuccess(task.id);
        processedTasks.push(task);
      } else if (depth < this.rddConfig.maxDepth) {
        // Task needs further decomposition with centralized timeout protection
        this.circuitBreaker.recordAttempt(task.id);

        try {
          const timeoutManager = getTimeoutManager();
          const decompositionResult = await timeoutManager.raceWithTimeout(
            'recursiveTaskDecomposition',
            this.decomposeTask(task, context, depth)
          );

          if (decompositionResult.success && decompositionResult.subTasks.length > 0) {
            this.circuitBreaker.recordSuccess(task.id);
            processedTasks.push(...decompositionResult.subTasks);
          } else {
            // Decomposition failed - record failure and keep original task
            this.circuitBreaker.recordFailure(task.id);
            logger.warn({
              taskId: task.id,
              depth,
              isRecursiveCall: true,
              decompositionSuccess: decompositionResult.success,
              subTaskCount: decompositionResult.subTasks?.length || 0
            }, 'Recursive decomposition failed to generate sub-tasks, keeping original task as atomic');
            processedTasks.push(task);
          }
        } catch (error) {
          this.circuitBreaker.recordFailure(task.id);
          logger.warn({
            err: error,
            taskId: task.id,
            depth,
            isRecursiveCall: true
          }, 'Recursive task decomposition failed or timed out, keeping task as atomic');
          processedTasks.push(task);
        }
      } else {
        // Max depth reached, keep as-is
        logger.info({
          taskId: task.id,
          depth,
          maxDepth: this.rddConfig.maxDepth
        }, 'Maximum decomposition depth reached, keeping task as-is');
        processedTasks.push(task);
      }
    }

    return processedTasks;
  }

  /**
   * Two-phase decomposition: First identify epics, then generate tasks within epics
   * This replaces the traditional single-phase approach with epic-aware decomposition
   */
  async decomposeTaskWithEpics(
    task: AtomicTask,
    context: ProjectContext,
    depth: number = 0
  ): Promise<DecompositionResult> {
    const operationId = `epic-decompose-${task.id}-${Date.now()}`;
    this.trackOperation(operationId, 'epic_decomposition', task.id);

    logger.info({ taskId: task.id, depth, operationId }, 'Starting two-phase epic-aware decomposition');

    try {
      // PHASE 1: Epic Identification
      this.emitTaskProgress(task.id, 'decomposition', 'progress', 25, 'Identifying functional areas and epics');
      const epicStructure = await this.identifyEpicStructure(task, context);

      if (!epicStructure || epicStructure.length === 0) {
        logger.warn({ taskId: task.id }, 'No epics identified, falling back to traditional decomposition');
        return await this.decomposeTask(task, context, depth);
      }

      // PHASE 2: Task Generation Within Epics
      this.emitTaskProgress(task.id, 'decomposition', 'progress', 50, 'Generating atomic tasks within epic boundaries');
      const allSubTasks: AtomicTask[] = [];

      for (const epic of epicStructure) {
        const epicTasks = await this.generateTasksForEpic(task, epic, context);
        allSubTasks.push(...epicTasks);
      }

      if (allSubTasks.length === 0) {
        logger.warn({ taskId: task.id }, 'No tasks generated in epic-aware decomposition, falling back to traditional');
        return await this.decomposeTask(task, context, depth);
      }

      // Process recursively if needed
      this.emitTaskProgress(task.id, 'decomposition', 'progress', 75, 'Processing epic-aware sub-tasks');
      const processedSubTasks = await this.processDecomposedTasks(allSubTasks, context, depth + 1);

      logger.info({
        taskId: task.id,
        epicsIdentified: epicStructure.length,
        tasksGenerated: processedSubTasks.length,
        depth,
        operationId
      }, 'Two-phase epic-aware decomposition completed');

      this.completeOperation(operationId);
      return {
        success: true,
        isAtomic: false,
        originalTask: task,
        subTasks: processedSubTasks,
        analysis: {
          isAtomic: false,
          confidence: 0.95,
          reasoning: 'Successfully decomposed using two-phase epic-aware strategy',
          estimatedHours: processedSubTasks.reduce((sum, t) => sum + t.estimatedHours, 0),
          complexityFactors: ['epic_based_decomposition', 'functional_area_grouping'],
          recommendations: ['Tasks organized by epic boundaries', 'Natural feature grouping applied']
        },
        depth
      };

    } catch (error) {
      this.completeOperation(operationId);
      logger.warn({
        err: error,
        taskId: task.id,
        depth
      }, 'Epic-aware decomposition failed, falling back to traditional approach');
      
      // Fallback to traditional decomposition
      return await this.decomposeTask(task, context, depth);
    }
  }

  /**
   * PHASE 1: Identify epic structure and functional areas
   */
  private async identifyEpicStructure(
    task: AtomicTask,
    context: ProjectContext
  ): Promise<EpicStructure[]> {
    logger.debug({ taskId: task.id }, 'Identifying epic structure for task');

    const epicPrompt = `Analyze this task and identify the natural functional areas and epic boundaries:

TASK TO ANALYZE:
- Title: ${task.title}
- Description: ${task.description}
- Type: ${task.type}

PROJECT CONTEXT:
- Languages: ${context.languages?.join(', ') || 'not specified'}
- Frameworks: ${context.frameworks?.join(', ') || 'not specified'}
- Build Tools: ${context.buildTools?.join(', ') || 'not specified'}

Identify all major functional areas (epics) needed for this work. Create as many epics as necessary to properly organize the project - no artificial limits.

VALID FUNCTIONAL AREAS (choose from these only):
- authentication: User login, security, and access control features
- user-management: User profiles, preferences, and account management
- content-management: Content creation, editing, and organization
- data-management: Data storage, retrieval, and processing
- integration: External API connections and third-party services
- admin: Administrative functions and system configuration
- ui-components: User interface components and interactions
- performance: Optimization, caching, and efficiency improvements
- frontend: Client-side logic, React/Vue/Angular components, UI state management
- backend: Server-side logic, APIs, business rules, middleware, services
- database: Schema design, migrations, queries, indexes, data optimization

EPIC COUNT GUIDANCE (based on project complexity):
- Small features (1-2 days work): 1-3 epics
- Medium features (1 week work): 3-7 epics
- Large features (2-4 weeks work): 7-15 epics
- Enterprise features (1+ months work): 15-30+ epics

Multiple epics can share the same functionalArea if they represent different aspects of that area.
For example: "User Authentication System" and "OAuth Integration" can both use functionalArea: "authentication".

IMPORTANT: You MUST respond with valid JSON only. Never return plain text explanations.
If unable to identify epics, return {"epics": []} instead of plain text.
The functionalArea field MUST be one of the valid functional areas listed above.

Respond with valid JSON in exactly this format:
{
  "epics": [
    {
      "name": "Authentication System",
      "functionalArea": "authentication",
      "description": "User login and security features",
      "priority": "high",
      "estimatedComplexity": "medium"
    }
  ]
}`;

    try {
      const timeoutManager = getTimeoutManager();
      const response = await timeoutManager.raceWithTimeout(
        'llmRequest',
        performFormatAwareLlmCall(
          epicPrompt,
          'Identify functional areas and epic boundaries for task decomposition',
          this.config,
          'epic_identification',
          'json',
          undefined,
          0.1
        )
      );

      const parsedResponse = this.parseEpicIdentificationResponse(response);
      return this.validateAndTransformEpics(parsedResponse.epics);
    } catch (error) {
      logger.warn({ err: error, taskId: task.id }, 'Failed to identify epic structure');
      return [];
    }
  }

  /**
   * PHASE 2: Generate atomic tasks for a specific epic
   */
  private async generateTasksForEpic(
    originalTask: AtomicTask,
    epic: EpicStructure,
    _context: ProjectContext
  ): Promise<AtomicTask[]> {
    logger.debug({ 
      taskId: originalTask.id, 
      epicName: epic.name,
      functionalArea: epic.functionalArea 
    }, 'Generating tasks for epic');

    const epicTaskPrompt = `Generate atomic tasks specifically for this epic:

EPIC CONTEXT:
- Epic Name: ${epic.name}
- Functional Area: ${epic.functionalArea}
- Description: ${epic.description}
- Priority: ${epic.priority}

ORIGINAL TASK:
- Title: ${originalTask.title}
- Description: ${originalTask.description}
- Type: ${originalTask.type}

Generate ALL atomic tasks needed to fully implement this epic. Do not limit the number - create as many as necessary.
Each task should be 5-10 minutes of work and truly atomic (single responsibility, one file change).

TASK COUNT GUIDANCE (based on epic complexity):
- Simple epics (basic CRUD, simple UI): 5-15 tasks
- Medium complexity epics (auth flows, integrations): 15-40 tasks
- High complexity epics (complex features, systems): 40-100 tasks

The number of tasks should reflect the actual work needed, not arbitrary limits.

Respond with valid JSON only using the enhanced format from the decomposition prompt:
{
  "tasks": [
    {
      "title": "Create authentication middleware",
      "description": "...",
      "type": "development",
      "priority": "high",
      "estimatedHours": 0.15,
      "acceptanceCriteria": ["Middleware validates JWT tokens"],
      "functionalArea": "${epic.functionalArea}",
      "epicContext": {
        "suggestedEpicName": "${epic.name}",
        "epicDescription": "${epic.description}",
        "epicJustification": "Core component of ${epic.functionalArea} functionality"
      }
    }
  ]
}`;

    try {
      const timeoutManager = getTimeoutManager();
      const response = await timeoutManager.raceWithTimeout(
        'llmRequest',
        performFormatAwareLlmCall(
          epicTaskPrompt,
          'Generate atomic tasks for specific epic in two-phase decomposition',
          this.config,
          'epic_task_generation',
          'json',
          undefined,
          0.1
        )
      );

      const parsedResponse = this.parseTaskGenerationResponse(response);
      return this.validateAndTransformTasks(parsedResponse.tasks, originalTask, epic);
    } catch (error) {
      logger.warn({ 
        err: error, 
        taskId: originalTask.id, 
        epicName: epic.name 
      }, 'Failed to generate tasks for epic');
      return [];
    }
  }

  /**
   * Type-safe parser for epic identification LLM response
   */
  private parseEpicIdentificationResponse(jsonResponse: string): EpicIdentificationResponse {
    try {
      // Enhanced JSON extraction to handle edge cases
      let parsedJson: unknown;
      
      // First try direct parsing
      try {
        parsedJson = JSON.parse(jsonResponse);
      } catch {
        // Try to extract JSON from mixed content
        const jsonMatch = jsonResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          // Check for plain text responses
          if (jsonResponse.toLowerCase().includes('based on') || jsonResponse.toLowerCase().includes('unable to')) {
            logger.warn('LLM returned plain text for epic identification - treating as empty epic list');
            return { epics: [] };
          }
          throw new Error('No JSON found in epic identification response');
        }
        parsedJson = JSON.parse(jsonMatch[0]);
      }
      
      if (typeof parsedJson !== 'object' || parsedJson === null) {
        throw new Error('Response must be an object');
      }
      
      const obj = parsedJson as Record<string, unknown>;
      
      if (!('epics' in obj) || !Array.isArray(obj.epics)) {
        // Handle case where LLM returns empty or malformed response
        logger.warn({ 
          responseKeys: Object.keys(obj),
          responseSnippet: JSON.stringify(obj).substring(0, 100)
        }, 'Epic identification response missing epics array');
        return { epics: [] };
      }
      
      const epics = obj.epics as unknown[];
      const validatedEpics = epics.map((epic: unknown, index: number): EpicIdentificationResponse['epics'][number] => {
        if (typeof epic !== 'object' || epic === null) {
          throw new Error(`Epic at index ${index} must be an object`);
        }
        
        const epicObj = epic as Record<string, unknown>;
        
        if (typeof epicObj.name !== 'string') {
          throw new Error(`Epic at index ${index} must have string name`);
        }
        
        if (typeof epicObj.functionalArea !== 'string') {
          throw new Error(`Epic at index ${index} must have string functionalArea`);
        }
        
        if (typeof epicObj.description !== 'string') {
          throw new Error(`Epic at index ${index} must have string description`);
        }
        
        return {
          name: epicObj.name,
          functionalArea: epicObj.functionalArea,
          description: epicObj.description,
          priority: typeof epicObj.priority === 'string' ? epicObj.priority : undefined,
          estimatedComplexity: typeof epicObj.estimatedComplexity === 'string' ? epicObj.estimatedComplexity : undefined
        };
      });
      
      return { epics: validatedEpics };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      throw new Error(`Failed to parse epic identification response: ${errorMessage}`);
    }
  }

  /**
   * Type-safe parser for task generation LLM response
   */
  private parseTaskGenerationResponse(jsonResponse: string): TaskGenerationResponse {
    try {
      const parsed: unknown = JSON.parse(jsonResponse);
      
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Response must be an object');
      }
      
      const obj = parsed as Record<string, unknown>;
      
      if (!('tasks' in obj) || !Array.isArray(obj.tasks)) {
        throw new Error('Response must contain tasks array');
      }
      
      const tasks = obj.tasks as unknown[];
      const validatedTasks = tasks.map((task: unknown, index: number): TaskGenerationResponse['tasks'][number] => {
        if (typeof task !== 'object' || task === null) {
          throw new Error(`Task at index ${index} must be an object`);
        }
        
        const taskObj = task as Record<string, unknown>;
        
        if (typeof taskObj.title !== 'string') {
          throw new Error(`Task at index ${index} must have string title`);
        }
        
        if (typeof taskObj.description !== 'string') {
          throw new Error(`Task at index ${index} must have string description`);
        }
        
        // Validate arrays if present
        const validateStringArray = (arr: unknown, fieldName: string): ReadonlyArray<string> | undefined => {
          if (arr === undefined) return undefined;
          if (!Array.isArray(arr)) {
            throw new Error(`Task at index ${index}: ${fieldName} must be an array`);
          }
          return arr.map((item: unknown, arrIndex: number): string => {
            if (typeof item !== 'string') {
              throw new Error(`Task at index ${index}: ${fieldName}[${arrIndex}] must be a string`);
            }
            return item;
          });
        };
        
        // Validate epic context if present
        let epicContext: TaskGenerationResponse['tasks'][number]['epicContext'] = undefined;
        if (taskObj.epicContext !== undefined) {
          if (typeof taskObj.epicContext !== 'object' || taskObj.epicContext === null) {
            throw new Error(`Task at index ${index}: epicContext must be an object`);
          }
          const epicCtx = taskObj.epicContext as Record<string, unknown>;
          epicContext = {
            suggestedEpicName: typeof epicCtx.suggestedEpicName === 'string' ? epicCtx.suggestedEpicName : undefined,
            epicDescription: typeof epicCtx.epicDescription === 'string' ? epicCtx.epicDescription : undefined,
            epicJustification: typeof epicCtx.epicJustification === 'string' ? epicCtx.epicJustification : undefined
          };
        }
        
        return {
          title: taskObj.title,
          description: taskObj.description,
          type: typeof taskObj.type === 'string' ? taskObj.type : undefined,
          priority: typeof taskObj.priority === 'string' ? taskObj.priority : undefined,
          estimatedHours: typeof taskObj.estimatedHours === 'number' ? taskObj.estimatedHours : undefined,
          acceptanceCriteria: validateStringArray(taskObj.acceptanceCriteria, 'acceptanceCriteria'),
          tags: validateStringArray(taskObj.tags, 'tags'),
          dependencies: validateStringArray(taskObj.dependencies, 'dependencies'),
          filePaths: validateStringArray(taskObj.filePaths, 'filePaths'),
          functionalArea: typeof taskObj.functionalArea === 'string' ? taskObj.functionalArea : undefined,
          epicContext
        };
      });
      
      return { tasks: validatedTasks };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      throw new Error(`Failed to parse task generation response: ${errorMessage}`);
    }
  }

  /**
   * Validate and transform raw epic data to EpicStructure
   */
  private validateAndTransformEpics(rawEpics: EpicIdentificationResponse['epics']): EpicStructure[] {
    const validFunctionalAreas: EpicStructure['functionalArea'][] = [
      'authentication', 'user-management', 'content-management', 'data-management', 
      'integration', 'admin', 'ui-components', 'performance'
    ];
    
    const validPriorities: EpicStructure['priority'][] = ['low', 'medium', 'high', 'critical'];
    const validComplexities: EpicStructure['estimatedComplexity'][] = ['low', 'medium', 'high'];
    
    return rawEpics.map((epic): EpicStructure => {
      // Validate functional area
      let functionalArea: EpicStructure['functionalArea'] = 'integration'; // default fallback
      if (validFunctionalAreas.includes(epic.functionalArea as EpicStructure['functionalArea'])) {
        functionalArea = epic.functionalArea as EpicStructure['functionalArea'];
      } else {
        logger.warn({ 
          epicName: epic.name, 
          invalidFunctionalArea: epic.functionalArea,
          validAreas: validFunctionalAreas,
          defaultUsed: 'integration'
        }, 'Invalid functional area returned by LLM, using default fallback');
      }
      
      // Validate priority
      let priority: EpicStructure['priority'] = 'medium'; // default
      if (epic.priority && validPriorities.includes(epic.priority as EpicStructure['priority'])) {
        priority = epic.priority as EpicStructure['priority'];
      }
      
      // Validate complexity
      let estimatedComplexity: EpicStructure['estimatedComplexity'] = 'medium'; // default
      if (epic.estimatedComplexity && validComplexities.includes(epic.estimatedComplexity as EpicStructure['estimatedComplexity'])) {
        estimatedComplexity = epic.estimatedComplexity as EpicStructure['estimatedComplexity'];
      }
      
      return {
        name: epic.name,
        functionalArea,
        description: epic.description,
        priority,
        estimatedComplexity
      };
    });
  }

  /**
   * Validate and transform raw task data to AtomicTask
   */
  private validateAndTransformTasks(
    rawTasks: TaskGenerationResponse['tasks'], 
    originalTask: AtomicTask, 
    epic: EpicStructure
  ): AtomicTask[] {
    const validTaskTypes: AtomicTask['type'][] = ['development', 'testing', 'documentation', 'research'];
    const validPriorities: AtomicTask['priority'][] = ['low', 'medium', 'high', 'critical'];
    
    return rawTasks.map((taskData, index): AtomicTask => {
      // Validate and set defaults
      const type: AtomicTask['type'] = (taskData.type && validTaskTypes.includes(taskData.type as AtomicTask['type'])) 
        ? taskData.type as AtomicTask['type'] 
        : 'development';
        
      const priority: AtomicTask['priority'] = (taskData.priority && validPriorities.includes(taskData.priority as AtomicTask['priority']))
        ? taskData.priority as AtomicTask['priority']
        : epic.priority as AtomicTask['priority'];
        
      const estimatedHours: number = (typeof taskData.estimatedHours === 'number' && taskData.estimatedHours > 0)
        ? Math.min(taskData.estimatedHours, 0.17) // Cap at 10 minutes
        : 0.15;
        
      const now = new Date();
      
      return {
        id: `${originalTask.id}-epic-${index + 1}`,
        title: taskData.title,
        description: taskData.description,
        status: 'pending' as const,
        priority,
        type,
        functionalArea: epic.functionalArea,
        estimatedHours,
        actualHours: undefined,
        epicId: `${epic.functionalArea}-epic`,
        projectId: originalTask.projectId,
        dependencies: taskData.dependencies ? [...taskData.dependencies] : [],
        dependents: [],
        filePaths: taskData.filePaths ? [...taskData.filePaths] : [],
        acceptanceCriteria: taskData.acceptanceCriteria ? [...taskData.acceptanceCriteria] : [],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 80
        },
        performanceCriteria: {
          responseTime: undefined,
          memoryUsage: undefined,
          throughput: undefined
        },
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
        validationMethods: {
          automated: [],
          manual: []
        },
        assignedAgent: undefined,
        executionContext: undefined,
        createdAt: now,
        updatedAt: now,
        startedAt: undefined,
        completedAt: undefined,
        createdBy: 'decomposition-service',
        tags: taskData.tags ? [...taskData.tags] : [epic.functionalArea],
        metadata: {
          createdAt: now,
          updatedAt: now,
          createdBy: 'decomposition-service',
          tags: taskData.tags ? [...taskData.tags] : [epic.functionalArea]
        }
      };
    });
  }

  /**
   * Build prompt for task splitting
   */
  private buildSplitPrompt(
    task: AtomicTask,
    context: ProjectContext,
    analysis: AtomicityAnalysis
  ): string {
    return `Decompose the following non-atomic task into smaller, more manageable sub-tasks:

ORIGINAL TASK:
- Title: ${task.title}
- Description: ${task.description}
- Type: ${task.type}
- Priority: ${task.priority}
- Estimated Hours: ${task.estimatedHours}
- File Paths: ${(task.filePaths || []).join(', ')}
- Acceptance Criteria: ${(task.acceptanceCriteria || []).join('; ')}

ATOMICITY ANALYSIS:
- Is Atomic: ${analysis.isAtomic}
- Confidence: ${analysis.confidence}
- Reasoning: ${analysis.reasoning}
- Complexity Factors: ${(analysis.complexityFactors || []).join(', ')}
- Recommendations: ${(analysis.recommendations || []).join('; ')}

PROJECT CONTEXT:
- Languages: ${(context.languages && context.languages.length > 0 ? context.languages : ['unknown']).join(', ')}
- Frameworks: ${(context.frameworks && context.frameworks.length > 0 ? context.frameworks : ['unknown']).join(', ')}
- Tools: ${(context.tools || []).join(', ')}
- Complexity: ${context.complexity || 'unknown'}

EPIC CONSTRAINT:
- This task belongs to an epic with a maximum of ${this.rddConfig.epicTimeLimit} hours total (configurable limit supporting realistic enterprise projects)
- All generated tasks combined should not exceed the original task's estimated hours
- Aim for comprehensive task breakdown that supports realistic project scope

ATOMIC TASK REQUIREMENTS (MANDATORY):
1. ⏱️ DURATION: Each task must take 5-10 minutes maximum (0.08-0.17 hours)
2. 🎯 SINGLE ACTION: Each task must involve exactly ONE specific action
3. 📋 ONE CRITERIA: Each task must have exactly ONE acceptance criteria
4. 🔍 SINGLE FOCUS: Each task must focus on ONE thing only
5. 🚀 SIMPLICITY: Each task must be simple and straightforward
6. ⚡ IMMEDIATE: Each task can be started and completed immediately
7. 🔧 ACTIONABLE: Each task must be a concrete, specific action

TASK GENERATION REQUIREMENTS:
1. Create 2-${this.rddConfig.maxSubTasks} TRULY ATOMIC tasks
2. Each task MUST be completable in 5-10 minutes (0.08-0.17 hours)
3. Each task MUST have exactly ONE acceptance criteria
4. Each task MUST focus on ONE specific action
5. Tasks should be as independent as possible
6. Maintain clear logical progression
7. Preserve the original task's intent and scope
8. Use specific, actionable titles
9. Provide detailed but focused descriptions
10. Support comprehensive project coverage within the ${this.rddConfig.epicTimeLimit}-hour epic scope

VALIDATION CHECKLIST (Apply to each task):
□ Takes 5-10 minutes maximum?
□ Involves exactly ONE action?
□ Has exactly ONE acceptance criteria?
□ Focuses on ONE thing only?
□ Is simple and straightforward?
□ Can be started immediately?
□ Cannot be broken down into smaller tasks?

Provide your task decomposition in the following JSON format:
{
  "tasks": [
    {
      "title": "Specific, actionable title (verb + object)",
      "description": "Detailed description of the single action to take",
      "type": "development|testing|documentation|research",
      "priority": "low|medium|high|critical",
      "estimatedHours": 0.08-0.17 (5-10 minutes in decimal hours),
      "filePaths": ["specific file to modify"],
      "acceptanceCriteria": ["ONE specific, testable outcome"],
      "tags": ["relevant", "tags"],
      "dependencies": ["T0001"] // Only if absolutely necessary
    }
  ]
}

CRITICAL REMINDER:
- Use "tasks" not "subtasks" in your response
- If any task takes more than 10 minutes, break it down further!
- Ensure total time of all tasks doesn't exceed epic's 8-hour limit
- ALWAYS respond with valid JSON, never plain text
- If unable to decompose, return {"tasks": []} with an explanation in the task description`;
  }



  /**
   * Validate the structure of a task object
   */
  private validateTaskStructure(task: Record<string, unknown>): boolean {
    const requiredFields = ['title', 'description', 'type', 'priority', 'estimatedHours'];
    return requiredFields.every(field => Object.prototype.hasOwnProperty.call(task, field) && task[field] != null);
  }

  /**
   * Validate the response structure before parsing
   */
  private validateResponseStructure(parsed: Record<string, unknown>): { isValid: boolean; error?: string; canConvert?: boolean } {
    // Check if it's a analysis-only response (codebaseAlignment, researchIntegration, etc.)
    const analysisFields = ['codebaseAlignment', 'researchIntegration', 'technologySpecifics', 'estimationFactors'];
    const hasAnalysisFields = analysisFields.some(field => parsed[field]);
    
    if (hasAnalysisFields && !parsed.tasks && !parsed.subTasks && !parsed.title && !parsed.contextualInsights) {
      return { 
        isValid: false, 
        error: `LLM returned analysis fields (${analysisFields.filter(f => parsed[f]).join(', ')}) without tasks array. This is a malformed response.`,
        canConvert: true
      };
    }

    // Check if it's a contextualInsights-only response (common LLM behavior)
    if (parsed.contextualInsights && !parsed.tasks && !parsed.subTasks && !parsed.title) {
      return { 
        isValid: false, 
        error: `LLM returned contextualInsights without tasks array. This suggests the task may already be atomic or the LLM failed to decompose it properly. Response keys: ${Object.keys(parsed).join(', ')}`,
        canConvert: false
      };
    }

    // Check if it's a tasks array format
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      if (parsed.tasks.length === 0) {
        return { isValid: false, error: `Empty tasks array received from LLM` };
      }
      const invalidTasks = (parsed.tasks as Record<string, unknown>[]).filter((task: Record<string, unknown>) => !this.validateTaskStructure(task));
      if (invalidTasks.length > 0) {
        const missingFields = this.getMissingFields(invalidTasks[0]);
        return { isValid: false, error: `Invalid task structure in tasks array: missing required fields [${missingFields.join(', ')}] in task "${invalidTasks[0].title || 'untitled'}"` };
      }
      return { isValid: true };
    }

    // Check if it's a subTasks array format (backward compatibility)
    if (parsed.subTasks && Array.isArray(parsed.subTasks)) {
      if (parsed.subTasks.length === 0) {
        return { isValid: false, error: `Empty subTasks array received from LLM` };
      }
      const invalidTasks = (parsed.subTasks as Record<string, unknown>[]).filter((task: Record<string, unknown>) => !this.validateTaskStructure(task));
      if (invalidTasks.length > 0) {
        const missingFields = this.getMissingFields(invalidTasks[0]);
        return { isValid: false, error: `Invalid task structure in subTasks array: missing required fields [${missingFields.join(', ')}] in task "${invalidTasks[0].title || 'untitled'}"` };
      }
      return { isValid: true };
    }

    // Check if it's a single task object
    if (parsed.title && parsed.description) {
      if (!this.validateTaskStructure(parsed)) {
        const missingFields = this.getMissingFields(parsed);
        return { isValid: false, error: `Invalid single task structure: missing required fields [${missingFields.join(', ')}]` };
      }
      return { isValid: true };
    }

    // Provide detailed diagnostic information for debugging
    const responseKeys = Object.keys(parsed);
    const hasContextualInsights = !!parsed.contextualInsights;
    const hasAnalysis = !!parsed.analysis;
    const hasRecommendations = !!parsed.recommendations;
    
    return { 
      isValid: false, 
      error: `Invalid response format: no tasks array or single task found. Response contains keys: [${responseKeys.join(', ')}]. Has contextualInsights: ${hasContextualInsights}, analysis: ${hasAnalysis}, recommendations: ${hasRecommendations}. Expected "tasks" array or single task object with title/description.` 
    };
  }

  /**
   * Convert analysis-only response to proper format by treating as atomic task
   */
  private convertAnalysisOnlyResponse(parsed: Record<string, unknown>, originalTask: AtomicTask): AtomicTask[] {
    logger.info({ 
      taskId: originalTask.id,
      analysisFields: Object.keys(parsed).filter(k => ['codebaseAlignment', 'researchIntegration', 'technologySpecifics', 'estimationFactors'].includes(k))
    }, 'Converting analysis-only response to atomic task - LLM failed to provide proper decomposition');

    // Create proper contextualInsights structure
    const contextualInsights = {
      codebaseAlignment: parsed.codebaseAlignment as string || 'No codebase alignment analysis provided',
      researchIntegration: parsed.researchIntegration as string || 'No research integration analysis provided', 
      technologySpecifics: parsed.technologySpecifics as string || 'No technology specifics provided',
      estimationFactors: parsed.estimationFactors as string || 'No estimation factors provided'
    };

    // Generate atomic task since LLM didn't provide proper decomposition
    const atomicTask: AtomicTask = {
      id: `${originalTask.id}-atomic-01`,
      title: originalTask.title,
      description: `${originalTask.description}\n\nAnalysis: ${contextualInsights.codebaseAlignment}`,
      type: originalTask.type,
      functionalArea: originalTask.functionalArea || 'data-management',
      priority: originalTask.priority,
      status: 'pending',
      projectId: originalTask.projectId,
      epicId: originalTask.epicId,
      estimatedHours: Math.min(Math.max(originalTask.estimatedHours, 0.08), 0.17),
      actualHours: 0,
      filePaths: originalTask.filePaths || [],
      acceptanceCriteria: originalTask.acceptanceCriteria?.length > 0 
        ? [originalTask.acceptanceCriteria[0]]
        : ['Task implementation completed and verified'],
      tags: [...(originalTask.tags || []), 'llm-analysis-converted', 'atomic-fallback'],
      dependencies: originalTask.dependencies || [],
      dependents: [],
      testingRequirements: originalTask.testingRequirements || {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 80
      },
      performanceCriteria: originalTask.performanceCriteria || {},
      qualityCriteria: originalTask.qualityCriteria || {
        codeQuality: [],
        documentation: [],
        typeScript: true,
        eslint: true
      },
      integrationCriteria: originalTask.integrationCriteria || {
        compatibility: [],
        patterns: []
      },
      validationMethods: originalTask.validationMethods || {
        automated: [],
        manual: []
      },
      assignedAgent: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: originalTask.createdBy,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: originalTask.createdBy,
        tags: [...(originalTask.tags || []), 'llm-analysis-converted', 'atomic-fallback']
      }
    };

    return [atomicTask];
  }

  /**
   * Get missing required fields for a task object
   */
  private getMissingFields(task: Record<string, unknown>): string[] {
    const requiredFields = ['title', 'description', 'type', 'priority', 'estimatedHours'];
    return requiredFields.filter(field => !Object.prototype.hasOwnProperty.call(task, field) || task[field] == null);
  }

  /**
   * Parse the LLM response for task splitting
   */
  private async parseSplitResponse(response: string, originalTask: AtomicTask): Promise<AtomicTask[]> {
    try {
      // Add null safety check for response
      if (!response || typeof response !== 'string') {
        throw new Error('Invalid or empty response received from LLM');
      }

      // First try to extract JSON from the response
      // Enhanced regex to handle more edge cases
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // If no JSON found, check if it's a plain text error response
        if (response.toLowerCase().includes('based on') || response.toLowerCase().includes('prd content')) {
          logger.warn({ 
            taskId: originalTask.id, 
            responseSnippet: response.substring(0, 100) 
          }, 'LLM returned plain text instead of JSON - likely empty PRD issue');
          throw new Error('LLM returned plain text explanation instead of JSON task list. This often indicates an empty or unparseable PRD.');
        }
        throw new Error('No JSON found in response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        // Try to clean up common JSON issues
        const cleanedJson = jsonMatch[0]
          .replace(/,\s*}/g, '}') // Remove trailing commas
          .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
          .replace(/'/g, '"'); // Replace single quotes with double quotes
        
        try {
          parsed = JSON.parse(cleanedJson);
        } catch (secondParseError) {
          logger.error({ 
            originalError: parseError,
            secondError: secondParseError,
            jsonSnippet: jsonMatch[0].substring(0, 200)
          }, 'Failed to parse JSON even after cleanup');
          throw new Error(`JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }
      }

      // Validate response structure first
      const validation = this.validateResponseStructure(parsed as Record<string, unknown>);
      if (!validation.isValid) {
        // Check if we can convert an analysis-only response
        if (validation.canConvert) {
          logger.warn({
            taskId: originalTask.id,
            responseKeys: Object.keys(parsed as Record<string, unknown>),
            conversionReason: 'LLM returned analysis fields without tasks array'
          }, 'Converting analysis-only response to atomic task');
          return this.convertAnalysisOnlyResponse(parsed as Record<string, unknown>, originalTask);
        }
        throw new Error(validation.error || 'Invalid response structure');
      }

      // Now we know parsed is a valid object, cast it
      const parsedResponse = parsed as Record<string, unknown>;

      // Support both "tasks" and "subTasks" for backward compatibility, but prefer "tasks"
      let tasksArray = parsedResponse.tasks || parsedResponse.subTasks;

      // Handle case where LLM returns a single task object instead of an array
      if (!tasksArray) {
        // Check if the parsed object itself is a single task (has title, description, etc.)
        if (parsedResponse.title && parsedResponse.description) {
          logger.info({ taskId: originalTask.id }, 'LLM returned single task object, converting to array');
          tasksArray = [parsedResponse];
        } else {
          throw new Error('Invalid response format: no tasks array or single task found');
        }
      }

      if (!Array.isArray(tasksArray)) {
        throw new Error('Invalid tasks array in response');
      }

      const tasks = await Promise.all(tasksArray.map(async (taskData: Record<string, unknown>, index: number) => {
        // Use unique ID generation instead of predictable pattern
        const idGenerator = getIdGenerator();
        const idResult = await idGenerator.generateTaskId();
        const decomposedTaskId = idResult.success ? idResult.id! : `${originalTask.id}-${String(index + 1).padStart(2, '0')}`;
        
        logger.debug({
          originalTaskId: originalTask.id,
          newTaskId: decomposedTaskId,
          taskIndex: index,
          taskTitle: taskData.title as string,
          epicId: originalTask.epicId,
          projectId: originalTask.projectId
        }, 'Generated unique task ID for decomposed task');

        return {
          id: decomposedTaskId,
          title: (taskData.title as string) || '',
          description: (taskData.description as string) || '',
          type: this.validateTaskType(String(taskData.type)) || originalTask.type,
          functionalArea: (taskData.functionalArea as FunctionalArea) || originalTask.functionalArea || 'data-management',
          priority: this.validateTaskPriority(String(taskData.priority)) || originalTask.priority,
          status: 'pending' as const,
          projectId: originalTask.projectId,
          epicId: originalTask.epicId,
          estimatedHours: (taskData.estimatedHours as number) || 0.1, // Preserve original value for validation
          actualHours: 0,
          filePaths: Array.isArray(taskData.filePaths) ? taskData.filePaths : [],
          acceptanceCriteria: Array.isArray(taskData.acceptanceCriteria) ?
            taskData.acceptanceCriteria.slice(0, 1) : // Ensure only one acceptance criteria
            ['Task completion criteria not specified'],
          tags: Array.isArray(taskData.tags) ? taskData.tags : originalTask.tags,
          dependencies: Array.isArray(taskData.dependencies) ? taskData.dependencies : [],
          dependents: [], // Initialize empty dependents array
          testingRequirements: originalTask.testingRequirements || {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          performanceCriteria: originalTask.performanceCriteria || {},
          qualityCriteria: originalTask.qualityCriteria || {
            codeQuality: [],
            documentation: [],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: originalTask.integrationCriteria || {
            compatibility: [],
            patterns: []
          },
          validationMethods: originalTask.validationMethods || {
            automated: [],
            manual: []
          },
          assignedAgent: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: originalTask.createdBy,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: originalTask.createdBy,
            tags: Array.isArray(taskData.tags) ? taskData.tags : originalTask.tags
          }
        };
      }));
      
      return tasks;

    } catch (error) {
      logger.warn({ err: error, response, taskId: originalTask.id }, 'Failed to parse split response, falling back to default task generation');
      
      // Fallback: Create a simplified version of the original task
      return this.generateFallbackTasks(originalTask, error instanceof Error ? error.message : 'Unknown parsing error');
    }
  }

  /**
   * Generate fallback tasks when LLM parsing fails
   */
  private generateFallbackTasks(originalTask: AtomicTask, errorMessage: string): AtomicTask[] {
    logger.info({ 
      taskId: originalTask.id, 
      errorMessage, 
      originalEstimatedHours: originalTask.estimatedHours,
      fallbackStrategy: 'realistic_atomic_tasks' 
    }, 'Generating realistic fallback tasks due to parsing failure');
    
    // Determine if this is a contextualInsights-only response (suggests atomic task)
    const isContextualInsightsResponse = errorMessage.includes('contextualInsights without tasks array');
    
    if (isContextualInsightsResponse) {
      // If LLM returned contextualInsights only, the task is likely already atomic
      // Create a single refined task with proper atomic constraints
      const atomicTask: AtomicTask = {
        id: `${originalTask.id}-atomic-01`,
        title: originalTask.title,
        description: `${originalTask.description}\n\nNote: LLM analysis suggests this task is already appropriately sized for atomic execution.`,
        type: originalTask.type,
        functionalArea: originalTask.functionalArea || 'data-management',
        priority: originalTask.priority,
        status: 'pending',
        projectId: originalTask.projectId,
        epicId: originalTask.epicId,
        estimatedHours: Math.min(Math.max(originalTask.estimatedHours, 0.08), 0.17), // Ensure 5-10 minute range
        actualHours: 0,
        filePaths: originalTask.filePaths || [],
        acceptanceCriteria: originalTask.acceptanceCriteria?.length > 0 
          ? [originalTask.acceptanceCriteria[0]] // Keep only the first criteria for atomic tasks
          : ['Task implementation completed and verified'],
        tags: [...(originalTask.tags || []), 'llm-atomic-validated'],
        dependencies: originalTask.dependencies || [],
        dependents: [],
        testingRequirements: originalTask.testingRequirements || {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 80
        },
        performanceCriteria: originalTask.performanceCriteria || {},
        qualityCriteria: originalTask.qualityCriteria || {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: originalTask.integrationCriteria || {
          compatibility: [],
          patterns: []
        },
        validationMethods: originalTask.validationMethods || {
          automated: [],
          manual: []
        },
        assignedAgent: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: originalTask.createdBy,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: originalTask.createdBy,
          tags: [...(originalTask.tags || []), 'llm-atomic-validated', 'fallback:atomic']
        }
      };
      
      return [atomicTask];
    }
    
    // For other parsing failures, create proper atomic breakdown
    const tasks: AtomicTask[] = [];
    
    // Create more realistic and specific planning task
    tasks.push({
      id: `${originalTask.id}-plan-01`,
      title: `Analyze requirements for ${originalTask.title.toLowerCase()}`,
      description: `Review existing code patterns and create implementation approach for: ${originalTask.description}. Identify required changes, dependencies, and potential risks.`,
      type: 'research',
      functionalArea: originalTask.functionalArea || 'data-management',
      priority: originalTask.priority,
      status: 'pending',
      projectId: originalTask.projectId,
      epicId: originalTask.epicId,
      estimatedHours: 0.1, // 6 minutes - more realistic for analysis
      actualHours: 0,
      filePaths: originalTask.filePaths?.slice(0, 2) || [], // Include relevant files
      acceptanceCriteria: ['Implementation approach documented with clear next steps'],
      tags: [...(originalTask.tags || []), 'fallback-generated', 'planning-phase'],
      dependencies: [],
      dependents: [],
      testingRequirements: originalTask.testingRequirements || {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 80
      },
      performanceCriteria: originalTask.performanceCriteria || {},
      qualityCriteria: originalTask.qualityCriteria || {
        codeQuality: [],
        documentation: [],
        typeScript: true,
        eslint: true
      },
      integrationCriteria: originalTask.integrationCriteria || {
        compatibility: [],
        patterns: []
      },
      validationMethods: originalTask.validationMethods || {
        automated: [],
        manual: []
      },
      assignedAgent: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: originalTask.createdBy,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: originalTask.createdBy,
        tags: [...(originalTask.tags || []), 'fallback-generated', 'planning-phase', 'parsing-failed']
      }
    });
    
    // Create more specific implementation task based on task type
    const implementationTitle = originalTask.type === 'testing' 
      ? `Write tests for ${originalTask.title.toLowerCase()}`
      : originalTask.type === 'documentation'
      ? `Document ${originalTask.title.toLowerCase()}`
      : `Implement ${originalTask.title.toLowerCase()}`;
    
    const implementationDescription = originalTask.type === 'testing'
      ? `Write unit tests covering the functionality described in: ${originalTask.description}. Include edge cases and error scenarios.`
      : originalTask.type === 'documentation'
      ? `Create comprehensive documentation for: ${originalTask.description}. Include usage examples and API details.`
      : `Execute the implementation for: ${originalTask.description}. Follow established patterns and coding standards.`;

    tasks.push({
        id: `${originalTask.id}-impl-02`,
        title: implementationTitle,
        description: implementationDescription,
        type: originalTask.type,
        functionalArea: originalTask.functionalArea || 'data-management',
        priority: originalTask.priority,
        status: 'pending',
        projectId: originalTask.projectId,
        epicId: originalTask.epicId,
        estimatedHours: 0.15, // 9 minutes - slightly longer for implementation
        actualHours: 0,
        filePaths: originalTask.filePaths || [],
        acceptanceCriteria: [`${implementationTitle} completed and verified`],
        tags: [...(originalTask.tags || []), 'fallback-generated', 'implementation-phase'],
        dependencies: [`${originalTask.id}-plan-01`], // Depends on planning task
        dependents: [],
        testingRequirements: originalTask.testingRequirements || {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 80
        },
        performanceCriteria: originalTask.performanceCriteria || {},
        qualityCriteria: originalTask.qualityCriteria || {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: originalTask.integrationCriteria || {
          compatibility: [],
          patterns: []
        },
        validationMethods: originalTask.validationMethods || {
          automated: [],
          manual: []
        },
        assignedAgent: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: originalTask.createdBy,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: originalTask.createdBy,
          tags: [...(originalTask.tags || []), 'fallback-generated', 'implementation-phase', 'parsing-failed']
        }
      });

    logger.info({
      taskId: originalTask.id,
      fallbackTasksGenerated: tasks.length,
      totalEstimatedHours: tasks.reduce((sum, task) => sum + task.estimatedHours, 0),
      originalEstimatedHours: originalTask.estimatedHours
    }, 'Realistic fallback tasks generated successfully');

    return tasks;
  }

  /**
   * Validate and limit decomposed tasks with atomic constraints
   */
  private validateDecomposedTasks(decomposedTasks: AtomicTask[], _originalTask: AtomicTask): AtomicTask[] {
    // Limit number of tasks
    const limitedTasks = decomposedTasks.slice(0, this.rddConfig.maxSubTasks);

    // Epic time limit for validation - now configurable through RDDConfig
    const epicTimeLimit: number = this.rddConfig.epicTimeLimit;

    // Validate each task with atomic constraints
    const validTasks = limitedTasks.filter(task => {
      if (!task.title || !task.description) {
        logger.warn({ taskId: task.id }, 'Task missing title or description');
        return false;
      }

      // Atomic task duration validation: 5-10 minutes (0.08-0.17 hours)
      if (task.estimatedHours < 0.08 || task.estimatedHours > 0.17) {
        logger.warn({
          taskId: task.id,
          hours: task.estimatedHours
        }, 'Task duration outside 5-10 minute range');
        return false;
      }

      // Single acceptance criteria validation
      if (!task.acceptanceCriteria || task.acceptanceCriteria.length !== 1) {
        logger.warn({
          taskId: task.id,
          criteriaCount: task.acceptanceCriteria?.length
        }, 'Task must have exactly one acceptance criteria');
        return false;
      }

      // Removed overly strict "and" operator validation - it was rejecting valid atomic tasks
      // Tasks can contain "and" in context that doesn't indicate multiple actions
      // e.g., "Update user model and database schema" can be atomic if referring to related changes
      // Better to rely on time estimation and acceptance criteria validation

      return true;
    });

    // Epic time constraint validation
    const validTasksTotalTime = validTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
    if (validTasksTotalTime > epicTimeLimit) {
      logger.warn({
        totalTime: validTasksTotalTime,
        epicLimit: epicTimeLimit
      }, 'Generated tasks exceed epic time limit');

      // Truncate tasks to fit within epic limit
      let runningTotal = 0;
      return validTasks.filter(task => {
        runningTotal += task.estimatedHours || 0;
        return runningTotal <= epicTimeLimit;
      });
    }

    return validTasks;
  }

  /**
   * Validate task type
   */
  private validateTaskType(type: string): TaskType | null {
    const validTypes: TaskType[] = ['development', 'testing', 'documentation', 'research'];
    return validTypes.includes(type as TaskType) ? type as TaskType : null;
  }

  /**
   * Validate task priority
   */
  private validateTaskPriority(priority: string): TaskPriority | null {
    const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
    return validPriorities.includes(priority as TaskPriority) ? priority as TaskPriority : null;
  }

  /**
   * Track active operation for health monitoring with progress updates
   */
  private trackOperation(operationId: string, operation: string, taskId: string): void {
    this.activeOperations.set(operationId, {
      startTime: new Date(),
      operation,
      taskId
    });
    
    // Emit progress update for operation start
    this.emitTaskProgress(taskId, 'decomposition', 'started', 0, `${operation} started`);
  }

  /**
   * Complete operation tracking with progress updates
   */
  private completeOperation(operationId: string): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      // Emit progress update for operation completion
      this.emitTaskProgress(operation.taskId, 'decomposition', 'completed', 100, `${operation.operation} completed`);
    }
    this.activeOperations.delete(operationId);
  }

  /**
   * Get health status of RDD engine operations
   */
  getHealthStatus(): { healthy: boolean; activeOperations: number; longRunningOperations: Array<{ operationId: string; operation: string; taskId: string; duration: number }> } {
    const now = new Date();
    const longRunningThreshold = 300000; // 5 minutes
    const longRunningOperations: Array<{ operationId: string; operation: string; taskId: string; duration: number }> = [];

    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();
      if (duration > longRunningThreshold) {
        longRunningOperations.push({
          operationId,
          operation: info.operation,
          taskId: info.taskId,
          duration
        });
      }
    }

    return {
      healthy: longRunningOperations.length === 0,
      activeOperations: this.activeOperations.size,
      longRunningOperations
    };
  }

  /**
   * Clean up stale operations (operations that have been running too long)
   */
  cleanupStaleOperations(): number {
    const now = new Date();
    const staleThreshold = 900000; // 15 minutes
    let cleanedCount = 0;

    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();
      if (duration > staleThreshold) {
        logger.warn({
          operationId,
          operation: info.operation,
          taskId: info.taskId,
          duration
        }, 'Cleaning up stale RDD operation');
        this.activeOperations.delete(operationId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Handle decomposition failure with proper error recovery
   */
  private handleDecompositionFailure(
    task: AtomicTask,
    error: Error | string,
    context: { depth: number; isRecursive?: boolean; operationId?: string }
  ): DecompositionResult {
    const errorMessage = error instanceof Error ? error.message : error;
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');

    // Record failure in circuit breaker
    this.circuitBreaker.recordFailure(task.id);

    // Log appropriate error level based on context
    const logLevel = context.isRecursive ? 'warn' : 'error';
    const logMessage = context.isRecursive
      ? 'Recursive decomposition failed, treating task as atomic'
      : 'Primary decomposition failed, treating task as atomic';

    logger[logLevel]({
      err: error instanceof Error ? error : new Error(errorMessage),
      taskId: task.id,
      depth: context.depth,
      isRecursive: context.isRecursive || false,
      timeout: isTimeout,
      operationId: context.operationId
    }, logMessage);

    // Create appropriate fallback analysis
    const fallbackAnalysis = {
      isAtomic: true,
      confidence: isTimeout ? 0.8 : 0.6,
      reasoning: isTimeout
        ? 'Task treated as atomic due to decomposition timeout - likely requires manual breakdown'
        : context.isRecursive
          ? 'Task treated as atomic after recursive decomposition failure'
          : 'Task treated as atomic due to primary decomposition failure',
      estimatedHours: task.estimatedHours,
      complexityFactors: isTimeout
        ? ['timeout_complexity', 'llm_timeout', 'circuit_breaker_protection']
        : ['decomposition_failure', 'circuit_breaker_protection'],
      recommendations: isTimeout
        ? ['Manual task breakdown recommended', 'Consider simplifying task scope', 'Review task complexity']
        : ['Manual review required', 'Consider alternative decomposition approach']
    };

    return {
      success: true, // Mark as success to continue workflow
      isAtomic: true, // Force atomic to prevent further decomposition attempts
      originalTask: task,
      subTasks: [],
      analysis: fallbackAnalysis,
      error: errorMessage,
      depth: context.depth
    };
  }

  /**
   * Reset circuit breaker for a specific task or all tasks
   */
  resetCircuitBreaker(taskId?: string): void {
    this.circuitBreaker.reset(taskId);
    logger.info({ taskId: taskId || 'all' }, 'Circuit breaker reset');
  }

  /**
   * Get circuit breaker statistics for monitoring
   */
  getCircuitBreakerStats(taskId?: string): Record<string, unknown> {
    if (taskId) {
      return this.circuitBreaker.getStats(taskId);
    }

    // Return overall stats (this would need to be implemented in the circuit breaker)
    return {
      message: 'Use specific taskId to get detailed stats'
    };
  }

  /**
   * Monitor decomposition progress and detect stuck processes
   */
  monitorDecompositionProgress(): {
    status: 'healthy' | 'warning' | 'critical';
    activeOperations: number;
    stuckOperations: Array<{
      operationId: string;
      taskId: string;
      operation: string;
      duration: number;
      status: 'warning' | 'critical';
    }>;
    circuitBreakerStatus: {
      tasksBlocked: number;
      recentFailures: number;
    };
    recommendations: string[];
  } {
    const now = new Date();
    const warningThreshold = 120000; // 2 minutes
    const criticalThreshold = 300000; // 5 minutes

    const stuckOperations: Array<{
      operationId: string;
      taskId: string;
      operation: string;
      duration: number;
      status: 'warning' | 'critical';
    }> = [];

    // Check active operations for stuck processes
    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();

      if (duration > criticalThreshold) {
        stuckOperations.push({
          operationId,
          taskId: info.taskId,
          operation: info.operation,
          duration,
          status: 'critical'
        });
      } else if (duration > warningThreshold) {
        stuckOperations.push({
          operationId,
          taskId: info.taskId,
          operation: info.operation,
          duration,
          status: 'warning'
        });
      }
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (stuckOperations.some(op => op.status === 'critical')) {
      status = 'critical';
    } else if (stuckOperations.length > 0) {
      status = 'warning';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (stuckOperations.length > 0) {
      recommendations.push('Consider stopping stuck decomposition processes');
      recommendations.push('Review circuit breaker settings');
      recommendations.push('Check LLM service availability and response times');
    }

    if (stuckOperations.filter(op => op.status === 'critical').length > 0) {
      recommendations.push('URGENT: Kill critical stuck operations immediately');
      recommendations.push('Reset circuit breaker for affected tasks');
    }

    // Mock circuit breaker status (would need actual implementation)
    const circuitBreakerStatus = {
      tasksBlocked: 0, // Would count tasks currently blocked by circuit breaker
      recentFailures: 0 // Would count recent failures
    };

    return {
      status,
      activeOperations: this.activeOperations.size,
      stuckOperations,
      circuitBreakerStatus,
      recommendations
    };
  }

  /**
   * Emergency stop for all active decomposition operations
   */
  emergencyStop(): {
    stopped: number;
    operations: Array<{ operationId: string; taskId: string; operation: string; duration: number }>;
  } {
    const now = new Date();
    const stoppedOperations: Array<{ operationId: string; taskId: string; operation: string; duration: number }> = [];

    for (const [operationId, info] of this.activeOperations.entries()) {
      const duration = now.getTime() - info.startTime.getTime();
      stoppedOperations.push({
        operationId,
        taskId: info.taskId,
        operation: info.operation,
        duration
      });

      logger.warn({
        operationId,
        taskId: info.taskId,
        operation: info.operation,
        duration
      }, 'Emergency stop: Terminating active decomposition operation');
    }

    // Clear all active operations
    this.activeOperations.clear();

    // Reset circuit breaker to allow fresh attempts
    this.circuitBreaker.reset();

    logger.info({
      stoppedCount: stoppedOperations.length
    }, 'Emergency stop completed - all active operations terminated');

    return {
      stopped: stoppedOperations.length,
      operations: stoppedOperations
    };
  }

  /**
   * Emit operation progress updates for real-time status tracking
   */
  private emitTaskProgress(
    taskId: string, 
    operation: string, 
    status: 'started' | 'progress' | 'completed' | 'failed',
    progressPercentage: number,
    message?: string
  ): void {
    try {
      // Import progress tracker dynamically to avoid circular dependencies
      import('../services/progress-tracker.js').then(({ ProgressTracker }) => {
        const progressTracker = ProgressTracker.getInstance();
        
        progressTracker.emitProgressEvent('decomposition_progress', {
          taskId,
          progressPercentage,
          componentName: 'RDDEngine',
          message: message || `${operation} ${status}`,
          decompositionProgress: {
            phase: 'decomposition',
            progress: progressPercentage,
            message: message || `${operation} ${status}`
          }
        });
        
        logger.debug({
          taskId,
          operation,
          status,
          progressPercentage,
          message
        }, 'RDD task progress update emitted');
      }).catch(error => {
        logger.debug({ err: error, taskId }, 'Could not emit progress update');
      });
    } catch (error) {
      logger.debug({ err: error, taskId }, 'Failed to emit task progress');
    }
  }
}
