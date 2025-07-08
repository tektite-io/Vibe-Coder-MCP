import type { TaskPriority, AtomicTask, FunctionalArea } from '../types/task.js';
import { getStorageManager } from '../core/storage/storage-manager.js';
import { getProjectOperations } from '../core/operations/project-operations.js';
import { getEpicService } from './epic-service.js';
import { PRDIntegrationService } from '../integrations/prd-integration.js';
import type { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';

/**
 * Interface for parsed epic context
 */
export interface ParsedEpicContext {
  readonly title: string;
  readonly description: string;
  readonly priority?: TaskPriority;
  readonly tags?: readonly string[];
}

/**
 * Interface for LLM epic generation input
 */
export interface LLMEpicGenerationInput {
  readonly title: string;
  readonly description: string;
  readonly priority?: string;
  readonly tags?: readonly (string | number | boolean | null | undefined)[];
}

/**
 * Epic context resolution result
 */
export interface EpicContextResult {
  epicId: string;
  epicName: string;
  source: 'existing' | 'created' | 'fallback';
  confidence: number;
  created?: boolean;
}

/**
 * Epic-task relationship management result
 */
export interface EpicTaskRelationshipResult {
  success: boolean;
  epicId: string;
  taskId: string;
  relationshipType: 'added' | 'removed' | 'moved' | 'updated';
  previousEpicId?: string;
  metadata: {
    epicProgress?: number;
    taskCount?: number;
    completedTaskCount?: number;
    conflictsResolved?: number;
  };
}

/**
 * Epic progress tracking data
 */
export interface EpicProgressData {
  epicId: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  progressPercentage: number;
  estimatedCompletionDate?: Date;
  resourceUtilization: {
    filePathConflicts: number;
    dependencyComplexity: number;
    parallelizableTaskGroups: number;
  };
}

/**
 * Epic creation parameters for context resolver
 */
export interface EpicCreationParams {
  projectId: string;
  functionalArea?: string;
  taskContext?: {
    title: string;
    description: string;
    type: string;
    tags: string[];
  };
  priority?: TaskPriority;
  estimatedHours?: number;
  config?: OpenRouterConfig;
}

/**
 * Epic Context Resolver Service
 * Resolves epic context from project and task information with fallback strategies
 */
export class EpicContextResolver {
  private static instance: EpicContextResolver;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EpicContextResolver {
    if (!EpicContextResolver.instance) {
      EpicContextResolver.instance = new EpicContextResolver();
    }
    return EpicContextResolver.instance;
  }

  /**
   * Resolve epic context for a task
   */
  async resolveEpicContext(params: EpicCreationParams): Promise<EpicContextResult> {
    try {
      const functionalArea = params.functionalArea || await this.extractFunctionalArea(params.taskContext, params.projectId, params.config);
      logger.debug({
        projectId: params.projectId,
        functionalArea: params.functionalArea,
        extractedFunctionalArea: functionalArea,
        taskTitle: params.taskContext?.title
      }, 'Resolving epic context');

      // Strategy 1: Try to find existing epic in project
      const existingEpic = await this.findExistingEpic(params);
      if (existingEpic) {
        logger.debug({ epicId: existingEpic.epicId, source: existingEpic.source }, 'Found existing epic');
        return existingEpic;
      }

      // Strategy 2: Create new epic based on functional area
      logger.debug({ functionalArea }, 'No existing epic found, attempting to create functional area epic');
      const createdEpic = await this.createFunctionalAreaEpic(params);
      if (createdEpic) {
        logger.debug({ epicId: createdEpic.epicId, functionalArea }, 'Created new functional area epic');
        return createdEpic;
      }

      // Strategy 3: Fallback to main epic
      logger.debug('No functional area epic created, falling back to main epic');
      const fallbackEpic = await this.createMainEpic(params);
      return fallbackEpic;

    } catch (error) {
      logger.warn({ err: error, projectId: params.projectId }, 'Epic context resolution failed, attempting fallback epic creation');
      
      try {
        // Attempt to create a fallback epic with project-specific context
        const fallbackEpic = await this.createProjectSpecificFallbackEpic(params);
        return fallbackEpic;
      } catch (fallbackError) {
        logger.error({ err: fallbackError, projectId: params.projectId }, 'Fallback epic creation also failed');
        
        // Last resort: return a generic epic ID but log the issue
        return {
          epicId: `${params.projectId}-emergency-epic`,
          epicName: 'Emergency Epic',
          source: 'fallback',
          confidence: 0.1,
          created: false
        };
      }
    }
  }

  /**
   * Extract functional area from task context with enhanced LLM-powered PRD analysis and robust fallback
   */
  async extractFunctionalArea(
    taskContext?: EpicCreationParams['taskContext'], 
    projectId?: string, 
    config?: OpenRouterConfig
  ): Promise<string | null> {
    const startTime = Date.now();
    
    // Strategy 1: Enhanced LLM-powered PRD analysis with retry mechanism and validation
    if (projectId && config) {
      try {
        const prdResult = await this.extractFunctionalAreaFromPRDWithRetries(projectId, config, taskContext);
        if (prdResult) {
          logger.info({ 
            projectId, 
            functionalArea: prdResult,
            strategy: 'enhanced_prd_llm',
            duration: Date.now() - startTime
          }, 'Successfully extracted functional area using enhanced LLM-powered PRD analysis');
          return prdResult;
        }
        logger.debug({ projectId }, 'Enhanced PRD analysis completed but no functional areas extracted');
      } catch (error) {
        logger.warn({ err: error, projectId }, 'Enhanced LLM PRD analysis failed, falling back to standard functional areas');
      }
    }

    // Strategy 2: Fallback to standard 11 functional areas with smart keyword matching
    const standardArea = this.extractFromStandardFunctionalAreas(taskContext);
    if (standardArea) {
      logger.debug({ 
        projectId, 
        functionalArea: standardArea, 
        strategy: 'standard_areas',
        duration: Date.now() - startTime
      }, 'Extracted functional area using standard 11 functional areas');
    } else {
      logger.debug({ 
        projectId, 
        strategy: 'none',
        duration: Date.now() - startTime
      }, 'No functional area could be extracted using any strategy');
    }
    
    return standardArea;
  }

  /**
   * Enhanced LLM-powered PRD analysis with retry mechanism and validation feedback loop
   */
  private async extractFunctionalAreaFromPRDWithRetries(
    projectId: string,
    config: OpenRouterConfig,
    taskContext?: EpicCreationParams['taskContext'],
    maxRetries: number = 3
  ): Promise<string | null> {
    let attemptCount = 0;
    let lastError: Error | null = null;
    let validationFeedback = '';

    while (attemptCount < maxRetries) {
      try {
        attemptCount++;
        logger.debug({ projectId, attemptCount, maxRetries }, 'Attempting enhanced PRD functional area extraction');

        // Get PRD integration service
        const prdService = PRDIntegrationService.getInstance();
        const prdInfo = await prdService.detectExistingPRD(projectId);

        if (!prdInfo) {
          logger.debug({ projectId }, 'No PRD found for project, cannot extract functional areas');
          return null;
        }

        // Parse the PRD file to get the data
        const prdResult = await prdService.parsePRD(prdInfo.filePath);
        if (!prdResult.success || !prdResult.prdData) {
          logger.debug({ projectId }, 'Failed to parse PRD file, cannot extract functional areas');
          return null;
        }

        // Enhanced prompt with validation feedback from previous attempts
        const enhancedPrompt = this.buildEnhancedPRDExtractionPrompt(prdResult.prdData as unknown as Record<string, unknown>, taskContext, validationFeedback);

        // Dynamic import to avoid circular dependencies
        const { performFormatAwareLlmCall } = await import('../../../utils/llmHelper.js');

        // Call LLM with enhanced prompt
        const llmResult = await performFormatAwareLlmCall(
          enhancedPrompt,
          'You are an expert software architect analyzing PRD content to extract project-specific functional areas with high accuracy.',
          config,
          'enhanced_prd_analysis',
          'json'
        );

        // Parse and validate result
        const extractedAreas = this.parseAndValidateLLMFunctionalAreas(llmResult);
        
        if (extractedAreas.length > 0) {
          // Validation successful - return primary area
          const primaryArea = extractedAreas[0];
          logger.info({
            projectId,
            attemptCount,
            extractedAreas,
            primaryArea
          }, 'Successfully extracted and validated functional area from PRD');
          return primaryArea;
        }

        // Validation failed - prepare feedback for next attempt
        validationFeedback = this.generateValidationFeedback(llmResult, attemptCount);
        logger.warn({ 
          projectId, 
          attemptCount, 
          validationFeedback 
        }, 'PRD extraction attempt failed validation, preparing retry');

      } catch (error) {
        lastError = error as Error;
        validationFeedback = `Previous attempt ${attemptCount} failed with error: ${lastError.message}. Please ensure output is valid JSON array format.`;
        logger.warn({ 
          err: error, 
          projectId, 
          attemptCount 
        }, 'PRD extraction attempt failed with error');
      }
    }

    logger.error({ 
      projectId, 
      maxRetries, 
      lastError: lastError?.message,
      finalValidationFeedback: validationFeedback
    }, 'All PRD extraction attempts failed');
    
    return null;
  }

  /**
   * Build enhanced PRD extraction prompt with validation feedback
   */
  private buildEnhancedPRDExtractionPrompt(
    prdData: Record<string, unknown>,
    taskContext?: EpicCreationParams['taskContext'],
    validationFeedback?: string
  ): string {
    // Use centralized functional areas from type system (no hardcoded values)
    const validAreas: readonly FunctionalArea[] = [
      'authentication', 'user-management', 'content-management', 'data-management', 
      'integration', 'admin', 'ui-components', 'performance', 'frontend', 'backend', 'database'
    ] as const;

    let prompt = `Analyze the following PRD content and extract the most relevant functional areas for this project.

PRD Content:
${JSON.stringify(prdData, null, 2)}

`;

    if (taskContext) {
      prompt += `Current Task Context:
Title: ${taskContext.title}
Description: ${taskContext.description}
Type: ${taskContext.type}

`;
    }

    prompt += `Valid Functional Areas (you MUST only return areas from this list):
${validAreas.join(', ')}

Requirements:
1. Return a JSON array of strings (max 3 functional areas)
2. Areas must be EXACTLY from the valid list above
3. Order by relevance (most important first)
4. Consider the project's domain and features
5. Match areas to PRD features and requirements

`;

    if (validationFeedback) {
      prompt += `Validation Feedback from Previous Attempt:
${validationFeedback}

`;
    }

    prompt += `Expected Output Format:
["area1", "area2", "area3"]

Example Output:
["authentication", "user-management", "frontend"]`;

    return prompt;
  }

  /**
   * Parse and validate LLM functional areas with strict validation
   */
  private parseAndValidateLLMFunctionalAreas(llmResult: string): FunctionalArea[] {
    // Use centralized type system for validation (no hardcoded arrays)
    const validAreas: readonly FunctionalArea[] = [
      'authentication', 'user-management', 'content-management', 'data-management', 
      'integration', 'admin', 'ui-components', 'performance', 'frontend', 'backend', 'database'
    ] as const;
    
    try {
      // Enhanced JSON parsing with validation
      const parsed = JSON.parse(llmResult.trim());
      
      if (!Array.isArray(parsed)) {
        logger.debug({ llmResult: llmResult.substring(0, 200) }, 'LLM result is not an array');
        return [];
      }

      const validatedAreas: FunctionalArea[] = parsed
        .filter((area): area is string => typeof area === 'string')
        .map((area: string) => area.toLowerCase().trim())
        .filter((area: string): area is FunctionalArea => 
          validAreas.includes(area as FunctionalArea)
        )
        .slice(0, 3); // Limit to 3 areas

      if (validatedAreas.length === 0) {
        logger.debug({ parsed, validAreas }, 'No valid functional areas found in LLM response');
      }

      return validatedAreas;

    } catch (error) {
      // Fallback: extract using regex patterns
      logger.debug({ err: error, llmResult: llmResult.substring(0, 200) }, 'JSON parsing failed, trying regex extraction');
      
      const foundAreas: FunctionalArea[] = [];
      for (const area of validAreas) {
        if (llmResult.toLowerCase().includes(area)) {
          foundAreas.push(area);
        }
      }
      
      return foundAreas.slice(0, 3);
    }
  }

  /**
   * Generate validation feedback for failed attempts
   */
  private generateValidationFeedback(llmResult: string, attemptNumber: number): string {
    const issues: string[] = [];
    
    try {
      JSON.parse(llmResult);
    } catch {
      issues.push('Output is not valid JSON');
    }
    
    if (!llmResult.includes('[') || !llmResult.includes(']')) {
      issues.push('Output should be a JSON array format');
    }
    
    const validAreas: readonly FunctionalArea[] = [
      'authentication', 'user-management', 'content-management', 'data-management', 
      'integration', 'admin', 'ui-components', 'performance', 'frontend', 'backend', 'database'
    ] as const;
    const hasValidArea: boolean = validAreas.some((area: FunctionalArea) => 
      llmResult.toLowerCase().includes(area)
    );
    
    if (!hasValidArea) {
      issues.push('Output should contain valid functional areas from the specified list');
    }
    
    const feedback = `Attempt ${attemptNumber} issues: ${issues.join('; ')}. Please return a valid JSON array with functional areas from the specified list only.`;
    
    return feedback;
  }

  /**
   * Extract from standard 11 functional areas using smart keyword matching (replaces circular dependency)
   */
  private extractFromStandardFunctionalAreas(
    taskContext?: EpicCreationParams['taskContext']
  ): FunctionalArea | null {
    if (!taskContext) {
      return null;
    }

    const text: string = `${taskContext.title} ${taskContext.description}`.toLowerCase();
    const tags: readonly string[] = taskContext.tags?.map((tag: string) => tag.toLowerCase()) || [];

    // Type-safe functional area patterns with strict typing
    const functionalAreaPatterns: Record<FunctionalArea, readonly string[]> = {
      'authentication': ['auth', 'login', 'register', 'authentication', 'signin', 'signup', 'oauth', 'jwt', 'session', 'security', 'password'] as const,
      'user-management': ['user', 'profile', 'account', 'member', 'person', 'customer', 'admin', 'role', 'permission', 'access'] as const,
      'content-management': ['content', 'cms', 'article', 'post', 'blog', 'media', 'upload', 'file', 'document', 'asset', 'editor'] as const,
      'data-management': ['data', 'crud', 'model', 'entity', 'storage', 'persistence', 'repository', 'query', 'search', 'filter'] as const,
      'integration': ['api', 'integration', 'webhook', 'external', 'service', 'third-party', 'connector', 'sync', 'import', 'export'] as const,
      'admin': ['admin', 'dashboard', 'management', 'control', 'panel', 'settings', 'configuration', 'monitoring', 'analytics', 'administration'] as const,
      'ui-components': ['ui', 'component', 'widget', 'element', 'form', 'button', 'modal', 'layout', 'design', 'interface'] as const,
      'performance': ['performance', 'optimization', 'cache', 'speed', 'memory', 'load', 'scalability', 'efficiency', 'benchmark'] as const,
      'frontend': ['frontend', 'client', 'browser', 'react', 'vue', 'angular', 'javascript', 'typescript', 'css', 'html'] as const,
      'backend': ['backend', 'server', 'api', 'endpoint', 'service', 'controller', 'middleware', 'routing', 'business-logic'] as const,
      'database': ['database', 'db', 'sql', 'nosql', 'schema', 'table', 'collection', 'migration', 'index', 'postgres', 'mongo', 'mysql', 'redis'] as const
    };

    // Check tags first (higher priority) with type safety
    for (const tag of tags) {
      for (const [area, keywords] of Object.entries(functionalAreaPatterns)) {
        const functionalArea = area as FunctionalArea;
        if (keywords.some((keyword: string) => tag.includes(keyword))) {
          return functionalArea;
        }
      }
    }

    // Check text content with weighted scoring and strict typing
    const areaScores: Record<FunctionalArea, number> = {} as Record<FunctionalArea, number>;
    
    for (const [area, keywords] of Object.entries(functionalAreaPatterns)) {
      const functionalArea = area as FunctionalArea;
      let score: number = 0;
      for (const keyword of keywords) {
        const matches: RegExpMatchArray | null = text.match(new RegExp(keyword, 'g'));
        score += matches ? matches.length : 0;
      }
      if (score > 0) {
        areaScores[functionalArea] = score;
      }
    }

    // Return area with highest score with type safety
    const sortedEntries: Array<[FunctionalArea, number]> = Object.entries(areaScores) as Array<[FunctionalArea, number]>;
    const bestMatch: [FunctionalArea, number] | undefined = sortedEntries
      .sort(([,a], [,b]) => b - a)[0];
    
    return bestMatch ? bestMatch[0] : null;
  }

  /**
   * @deprecated - Replaced by extractFromStandardFunctionalAreas to remove circular dependency
   */
  private async extractFunctionalAreaFromTaskContext(
    taskContext: EpicCreationParams['taskContext'], 
    _config: OpenRouterConfig
  ): Promise<string | null> {
    logger.warn('extractFunctionalAreaFromTaskContext is deprecated due to circular dependency. Use extractFromStandardFunctionalAreas instead.');
    return this.extractFromStandardFunctionalAreas(taskContext);
  }

  /**
   * Synchronous method for backwards compatibility with downstream tools
   * @deprecated Use async extractFunctionalArea method instead
   */
  extractFunctionalAreaSync(taskContext?: EpicCreationParams['taskContext']): string | null {
    return this.extractFunctionalAreaFromKeywords(taskContext);
  }

  /**
   * @deprecated - Replaced by extractFromStandardFunctionalAreas for better coverage and consistency
   */
  private extractFunctionalAreaFromKeywords(taskContext?: EpicCreationParams['taskContext']): string | null {
    logger.warn('extractFunctionalAreaFromKeywords is deprecated. Use extractFromStandardFunctionalAreas instead.');
    return this.extractFromStandardFunctionalAreas(taskContext);
  }

  /**
   * Extract functional areas from PRD using LLM analysis
   */
  async extractFunctionalAreaFromPRD(
    projectId: string, 
    config: OpenRouterConfig, 
    taskContext?: EpicCreationParams['taskContext']
  ): Promise<string[]> {
    try {
      logger.debug({ projectId }, 'Attempting LLM-powered PRD functional area extraction');

      // Get PRD integration service
      const prdService = PRDIntegrationService.getInstance();

      // Detect existing PRD for the project
      const prdInfo = await prdService.detectExistingPRD(projectId);
      if (!prdInfo) {
        logger.debug({ projectId }, 'No PRD found for project');
        return [];
      }

      // Parse PRD content
      const prdResult = await prdService.parsePRD(prdInfo.filePath);
      if (!prdResult.success || !prdResult.prdData) {
        logger.warn({ projectId, error: prdResult.error }, 'Failed to parse PRD for functional area extraction');
        return [];
      }

      // Dynamic import to avoid circular dependencies
      const { performFormatAwareLlmCall } = await import('../../../utils/llmHelper.js');

      // Prepare PRD context for LLM analysis
      const prdContext = {
        features: prdResult.prdData.features,
        technical: prdResult.prdData.technical,
        overview: prdResult.prdData.overview,
        taskContext: taskContext ? {
          title: taskContext.title,
          description: taskContext.description,
          type: taskContext.type
        } : null
      };

      // Create prompt for functional area analysis
      const analysisPrompt = `Analyze the following PRD content and extract the most relevant functional areas for organizing development epics.

PRD Context:
${JSON.stringify(prdContext, null, 2)}

Please identify 3-5 functional areas that best represent the main development domains in this project. Consider:
1. Features and their primary domains (auth, api, ui, database, etc.)
2. Technical stack and architectural patterns
3. Business goals and user needs
4. Task context if provided

Return a JSON array of functional area names (lowercase, single words like "auth", "api", "ui", "database", "media", "admin", etc.).

Example response format:
["auth", "api", "ui", "database", "media"]`;

      // Call LLM for functional area analysis
      const llmResult = await performFormatAwareLlmCall(
        analysisPrompt,
        'You are an expert software architect analyzing PRD content to extract functional areas for development organization.',
        config,
        'prd_integration',
        'json'
      );

      // Parse LLM response
      const functionalAreas = this.parseLLMFunctionalAreas(llmResult);

      logger.info({
        projectId,
        prdFilePath: prdInfo.filePath,
        featureCount: prdResult.prdData.features.length,
        extractedAreas: functionalAreas
      }, 'Successfully extracted functional areas from PRD using LLM');

      return functionalAreas;

    } catch (error) {
      logger.warn({ 
        err: error, 
        projectId 
      }, 'LLM-powered PRD functional area extraction failed');
      return [];
    }
  }

  /**
   * Parse LLM response to extract functional areas
   */
  private parseLLMFunctionalAreas(llmResult: string): string[] {
    try {
      // Try to parse as JSON array
      const parsed = JSON.parse(llmResult);
      if (Array.isArray(parsed)) {
        const areas: string[] = parsed
          .filter((area): area is string => typeof area === 'string' && area.length > 0)
          .map((area: string) => area.toLowerCase().trim())
          .slice(0, 5); // Limit to 5 functional areas
        return areas;
      }

      // Fallback: extract from text using regex
      const matches = llmResult.match(/\["?([^"]+)"?(?:,\s*"?([^"]+)"?)*\]/);
      if (matches) {
        return matches[0]
          .replace(/[[\]"]/g, '')
          .split(',')
          .map(area => area.trim().toLowerCase())
          .filter(area => area.length > 0)
          .slice(0, 5);
      }

      // Last resort: look for common functional area keywords
      const commonAreas = ['auth', 'api', 'ui', 'database', 'media', 'admin', 'security', 'payment'];
      const foundAreas = commonAreas.filter(area => 
        llmResult.toLowerCase().includes(area)
      );

      return foundAreas.slice(0, 3);

    } catch (error) {
      logger.warn({ err: error, llmResult: llmResult.substring(0, 200) }, 'Failed to parse LLM functional areas response');
      return [];
    }
  }

  /**
   * Find existing epic in project
   * ONLY returns an epic if there's an exact functional area match
   */
  private async findExistingEpic(params: EpicCreationParams): Promise<EpicContextResult | null> {
    try {
      // Extract functional area from task context if not provided
      const functionalArea = params.functionalArea || await this.extractFunctionalArea(params.taskContext, params.projectId, params.config);

      // If no functional area can be determined, don't try to find existing epics
      if (!functionalArea) {
        logger.debug({ taskTitle: params.taskContext?.title }, 'No functional area extracted, skipping existing epic search');
        return null;
      }

      const projectOps = getProjectOperations();
      const projectResult = await projectOps.getProject(params.projectId);

      if (!projectResult.success || !projectResult.data) {
        return null;
      }

      const project = projectResult.data;
      if (!project.epicIds || project.epicIds.length === 0) {
        logger.debug({ functionalArea }, 'No epics exist in project yet');
        return null;
      }

      logger.debug({
        functionalArea,
        projectEpicIds: project.epicIds,
        taskTitle: params.taskContext?.title
      }, 'Searching for existing epic with exact functional area match');

      // Search for exact functional area match
      const storageManager = await getStorageManager();

      for (const epicId of project.epicIds) {
        const epicResult = await storageManager.getEpic(epicId);
        if (epicResult.success && epicResult.data) {
          const epic = epicResult.data;
          logger.debug({
            epicId: epic.id,
            epicTitle: epic.title,
            epicTags: epic.metadata.tags,
            searchingFor: functionalArea
          }, 'Checking epic for exact functional area match');

          // Check if epic tags include the exact functional area
          if (epic.metadata.tags && epic.metadata.tags.includes(functionalArea)) {
            logger.debug({ epicId: epic.id, functionalArea }, 'Found exact functional area match');
            return {
              epicId: epic.id,
              epicName: epic.title,
              source: 'existing',
              confidence: 0.9,
              created: false
            };
          }
        }
      }

      logger.debug({ functionalArea }, 'No exact functional area match found, will create new epic');
      return null;

    } catch (error) {
      logger.debug({ err: error, projectId: params.projectId }, 'Failed to find existing epic');
      return null;
    }
  }

  /**
   * Generate enhanced epic context using LLM and PRD data
   */
  private async generateEnhancedEpicContext(
    functionalArea: string, 
    params: EpicCreationParams
  ): Promise<ParsedEpicContext | null> {
    try {
      if (!params.config) {
        logger.debug({ functionalArea }, 'No config provided for LLM epic enhancement');
        return null;
      }

      // Try to get PRD context for enhancement
      let prdContext = null;
      if (params.projectId) {
        try {
          const prdService = PRDIntegrationService.getInstance();
          const prdInfo = await prdService.detectExistingPRD(params.projectId);
          if (prdInfo) {
            const prdResult = await prdService.parsePRD(prdInfo.filePath);
            if (prdResult.success && prdResult.prdData) {
              prdContext = {
                features: prdResult.prdData.features.filter(f => 
                  f.title.toLowerCase().includes(functionalArea) || 
                  f.description.toLowerCase().includes(functionalArea)
                ),
                businessGoals: prdResult.prdData.overview.businessGoals,
                productGoals: prdResult.prdData.overview.productGoals,
                technical: prdResult.prdData.technical
              };
            }
          }
        } catch (error) {
          logger.debug({ err: error }, 'Could not fetch PRD context for epic enhancement');
        }
      }

      // Dynamic import to avoid circular dependencies
      const { performFormatAwareLlmCall } = await import('../../../utils/llmHelper.js');

      const epicGenerationPrompt = `Generate an enhanced epic title and description for a development epic focused on the "${functionalArea}" functional area.

Context:
- Functional Area: ${functionalArea}
- Project ID: ${params.projectId || 'unknown'}
${params.taskContext ? `- Task Context: ${JSON.stringify(params.taskContext, null, 2)}` : ''}
${prdContext ? `- PRD Context: ${JSON.stringify(prdContext, null, 2)}` : '- No PRD context available'}

Please generate:
1. A concise, descriptive epic title that reflects the functional area and business context
2. A comprehensive epic description that includes business value and scope
3. A suggested priority level (low, medium, high, critical)
4. Relevant tags for categorization

Return a JSON object with this structure:
{
  "title": "Epic Title Here",
  "description": "Detailed epic description that explains the business value, scope, and context...",
  "priority": "medium",
  "tags": ["functionalArea", "additional", "tags"]
}

Guidelines:
- Title should be 3-8 words, business-focused
- Description should explain WHY this epic matters, not just WHAT it includes
- Priority should reflect business impact and dependencies
- Tags should include the functional area plus relevant categorization`;

      const llmResult = await performFormatAwareLlmCall(
        epicGenerationPrompt,
        'You are an expert product manager and software architect creating meaningful development epics with business context.',
        params.config,
        'epic_generation',
        'json'
      );

      // Parse LLM response
      const epicContext = this.parseEpicGenerationResult(llmResult);
      if (epicContext) {
        logger.info({
          functionalArea,
          projectId: params.projectId,
          generatedTitle: epicContext.title,
          hasPrdContext: !!prdContext
        }, 'Generated enhanced epic context using LLM');
        return epicContext;
      }

      return null;

    } catch (error) {
      logger.warn({ 
        err: error, 
        functionalArea, 
        projectId: params.projectId 
      }, 'Failed to generate enhanced epic context, using fallback');
      return null;
    }
  }

  /**
   * Parse LLM epic generation result
   */
  private parseEpicGenerationResult(llmResult: string): ParsedEpicContext | null {
    try {
      // Try to parse as JSON
      const parsed: LLMEpicGenerationInput = JSON.parse(llmResult) as LLMEpicGenerationInput;
      if (parsed && typeof parsed === 'object' && typeof parsed.title === 'string' && typeof parsed.description === 'string') {
        
        // Type-safe tag filtering
        let validTags: readonly string[] | undefined;
        if (Array.isArray(parsed.tags)) {
          const stringTags: string[] = parsed.tags.filter((tag): tag is string => 
            typeof tag === 'string' && tag.length > 0
          );
          validTags = stringTags.length > 0 ? stringTags : undefined;
        }
        
        return {
          title: parsed.title.trim(),
          description: parsed.description.trim(),
          priority: this.validatePriority(parsed.priority),
          tags: validTags
        };
      }

      // Fallback: try to extract title and description from text
      const titleMatch: RegExpMatchArray | null = llmResult.match(/"title"\s*:\s*"([^"]+)"/);
      const descMatch: RegExpMatchArray | null = llmResult.match(/"description"\s*:\s*"([^"]+)"/);
      
      if (titleMatch && descMatch) {
        return {
          title: titleMatch[1].trim(),
          description: descMatch[1].trim()
        };
      }

      return null;

    } catch (error) {
      logger.debug({ err: error, llmResult: llmResult.substring(0, 200) }, 'Failed to parse epic generation result');
      return null;
    }
  }

  /**
   * Validate and normalize priority value
   */
  private validatePriority(priority: string | number | boolean | null | undefined): TaskPriority | undefined {
    if (typeof priority === 'string') {
      const normalizedPriority: string = priority.toLowerCase();
      const validPriorities: readonly TaskPriority[] = ['low', 'medium', 'high', 'critical'] as const;
      if (validPriorities.includes(normalizedPriority as TaskPriority)) {
        return normalizedPriority as TaskPriority;
      }
    }
    return undefined;
  }

  /**
   * Create functional area epic with LLM-enhanced context
   */
  private async createFunctionalAreaEpic(params: EpicCreationParams): Promise<EpicContextResult | null> {
    try {
      const functionalArea = params.functionalArea || await this.extractFunctionalArea(params.taskContext, params.projectId, params.config);
      if (!functionalArea) {
        return null;
      }

      const epicService = getEpicService();

      // Get centralized configuration for epic time limit
      const { getVibeTaskManagerConfig } = await import('../utils/config-loader.js');
      const config = await getVibeTaskManagerConfig();
      const epicTimeLimit: number = config?.taskManager?.rddConfig?.epicTimeLimit || 400;

      // Try to generate LLM-enhanced epic context
      const enhancedContext = await this.generateEnhancedEpicContext(functionalArea, params);
      
      const epicTitle = enhancedContext?.title || `${functionalArea.charAt(0).toUpperCase() + functionalArea.slice(1)} Epic`;
      const epicDescription = enhancedContext?.description || `Epic for ${functionalArea} related tasks and features`;

      const createParams = {
        title: epicTitle,
        description: epicDescription,
        projectId: params.projectId,
        priority: enhancedContext?.priority || params.priority || 'medium',
        estimatedHours: params.estimatedHours || epicTimeLimit,
        tags: enhancedContext?.tags ? [...enhancedContext.tags] : [functionalArea, 'auto-created']
      };

      logger.info({
        functionalArea,
        epicTitle,
        projectId: params.projectId,
        createParams
      }, 'Attempting to create functional area epic');

      const createResult = await epicService.createEpic(createParams, 'epic-context-resolver');

      logger.info({
        createResult: {
          success: createResult.success,
          error: createResult.error,
          dataExists: !!createResult.data,
          epicId: createResult.data?.id
        },
        functionalArea,
        projectId: params.projectId
      }, 'Epic creation result');

      if (createResult.success && createResult.data) {
        // Update project epic association
        await this.updateProjectEpicAssociation(params.projectId, createResult.data.id);

        logger.info({
          epicId: createResult.data.id,
          epicTitle,
          functionalArea,
          projectId: params.projectId,
          source: 'created'
        }, 'Successfully created functional area epic');

        return {
          epicId: createResult.data.id,
          epicName: epicTitle,
          source: 'created',
          confidence: 0.8,
          created: true
        };
      }

      logger.warn({
        functionalArea,
        projectId: params.projectId,
        createResultSuccess: createResult.success,
        createResultError: createResult.error,
        hasData: !!createResult.data
      }, 'Epic creation failed - no epic data returned');

      return null;
    } catch (error) {
      logger.debug({ err: error, projectId: params.projectId }, 'Failed to create functional area epic');
      return null;
    }
  }

  /**
   * Create main epic as fallback
   */
  private async createMainEpic(params: EpicCreationParams): Promise<EpicContextResult> {
    try {
      const epicService = getEpicService();
      const epicTitle = 'Main Epic';
      const epicDescription = 'Main epic for project tasks and features';

      const createResult = await epicService.createEpic({
        title: epicTitle,
        description: epicDescription,
        projectId: params.projectId,
        priority: params.priority || 'medium',
        estimatedHours: params.estimatedHours || 80,
        tags: ['main', 'auto-created']
      }, 'epic-context-resolver');

      if (createResult.success && createResult.data) {
        // Update project epic association
        await this.updateProjectEpicAssociation(params.projectId, createResult.data.id);

        return {
          epicId: createResult.data.id,
          epicName: epicTitle,
          source: 'created',
          confidence: 0.6,
          created: true
        };
      }

      // Ultimate fallback
      return {
        epicId: `${params.projectId}-main-epic`,
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.3,
        created: false
      };

    } catch (error) {
      logger.warn({ err: error, projectId: params.projectId }, 'Failed to create main epic, using fallback');
      
      return {
        epicId: `${params.projectId}-main-epic`,
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.1,
        created: false
      };
    }
  }

  /**
   * Add task to epic with bidirectional relationship management
   */
  async addTaskToEpic(taskId: string, epicId: string, _projectId: string): Promise<EpicTaskRelationshipResult> {
    try {
      const storageManager = await getStorageManager();
      
      // Get task and epic
      const [taskResult, epicResult] = await Promise.all([
        storageManager.getTask(taskId),
        storageManager.getEpic(epicId)
      ]);

      if (!taskResult.success || !taskResult.data || !epicResult.success || !epicResult.data) {
        throw new Error('Task or epic not found');
      }

      const task = taskResult.data;
      const epic = epicResult.data;

      // Update task's epic association
      task.epicId = epicId;
      task.metadata.updatedAt = new Date();

      // Update epic's task list
      if (!epic.taskIds.includes(taskId)) {
        epic.taskIds.push(taskId);
        epic.metadata.updatedAt = new Date();
      }

      // Save both updates
      const [taskUpdateResult, epicUpdateResult] = await Promise.all([
        storageManager.updateTask(taskId, task),
        storageManager.updateEpic(epicId, epic)
      ]);

      if (!taskUpdateResult.success || !epicUpdateResult.success) {
        throw new Error('Failed to update task-epic relationship');
      }

      // Calculate updated progress
      const progressData = await this.calculateEpicProgress(epicId);

      logger.debug({ taskId, epicId, progress: progressData.progressPercentage }, 'Added task to epic');

      return {
        success: true,
        epicId,
        taskId,
        relationshipType: 'added',
        metadata: {
          epicProgress: progressData.progressPercentage,
          taskCount: progressData.totalTasks,
          completedTaskCount: progressData.completedTasks,
          conflictsResolved: await this.resolveResourceConflicts(epicId)
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId, epicId }, 'Failed to add task to epic');
      return {
        success: false,
        epicId,
        taskId,
        relationshipType: 'added',
        metadata: {}
      };
    }
  }

  /**
   * Move task between epics with conflict resolution
   */
  async moveTaskBetweenEpics(taskId: string, fromEpicId: string, toEpicId: string, _projectId: string): Promise<EpicTaskRelationshipResult> {
    try {
      const storageManager = await getStorageManager();
      
      // Get task and both epics
      const [taskResult, fromEpicResult, toEpicResult] = await Promise.all([
        storageManager.getTask(taskId),
        storageManager.getEpic(fromEpicId),
        storageManager.getEpic(toEpicId)
      ]);

      if (!taskResult.success || !taskResult.data) {
        throw new Error('Task not found');
      }

      const task = taskResult.data;

      // Remove from source epic
      if (fromEpicResult.success && fromEpicResult.data) {
        const fromEpic = fromEpicResult.data;
        fromEpic.taskIds = fromEpic.taskIds.filter((id: string) => id !== taskId);
        fromEpic.metadata.updatedAt = new Date();
        await storageManager.updateEpic(fromEpicId, fromEpic);
      }

      // Add to destination epic
      if (toEpicResult.success && toEpicResult.data) {
        const toEpic = toEpicResult.data;
        if (!toEpic.taskIds.includes(taskId)) {
          toEpic.taskIds.push(taskId);
          toEpic.metadata.updatedAt = new Date();
          await storageManager.updateEpic(toEpicId, toEpic);
        }
      }

      // Update task's epic association
      task.epicId = toEpicId;
      task.metadata.updatedAt = new Date();
      await storageManager.updateTask(taskId, task);

      // Calculate progress for both epics
      const [fromProgress, toProgress] = await Promise.all([
        this.calculateEpicProgress(fromEpicId),
        this.calculateEpicProgress(toEpicId)
      ]);

      // Resolve any resource conflicts in the destination epic
      const conflictsResolved = await this.resolveResourceConflicts(toEpicId);

      logger.info({ 
        taskId, 
        fromEpicId, 
        toEpicId, 
        fromProgress: fromProgress.progressPercentage,
        toProgress: toProgress.progressPercentage,
        conflictsResolved
      }, 'Moved task between epics');

      return {
        success: true,
        epicId: toEpicId,
        taskId,
        relationshipType: 'moved',
        previousEpicId: fromEpicId,
        metadata: {
          epicProgress: toProgress.progressPercentage,
          taskCount: toProgress.totalTasks,
          completedTaskCount: toProgress.completedTasks,
          conflictsResolved
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId, fromEpicId, toEpicId }, 'Failed to move task between epics');
      return {
        success: false,
        epicId: toEpicId,
        taskId,
        relationshipType: 'moved',
        previousEpicId: fromEpicId,
        metadata: {}
      };
    }
  }

  /**
   * Calculate real-time epic progress with comprehensive metrics
   */
  async calculateEpicProgress(epicId: string): Promise<EpicProgressData> {
    try {
      const storageManager = await getStorageManager();
      const epicResult = await storageManager.getEpic(epicId);

      if (!epicResult.success || !epicResult.data) {
        throw new Error('Epic not found');
      }

      const epic = epicResult.data;
      
      // Get all tasks for this epic
      const taskPromises = epic.taskIds.map((taskId: string) => storageManager.getTask(taskId));
      const taskResults = await Promise.all(taskPromises);
      const tasks = taskResults
        .filter(result => result.success && result.data)
        .map(result => result.data!);

      // Calculate progress metrics
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => task.status === 'completed').length;
      const inProgressTasks = tasks.filter(task => task.status === 'in_progress').length;
      const blockedTasks = tasks.filter(task => task.status === 'blocked').length;
      const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Calculate resource utilization
      const filePathConflicts = this.detectFilePathConflicts(tasks);
      const dependencyComplexity = await this.calculateDependencyComplexity(epic.taskIds);
      const parallelizableTaskGroups = await this.identifyParallelizableGroups(epic.taskIds);

      // Estimate completion date based on remaining work and velocity
      const estimatedCompletionDate = this.estimateCompletionDate(tasks, progressPercentage);

      const progressData: EpicProgressData = {
        epicId,
        totalTasks,
        completedTasks,
        inProgressTasks,
        blockedTasks,
        progressPercentage,
        estimatedCompletionDate,
        resourceUtilization: {
          filePathConflicts,
          dependencyComplexity,
          parallelizableTaskGroups
        }
      };

      logger.debug({ epicId, progressData }, 'Calculated epic progress');
      return progressData;

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to calculate epic progress');
      return {
        epicId,
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        blockedTasks: 0,
        progressPercentage: 0,
        resourceUtilization: {
          filePathConflicts: 0,
          dependencyComplexity: 0,
          parallelizableTaskGroups: 0
        }
      };
    }
  }

  /**
   * Automatically update epic status based on task completion
   */
  async updateEpicStatusFromTasks(epicId: string): Promise<boolean> {
    try {
      const progressData = await this.calculateEpicProgress(epicId);
      const storageManager = await getStorageManager();
      const epicResult = await storageManager.getEpic(epicId);

      if (!epicResult.success || !epicResult.data) {
        return false;
      }

      const epic = epicResult.data;
      let statusChanged = false;

      // Determine new status based on progress
      let newStatus = epic.status;
      
      if (progressData.totalTasks === 0) {
        newStatus = 'pending';
      } else if (progressData.completedTasks === progressData.totalTasks) {
        newStatus = 'completed';
      } else if (progressData.inProgressTasks > 0 || progressData.completedTasks > 0) {
        newStatus = 'in_progress';
      } else if (progressData.blockedTasks === progressData.totalTasks) {
        newStatus = 'blocked';
      } else {
        newStatus = 'pending';
      }

      if (newStatus !== epic.status) {
        epic.status = newStatus;
        epic.metadata.updatedAt = new Date();
        
        const updateResult = await storageManager.updateEpic(epicId, epic);
        if (updateResult.success) {
          statusChanged = true;
          logger.info({ epicId, oldStatus: epic.status, newStatus, progressData }, 'Updated epic status from task completion');
        }
      }

      return statusChanged;

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to update epic status from tasks');
      return false;
    }
  }

  /**
   * Resolve resource conflicts within an epic
   */
  private async resolveResourceConflicts(epicId: string): Promise<number> {
    try {
      const storageManager = await getStorageManager();
      const epicResult = await storageManager.getEpic(epicId);

      if (!epicResult.success || !epicResult.data) {
        return 0;
      }

      const epic = epicResult.data;
      const taskPromises = epic.taskIds.map((taskId: string) => storageManager.getTask(taskId));
      const taskResults = await Promise.all(taskPromises);
      const tasks = taskResults
        .filter(result => result.success && result.data)
        .map(result => result.data!);

      // Detect and resolve file path conflicts
      const conflicts = this.detectFilePathConflicts(tasks);
      
      // For now, just log the conflicts - future enhancement could automatically suggest task sequencing
      if (conflicts > 0) {
        logger.warn({ epicId, conflicts }, 'Detected file path conflicts in epic tasks');
      }

      return conflicts;

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to resolve resource conflicts');
      return 0;
    }
  }

  /**
   * Detect file path conflicts between tasks
   */
  private detectFilePathConflicts(tasks: AtomicTask[]): number {
    const filePathMap = new Map<string, string[]>();
    
    // Group tasks by file paths
    tasks.forEach(task => {
      (task as AtomicTask).filePaths.forEach((filePath: string) => {
        if (!filePathMap.has(filePath)) {
          filePathMap.set(filePath, []);
        }
        filePathMap.get(filePath)!.push((task as AtomicTask).id);
      });
    });

    // Count conflicts (file paths used by multiple tasks)
    let conflicts = 0;
    filePathMap.forEach((taskIds) => {
      if (taskIds.length > 1) {
        conflicts++;
      }
    });

    return conflicts;
  }

  /**
   * Calculate dependency complexity for epic tasks
   */
  private async calculateDependencyComplexity(taskIds: string[]): Promise<number> {
    try {
      const storageManager = await getStorageManager();
      
      // Get dependency information for all tasks
      let totalDependencies = 0;
      for (const taskId of taskIds) {
        const dependencies = await storageManager.getDependenciesForTask(taskId);
        if (dependencies.success && dependencies.data) {
          totalDependencies += dependencies.data.length;
        }
      }

      // Normalize complexity (0-10 scale)
      const complexity = Math.min(Math.floor(totalDependencies / taskIds.length), 10);
      return complexity;

    } catch (error) {
      logger.debug({ err: error, taskIds }, 'Failed to calculate dependency complexity');
      return 0;
    }
  }

  /**
   * Identify parallelizable task groups
   */
  private async identifyParallelizableGroups(taskIds: string[]): Promise<number> {
    try {
      const storageManager = await getStorageManager();
      
      // Simple heuristic: tasks without dependencies can be parallelized
      let parallelizable = 0;
      for (const taskId of taskIds) {
        const dependencies = await storageManager.getDependenciesForTask(taskId);
        if (dependencies.success && dependencies.data && dependencies.data.length === 0) {
          parallelizable++;
        }
      }

      return parallelizable;

    } catch (error) {
      logger.debug({ err: error, taskIds }, 'Failed to identify parallelizable groups');
      return 0;
    }
  }

  /**
   * Estimate completion date based on task progress
   */
  private estimateCompletionDate(tasks: AtomicTask[], progressPercentage: number): Date | undefined {
    if (tasks.length === 0 || progressPercentage >= 100) {
      return undefined;
    }

    // Simple estimation based on average task completion time
    const totalEstimatedHours = tasks.reduce((sum, task) => sum + ((task as AtomicTask).estimatedHours || 0), 0);
    const remainingHours = (totalEstimatedHours as number) * ((100 - progressPercentage) / 100);
    
    // Assume 8 hours per working day
    const workingDaysRemaining = Math.ceil(remainingHours / 8);
    
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + workingDaysRemaining);
    
    return estimatedDate;
  }

  /**
   * Update project epic association
   */
  private async updateProjectEpicAssociation(projectId: string, epicId: string): Promise<void> {
    try {
      const storageManager = await getStorageManager();
      const projectResult = await storageManager.getProject(projectId);

      if (projectResult.success && projectResult.data) {
        const project = projectResult.data;
        if (!project.epicIds.includes(epicId)) {
          project.epicIds.push(epicId);
          project.metadata.updatedAt = new Date();

          // Update project directly through storage manager
          const updateResult = await storageManager.updateProject(projectId, project);
          if (updateResult.success) {
            logger.debug({ projectId, epicId }, 'Updated project epic association');
          } else {
            logger.warn({ projectId, epicId, error: updateResult.error }, 'Failed to update project epic association');
          }
        }
      }
    } catch (error) {
      logger.warn({ err: error, projectId, epicId }, 'Failed to update project epic association');
    }
  }

  /**
   * Create project-specific fallback epic with context inference
   */
  private async createProjectSpecificFallbackEpic(params: EpicCreationParams): Promise<EpicContextResult> {
    try {
      const epicService = getEpicService();
      
      // Get centralized configuration for epic time limit
      const { getVibeTaskManagerConfig } = await import('../utils/config-loader.js');
      const config = await getVibeTaskManagerConfig();
      const epicTimeLimit: number = config?.taskManager?.rddConfig?.epicTimeLimit || 400;
      
      // Try to get project context for better epic naming
      let projectName = 'Unknown Project';
      let projectDescription = 'Project tasks and features';
      
      try {
        const storageManager = await getStorageManager();
        const projectResult = await storageManager.getProject(params.projectId);
        if (projectResult.success && projectResult.data) {
          projectName = projectResult.data.name;
          projectDescription = projectResult.data.description || projectDescription;
        }
      } catch (contextError) {
        logger.debug({ err: contextError }, 'Could not fetch project context for epic naming');
      }

      // Infer epic name from project context and task context
      let epicTitle = `${projectName} Development Epic`;
      let epicDescription = `Main development epic for ${projectName}: ${projectDescription}`;
      
      // If we have task context, use it to create a more specific epic
      if (params.taskContext) {
        const taskType = params.taskContext.type;
        const taskTitle = params.taskContext.title;
        
        if (taskType === 'development') {
          epicTitle = `${projectName} Development Tasks`;
          epicDescription = `Development epic for ${projectName} including: ${taskTitle}`;
        } else if (taskType === 'testing') {
          epicTitle = `${projectName} Testing & QA`;
          epicDescription = `Testing and quality assurance epic for ${projectName}`;
        } else if (taskType === 'documentation') {
          epicTitle = `${projectName} Documentation`;
          epicDescription = `Documentation epic for ${projectName}`;
        } else {
          epicTitle = `${projectName} ${taskType.charAt(0).toUpperCase() + taskType.slice(1)} Epic`;
          epicDescription = `${taskType} epic for ${projectName}: ${taskTitle}`;
        }
      }

      const createResult = await epicService.createEpic({
        title: epicTitle,
        description: epicDescription,
        projectId: params.projectId,
        priority: params.priority || 'medium',
        estimatedHours: params.estimatedHours || epicTimeLimit,
        tags: ['auto-created', 'fallback', 'project-specific']
      }, 'epic-context-resolver-fallback');

      if (createResult.success && createResult.data) {
        // Update project epic association
        await this.updateProjectEpicAssociation(params.projectId, createResult.data.id);

        logger.info({
          projectId: params.projectId,
          epicId: createResult.data.id,
          epicTitle,
          source: 'fallback'
        }, 'Created project-specific fallback epic');

        return {
          epicId: createResult.data.id,
          epicName: epicTitle,
          source: 'created',
          confidence: 0.6, // Medium confidence for fallback
          created: true
        };
      }

      throw new Error(`Failed to create fallback epic: ${createResult.error}`);
    } catch (error) {
      logger.error({ err: error, projectId: params.projectId }, 'Failed to create project-specific fallback epic');
      throw error;
    }
  }
}

/**
 * Get singleton instance of Epic Context Resolver
 */
export function getEpicContextResolver(): EpicContextResolver {
  return EpicContextResolver.getInstance();
}
