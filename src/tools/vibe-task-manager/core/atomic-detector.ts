import { performDirectLlmCall } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { getLLMModelForOperation } from '../utils/config-loader.js';
import { AtomicTask, TaskPriority, TaskType } from '../types/task.js';
import { getPrompt } from '../services/prompt-service.js';
import logger from '../../../logger.js';

/**
 * Analysis result for atomic task detection
 */
export interface AtomicityAnalysis {
  isAtomic: boolean;
  confidence: number;
  reasoning: string;
  estimatedHours: number;
  complexityFactors: string[];
  recommendations: string[];
}

/**
 * Project context for task analysis
 */
export interface ProjectContext {
  projectId: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  existingTasks: AtomicTask[];
  codebaseSize: 'small' | 'medium' | 'large';
  teamSize: number;
  complexity: 'low' | 'medium' | 'high';

  /** Enhanced codebase context from context enrichment service */
  codebaseContext?: {
    relevantFiles: Array<{
      path: string;
      relevance: number;
      type: string;
      size: number;
    }>;
    contextSummary: string;
    gatheringMetrics: {
      searchTime: number;
      readTime: number;
      scoringTime: number;
      totalTime: number;
      cacheHitRate: number;
    };
    totalContextSize: number;
    averageRelevance: number;
  };
}

/**
 * Atomic task detector using AI analysis
 */
export class AtomicTaskDetector {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /**
   * Analyze if a task is atomic using multiple criteria
   */
  async analyzeTask(task: AtomicTask, context: ProjectContext): Promise<AtomicityAnalysis> {
    logger.info({ taskId: task.id, projectId: context.projectId }, 'Starting atomic task analysis');

    try {
      // Prepare analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(task, context);
      const systemPrompt = await getPrompt('atomic_detection');

      // Get LLM model for task decomposition
      const model = await getLLMModelForOperation('task_decomposition');
      logger.debug({ model, taskId: task.id }, 'Using LLM model for atomic analysis');

      // Perform LLM analysis
      const response = await performDirectLlmCall(
        analysisPrompt,
        systemPrompt,
        this.config,
        'task_decomposition',
        0.1 // Low temperature for consistent analysis
      );

      // Parse and validate response
      const analysis = this.parseAnalysisResponse(response);

      // Apply additional validation rules
      const validatedAnalysis = this.validateAnalysis(analysis, task, context);

      logger.info({
        taskId: task.id,
        isAtomic: validatedAnalysis.isAtomic,
        confidence: validatedAnalysis.confidence,
        estimatedHours: validatedAnalysis.estimatedHours
      }, 'Atomic task analysis completed');

      return validatedAnalysis;

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to analyze task atomicity');

      // Return fallback analysis
      return this.getFallbackAnalysis(task, context);
    }
  }

  /**
   * Build the analysis prompt for the LLM
   */
  private buildAnalysisPrompt(task: AtomicTask, context: ProjectContext): string {
    let prompt = `Analyze the following task to determine if it is atomic (cannot be meaningfully decomposed further):

TASK DETAILS:
- Title: ${task.title}
- Description: ${task.description}
- Type: ${task.type}
- Priority: ${task.priority}
- Estimated Hours: ${task.estimatedHours}
- Acceptance Criteria: ${task.acceptanceCriteria.join(', ')}
- File Paths: ${task.filePaths.join(', ')}

PROJECT CONTEXT:
- Project ID: ${context.projectId}
- Languages: ${context.languages.join(', ')}
- Frameworks: ${context.frameworks.join(', ')}
- Tools: ${context.tools.join(', ')}
- Codebase Size: ${context.codebaseSize}
- Team Size: ${context.teamSize}
- Project Complexity: ${context.complexity}
- Existing Tasks Count: ${context.existingTasks.length}`;

    // Add enhanced codebase context if available
    if (context.codebaseContext) {
      prompt += `

ENHANCED CODEBASE CONTEXT:
- Relevant Files Found: ${context.codebaseContext.relevantFiles.length}
- Total Context Size: ${Math.round(context.codebaseContext.totalContextSize / 1024)}KB
- Average File Relevance: ${(context.codebaseContext.averageRelevance * 100).toFixed(1)}%
- Context Gathering Time: ${context.codebaseContext.gatheringMetrics.totalTime}ms

RELEVANT FILES:
${context.codebaseContext.relevantFiles
  .slice(0, 10) // Show top 10 most relevant files
  .map(f => `- ${f.path} (${(f.relevance * 100).toFixed(1)}% relevant, ${f.type})`)
  .join('\n')}

CODEBASE INSIGHTS:
${context.codebaseContext.contextSummary.substring(0, 1000)}${context.codebaseContext.contextSummary.length > 1000 ? '...' : ''}`;
    }

    prompt += `

ANALYSIS CRITERIA:
1. Implementation Time: Can this be completed in 1-4 hours by a skilled developer?
2. Scope Clarity: Are the requirements clear and unambiguous?
3. Dependency Completeness: Are all dependencies clearly identified?
4. Acceptance Criteria: Are the success criteria specific and testable?
5. Single Responsibility: Does the task focus on one specific outcome?
6. Technical Complexity: Is the technical approach straightforward?
7. Codebase Alignment: Does the task align with existing patterns and architecture?

Please provide your analysis in the following JSON format:
{
  "isAtomic": boolean,
  "confidence": number (0-1),
  "reasoning": "detailed explanation",
  "estimatedHours": number,
  "complexityFactors": ["factor1", "factor2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;

    return prompt;
  }



  /**
   * Parse the LLM response into an AtomicityAnalysis object
   */
  private parseAnalysisResponse(response: string): AtomicityAnalysis {
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (typeof parsed.isAtomic !== 'boolean') {
        throw new Error('Invalid isAtomic field');
      }

      return {
        isAtomic: parsed.isAtomic,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        estimatedHours: Math.max(0.5, parsed.estimatedHours || 2),
        complexityFactors: Array.isArray(parsed.complexityFactors) ? parsed.complexityFactors : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
      };

    } catch (error) {
      logger.warn({ err: error, response }, 'Failed to parse LLM analysis response');
      throw new Error(`Failed to parse analysis response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply additional validation rules to the analysis
   */
  private validateAnalysis(
    analysis: AtomicityAnalysis,
    task: AtomicTask,
    context: ProjectContext
  ): AtomicityAnalysis {
    const validatedAnalysis = { ...analysis };

    // Rule 1: Tasks over 6 hours are likely not atomic
    if (validatedAnalysis.estimatedHours > 6) {
      validatedAnalysis.isAtomic = false;
      validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.3);
      validatedAnalysis.recommendations.push('Consider breaking down tasks estimated over 6 hours');
    }

    // Rule 2: Tasks with many file paths may not be atomic
    if (task.filePaths.length > 5) {
      validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.6);
      validatedAnalysis.complexityFactors.push('Multiple file modifications');
    }

    // Rule 3: Vague acceptance criteria indicate non-atomic tasks
    if (task.acceptanceCriteria.length < 2) {
      validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.7);
      validatedAnalysis.recommendations.push('Add more specific acceptance criteria');
    }

    // Rule 4: High-priority tasks in complex projects need extra scrutiny
    if (task.priority === 'critical' && context.complexity === 'high') {
      validatedAnalysis.confidence = Math.min(validatedAnalysis.confidence, 0.8);
      validatedAnalysis.complexityFactors.push('Critical task in complex project');
    }

    return validatedAnalysis;
  }

  /**
   * Provide fallback analysis when LLM analysis fails
   */
  private getFallbackAnalysis(task: AtomicTask, context: ProjectContext): AtomicityAnalysis {
    logger.warn({ taskId: task.id }, 'Using fallback atomic analysis');

    // Simple heuristic-based analysis
    const isLikelyAtomic = task.estimatedHours <= 4 &&
                          task.filePaths.length <= 3 &&
                          task.acceptanceCriteria.length >= 2;

    return {
      isAtomic: isLikelyAtomic,
      confidence: 0.4, // Low confidence for fallback
      reasoning: 'Fallback analysis based on simple heuristics due to LLM analysis failure',
      estimatedHours: task.estimatedHours,
      complexityFactors: ['LLM analysis unavailable'],
      recommendations: ['Manual review recommended due to analysis failure']
    };
  }
}
