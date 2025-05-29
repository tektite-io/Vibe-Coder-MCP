import { RDDEngine, DecompositionResult, RDDConfig } from '../core/rdd-engine.js';
import { ProjectContext } from '../core/atomic-detector.js';
import { AtomicTask } from '../types/task.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getVibeTaskManagerConfig } from '../utils/config-loader.js';
import { ContextEnrichmentService, ContextRequest } from './context-enrichment-service.js';
import logger from '../../../logger.js';

/**
 * Decomposition session for tracking progress
 */
export interface DecompositionSession {
  id: string;
  taskId: string;
  projectId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  progress: number; // 0-100
  currentDepth: number;
  maxDepth: number;
  totalTasks: number;
  processedTasks: number;
  results: DecompositionResult[];
  error?: string;
}

/**
 * Decomposition request parameters
 */
export interface DecompositionRequest {
  task: AtomicTask;
  context: ProjectContext;
  config?: Partial<RDDConfig>;
  sessionId?: string;
}

/**
 * Decomposition service orchestrates the task decomposition process
 */
export class DecompositionService {
  private engine: RDDEngine;
  private sessions: Map<string, DecompositionSession> = new Map();
  private config: OpenRouterConfig;
  private contextService: ContextEnrichmentService;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.engine = new RDDEngine(config);
    this.contextService = ContextEnrichmentService.getInstance();
  }

  /**
   * Start a new decomposition session
   */
  async startDecomposition(request: DecompositionRequest): Promise<DecompositionSession> {
    const sessionId = request.sessionId || this.generateSessionId();

    logger.info({
      sessionId,
      taskId: request.task.id,
      projectId: request.context.projectId
    }, 'Starting decomposition session');

    const session: DecompositionSession = {
      id: sessionId,
      taskId: request.task.id,
      projectId: request.context.projectId,
      status: 'pending',
      startTime: new Date(),
      progress: 0,
      currentDepth: 0,
      maxDepth: request.config?.maxDepth || 5,
      totalTasks: 1,
      processedTasks: 0,
      results: []
    };

    this.sessions.set(sessionId, session);

    // Start decomposition asynchronously with a small delay to ensure session is returned as 'pending'
    setTimeout(() => {
      this.executeDecomposition(session, request).catch(error => {
        logger.error({ err: error, sessionId }, 'Decomposition session failed');
        session.status = 'failed';
        session.error = error instanceof Error ? error.message : 'Unknown error';
        session.endTime = new Date();
      });
    }, 0);

    return session;
  }

  /**
   * Get decomposition session status
   */
  getSession(sessionId: string): DecompositionSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): DecompositionSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.status === 'pending' || session.status === 'in_progress'
    );
  }

  /**
   * Cancel a decomposition session
   */
  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'completed' || session.status === 'failed') {
      return false;
    }

    session.status = 'failed';
    session.error = 'Cancelled by user';
    session.endTime = new Date();

    logger.info({ sessionId }, 'Decomposition session cancelled');
    return true;
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.endTime && session.endTime < cutoff) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'Cleaned up old decomposition sessions');
    }

    return cleaned;
  }

  /**
   * Execute the decomposition process
   */
  private async executeDecomposition(
    session: DecompositionSession,
    request: DecompositionRequest
  ): Promise<void> {
    try {
      session.status = 'in_progress';
      session.progress = 10;

      // Update engine configuration if provided
      if (request.config) {
        this.engine = new RDDEngine(this.config, request.config);
      }

      // Enrich context with codebase information
      const enrichedContext = await this.enrichContext(request.context, request.task);
      session.progress = 20;

      // Perform decomposition
      const result = await this.engine.decomposeTask(request.task, enrichedContext);
      session.progress = 80;

      // Process results
      session.results = [result];
      session.processedTasks = 1;
      session.currentDepth = result.depth;

      // Calculate final statistics
      this.calculateSessionStats(session);
      session.progress = 100;
      session.status = 'completed';
      session.endTime = new Date();

      logger.info({
        sessionId: session.id,
        totalSubTasks: result.subTasks.length,
        isAtomic: result.isAtomic,
        depth: result.depth
      }, 'Decomposition session completed');

    } catch (error) {
      logger.error({ err: error, sessionId: session.id }, 'Decomposition execution failed');
      throw error;
    }
  }

  /**
   * Enrich context with additional codebase information
   */
  private async enrichContext(context: ProjectContext, task?: AtomicTask): Promise<ProjectContext> {
    try {
      logger.info({ projectId: context.projectId }, 'Enriching context with codebase information');

      // If no task provided, return context as-is
      if (!task) {
        logger.debug('No task provided for context enrichment, using original context');
        return context;
      }

      // Determine project path from context or use current working directory
      const projectPath = process.cwd(); // TODO: Get from project configuration

      // Create context request based on task information
      const contextRequest: ContextRequest = {
        taskDescription: task.description || task.title,
        projectPath,
        maxFiles: this.determineMaxFiles(task),
        maxContentSize: this.determineMaxContentSize(task),
        searchPatterns: this.extractSearchPatterns(task),
        priorityFileTypes: this.determineFileTypes(context),
        excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'],
        contentKeywords: this.extractContentKeywords(task)
      };

      logger.debug({
        taskId: task.id,
        searchPatterns: contextRequest.searchPatterns,
        maxFiles: contextRequest.maxFiles
      }, 'Gathering context for task decomposition');

      // Gather context using the context enrichment service
      const contextResult = await this.contextService.gatherContext(contextRequest);

      // Create enhanced context summary for the LLM
      const contextSummary = await this.contextService.createContextSummary(contextResult);

      // Enhance the project context with gathered information
      const enhancedContext: ProjectContext = {
        ...context,
        // Add context information to existing context
        codebaseContext: {
          relevantFiles: contextResult.contextFiles.map(f => ({
            path: f.filePath,
            relevance: f.relevance.overallScore,
            type: f.extension,
            size: f.charCount
          })),
          contextSummary,
          gatheringMetrics: contextResult.metrics,
          totalContextSize: contextResult.summary.totalSize,
          averageRelevance: contextResult.summary.averageRelevance
        }
      };

      logger.info({
        projectId: context.projectId,
        filesFound: contextResult.summary.totalFiles,
        totalSize: contextResult.summary.totalSize,
        averageRelevance: contextResult.summary.averageRelevance,
        gatheringTime: contextResult.metrics.totalTime
      }, 'Context enrichment completed');

      return enhancedContext;

    } catch (error) {
      logger.warn({ err: error, projectId: context.projectId }, 'Failed to enrich context, using original');
      return context;
    }
  }

  /**
   * Calculate session statistics
   */
  private calculateSessionStats(session: DecompositionSession): void {
    if (session.results.length === 0) return;

    const mainResult = session.results[0];

    // Count total atomic tasks produced
    const countAtomicTasks = (result: DecompositionResult): number => {
      if (result.isAtomic) return 1;
      return result.subTasks.length;
    };

    session.totalTasks = countAtomicTasks(mainResult);
    session.processedTasks = session.totalTasks;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `decomp_${timestamp}_${random}`;
  }

  /**
   * Retry failed decomposition with different parameters
   */
  async retryDecomposition(
    sessionId: string,
    newConfig?: Partial<RDDConfig>
  ): Promise<DecompositionSession | null> {
    const originalSession = this.sessions.get(sessionId);
    if (!originalSession || originalSession.status !== 'failed') {
      return null;
    }

    // Create new session based on original
    const retrySessionId = `${sessionId}_retry_${Date.now()}`;

    // We need to reconstruct the original request
    // This is a limitation - in a real implementation, we'd store the original request
    logger.warn({ sessionId, retrySessionId }, 'Retry decomposition requested but original request not stored');

    return null; // Cannot retry without original request
  }

  /**
   * Get decomposition statistics
   */
  getStatistics(): {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    failedSessions: number;
    averageProcessingTime: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const completed = sessions.filter(s => s.status === 'completed');
    const failed = sessions.filter(s => s.status === 'failed');
    const active = sessions.filter(s => s.status === 'in_progress' || s.status === 'pending');

    const averageProcessingTime = completed.length > 0
      ? completed.reduce((sum, s) => {
          const duration = s.endTime ? s.endTime.getTime() - s.startTime.getTime() : 0;
          return sum + duration;
        }, 0) / completed.length
      : 0;

    return {
      totalSessions: sessions.length,
      activeSessions: active.length,
      completedSessions: completed.length,
      failedSessions: failed.length,
      averageProcessingTime
    };
  }

  /**
   * Parallel decomposition of multiple tasks (if enabled)
   */
  async decomposeMultipleTasks(
    requests: DecompositionRequest[]
  ): Promise<DecompositionSession[]> {
    logger.info({ taskCount: requests.length }, 'Starting parallel decomposition');

    const sessions = await Promise.all(
      requests.map(request => this.startDecomposition(request))
    );

    return sessions;
  }

  /**
   * Get decomposition results for a session
   */
  getResults(sessionId: string): AtomicTask[] {
    const session = this.sessions.get(sessionId);
    if (!session || session.results.length === 0) {
      return [];
    }

    const mainResult = session.results[0];
    if (mainResult.isAtomic) {
      return [mainResult.originalTask];
    }

    return mainResult.subTasks;
  }

  /**
   * Export session data for analysis
   */
  exportSession(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      session: {
        id: session.id,
        taskId: session.taskId,
        projectId: session.projectId,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        progress: session.progress,
        totalTasks: session.totalTasks,
        processedTasks: session.processedTasks,
        error: session.error
      },
      results: session.results.map(result => ({
        success: result.success,
        isAtomic: result.isAtomic,
        originalTaskId: result.originalTask.id,
        subTaskCount: result.subTasks.length,
        depth: result.depth,
        analysis: result.analysis,
        error: result.error
      }))
    };
  }

  /**
   * Helper methods for context enrichment
   */

  /**
   * Determine maximum number of files to gather based on task complexity
   */
  private determineMaxFiles(task: AtomicTask): number {
    const baseFiles = 10;

    // Increase file count for complex tasks
    if (task.estimatedHours && task.estimatedHours > 8) {
      return Math.min(baseFiles * 2, 30); // Cap at 30 files
    }

    // Increase for tasks with many dependencies or complex descriptions
    const complexityIndicators = [
      'refactor', 'architecture', 'system', 'integration',
      'framework', 'migration', 'optimization'
    ];

    const description = (task.description || task.title).toLowerCase();
    const complexityScore = complexityIndicators.filter(indicator =>
      description.includes(indicator)
    ).length;

    return Math.min(baseFiles + (complexityScore * 5), 25);
  }

  /**
   * Determine maximum content size based on task scope
   */
  private determineMaxContentSize(task: AtomicTask): number {
    const baseSize = 50000; // 50KB base

    // Increase content size for complex tasks
    if (task.estimatedHours && task.estimatedHours > 12) {
      return baseSize * 2; // 100KB for very complex tasks
    }

    if (task.estimatedHours && task.estimatedHours > 6) {
      return Math.floor(baseSize * 1.5); // 75KB for moderately complex tasks
    }

    return baseSize;
  }

  /**
   * Extract search patterns from task information
   */
  private extractSearchPatterns(task: AtomicTask): string[] {
    const patterns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Common technical patterns
    const technicalTerms = [
      'auth', 'user', 'login', 'service', 'component', 'util', 'helper',
      'api', 'endpoint', 'route', 'controller', 'model', 'view',
      'test', 'spec', 'mock', 'config', 'setup', 'init'
    ];

    // Extract patterns that appear in the task description
    technicalTerms.forEach(term => {
      if (text.includes(term)) {
        patterns.push(term);
      }
    });

    // Extract potential class/function names (CamelCase words)
    const camelCaseMatches = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g) || [];
    patterns.push(...camelCaseMatches.map(match => match.toLowerCase()));

    // Extract potential file/module names (kebab-case or snake_case)
    const moduleMatches = text.match(/[a-z]+[-_][a-z]+/g) || [];
    patterns.push(...moduleMatches);

    // Remove duplicates and return top patterns
    const uniquePatterns = [...new Set(patterns)];
    return uniquePatterns.slice(0, 8); // Limit to 8 patterns
  }

  /**
   * Extract content keywords for more targeted search
   */
  private extractContentKeywords(task: AtomicTask): string[] {
    const keywords: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Action keywords
    const actionKeywords = [
      'implement', 'create', 'add', 'remove', 'update', 'fix', 'refactor',
      'optimize', 'enhance', 'integrate', 'migrate', 'test', 'validate'
    ];

    actionKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    // Domain-specific keywords
    const domainKeywords = [
      'database', 'api', 'frontend', 'backend', 'ui', 'ux', 'security',
      'performance', 'cache', 'storage', 'network', 'validation'
    ];

    domainKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    });

    return [...new Set(keywords)].slice(0, 6); // Limit to 6 keywords
  }

  /**
   * Determine file types to include based on project context
   */
  private determineFileTypes(context: ProjectContext): string[] {
    const baseTypes = ['.ts', '.js', '.json'];

    // Add language-specific file types
    if (context.languages.includes('typescript')) {
      baseTypes.push('.tsx', '.d.ts');
    }

    if (context.languages.includes('javascript')) {
      baseTypes.push('.jsx', '.mjs');
    }

    if (context.languages.includes('python')) {
      baseTypes.push('.py', '.pyx');
    }

    if (context.languages.includes('java')) {
      baseTypes.push('.java');
    }

    if (context.languages.includes('csharp')) {
      baseTypes.push('.cs');
    }

    // Add framework-specific types
    if (context.frameworks.includes('react')) {
      baseTypes.push('.tsx', '.jsx');
    }

    if (context.frameworks.includes('vue')) {
      baseTypes.push('.vue');
    }

    if (context.frameworks.includes('angular')) {
      baseTypes.push('.component.ts', '.service.ts');
    }

    return [...new Set(baseTypes)];
  }
}
