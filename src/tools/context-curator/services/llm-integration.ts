/**
 * LLM Integration Service for Context Curator
 * 
 * Handles all LLM interactions for the Context Curator workflow,
 * including format-aware calls, response validation, and error handling.
 */

import { performFormatAwareLlmCall, intelligentJsonParse } from '../../../utils/llmHelper.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { ContextCuratorConfigLoader } from './config-loader.js';
import logger from '../../../logger.js';

// Import prompt templates and validation functions
import { 
  buildIntentAnalysisPrompt, 
  INTENT_ANALYSIS_SYSTEM_PROMPT,
  validateIntentAnalysisResponse,
  getIntentAnalysisTaskId
} from '../prompts/intent-analysis.js';

import {
  buildPromptRefinementPrompt,
  PROMPT_REFINEMENT_SYSTEM_PROMPT,
  validatePromptRefinementResponse,
  getPromptRefinementTaskId
} from '../prompts/prompt-refinement.js';

import {
  buildFileDiscoveryPrompt,
  FILE_DISCOVERY_SYSTEM_PROMPT,
  validateFileDiscoveryResponse,
  getFileDiscoveryTaskId
} from '../prompts/file-discovery.js';

import {
  buildRelevanceScoringPrompt,
  RELEVANCE_SCORING_SYSTEM_PROMPT,
  validateRelevanceScoringResponse,
  enhanceRelevanceScoringResponse,
  getRelevanceScoringTaskId
} from '../prompts/relevance-scoring.js';

import {
  buildMetaPromptGenerationPrompt,
  META_PROMPT_GENERATION_SYSTEM_PROMPT,
  validateMetaPromptGenerationResponse,
  attemptResponseRecovery,
  getMetaPromptGenerationTaskId
} from '../prompts/meta-prompt-generation.js';

import type {
  IntentAnalysisResult,
  PromptRefinementResult,
  FileDiscoveryResult,
  RelevanceScoringResult,
  MetaPromptGenerationResult
} from '../types/llm-tasks.js';

/**
 * LLM Integration Service for Context Curator operations
 */
export class ContextCuratorLLMService {
  private static instance: ContextCuratorLLMService | null = null;
  private configLoader: ContextCuratorConfigLoader;

  private constructor() {
    this.configLoader = ContextCuratorConfigLoader.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ContextCuratorLLMService {
    if (!ContextCuratorLLMService.instance) {
      ContextCuratorLLMService.instance = new ContextCuratorLLMService();
    }
    return ContextCuratorLLMService.instance;
  }

  /**
   * Perform intent analysis using LLM
   */
  async performIntentAnalysis(
    userPrompt: string,
    codemapContent: string,
    config: OpenRouterConfig,
    additionalContext?: {
      projectType?: string;
      projectAnalysis?: any;
      languageAnalysis?: any;
      existingPatterns?: string[];
      patternConfidence?: { [pattern: string]: number };
      patternEvidence?: { [pattern: string]: string[] };
      technicalConstraints?: string[];
    }
  ): Promise<IntentAnalysisResult> {
    const taskId = getIntentAnalysisTaskId();
    const model = this.configLoader.getLLMModel('intent_analysis');

    logger.info({ taskId, model }, 'Starting intent analysis');

    try {
      const userPromptContent = buildIntentAnalysisPrompt(userPrompt, codemapContent, additionalContext);
      
      const responseText = await performFormatAwareLlmCall(
        userPromptContent,
        INTENT_ANALYSIS_SYSTEM_PROMPT,
        config,
        taskId,
        'json'
      );

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      const response = intelligentJsonParse(responseText, taskId);

      if (!validateIntentAnalysisResponse(response)) {
        throw new Error('Invalid intent analysis response format');
      }

      logger.info({ taskId, taskType: response.taskType, confidence: response.confidence }, 'Intent analysis completed successfully');
      return response as IntentAnalysisResult;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Intent analysis failed');
      throw new Error(`Intent analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform prompt refinement using LLM
   */
  async performPromptRefinement(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    codemapContent: string,
    config: OpenRouterConfig,
    additionalContext?: {
      projectAnalysis?: any;
      languageAnalysis?: any;
      existingPatterns?: string[];
      patternConfidence?: { [pattern: string]: number };
      patternEvidence?: { [pattern: string]: string[] };
      technicalConstraints?: string[];
      qualityRequirements?: string[];
      timelineConstraints?: string;
      teamExpertise?: string[];
    }
  ): Promise<PromptRefinementResult> {
    const taskId = getPromptRefinementTaskId();
    const model = this.configLoader.getLLMModel('prompt_refinement');

    logger.info({ taskId, model, taskType: intentAnalysis.taskType }, 'Starting prompt refinement');

    try {
      const userPromptContent = buildPromptRefinementPrompt(
        originalPrompt,
        intentAnalysis,
        codemapContent,
        additionalContext
      );
      
      const responseText = await performFormatAwareLlmCall(
        userPromptContent,
        PROMPT_REFINEMENT_SYSTEM_PROMPT,
        config,
        taskId,
        'json'
      );

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      const response = intelligentJsonParse(responseText, taskId);

      // Validate basic structure first
      if (!response || typeof response !== 'object') {
        logger.error({ taskId, response: typeof response }, 'Prompt refinement response is not an object');
        throw new Error('Invalid prompt refinement response format: not an object');
      }

      const obj = response as Record<string, unknown>;

      // Log the actual response for debugging
      logger.debug({
        taskId,
        responseKeys: Object.keys(obj),
        refinedPromptType: typeof obj.refinedPrompt,
        enhancementReasoningType: typeof obj.enhancementReasoning,
        enhancementReasoningIsArray: Array.isArray(obj.enhancementReasoning),
        enhancementReasoningLength: Array.isArray(obj.enhancementReasoning) ? obj.enhancementReasoning.length : 'not array',
        addedContextType: typeof obj.addedContext,
        addedContextIsArray: Array.isArray(obj.addedContext),
        responsePreview: JSON.stringify(obj).substring(0, 500)
      }, 'Prompt refinement response structure analysis');

      // Check for required basic fields
      if (typeof obj.refinedPrompt !== 'string' || obj.refinedPrompt.length === 0) {
        logger.error({ taskId, refinedPromptType: typeof obj.refinedPrompt, refinedPromptValue: obj.refinedPrompt }, 'Invalid refinedPrompt field');
        throw new Error('Invalid prompt refinement response format: missing or invalid refinedPrompt');
      }

      // Handle enhancementReasoning field with more flexibility
      let enhancementReasoning: string[] = [];
      if (Array.isArray(obj.enhancementReasoning)) {
        enhancementReasoning = obj.enhancementReasoning.filter(item => typeof item === 'string' && item.length > 0);
      } else if (typeof obj.enhancementReasoning === 'string') {
        // Handle case where LLM returns a single string instead of array
        enhancementReasoning = [obj.enhancementReasoning];
      } else if (obj.enhancementReasoning) {
        logger.warn({ taskId, enhancementReasoningType: typeof obj.enhancementReasoning, enhancementReasoningValue: obj.enhancementReasoning }, 'Unexpected enhancementReasoning format, attempting to convert');
        enhancementReasoning = [String(obj.enhancementReasoning)];
      }

      if (enhancementReasoning.length === 0) {
        logger.error({ taskId, originalEnhancementReasoning: obj.enhancementReasoning }, 'enhancementReasoning is empty or invalid');
        throw new Error('Invalid prompt refinement response format: missing or invalid enhancementReasoning');
      }

      // Handle addedContext field with more flexibility
      let addedContext: string[] = [];
      if (Array.isArray(obj.addedContext)) {
        addedContext = obj.addedContext.filter(item => typeof item === 'string');
      } else if (typeof obj.addedContext === 'string') {
        // Handle case where LLM returns a single string instead of array
        addedContext = [obj.addedContext];
      } else if (obj.addedContext) {
        logger.warn({ taskId, addedContextType: typeof obj.addedContext, addedContextValue: obj.addedContext }, 'Unexpected addedContext format, attempting to convert');
        addedContext = [String(obj.addedContext)];
      }

      // addedContext can be empty, so we don't throw an error for it

      // Calculate missing metrics if not provided
      const originalLength = originalPrompt.length;
      const refinedLength = obj.refinedPrompt.length;
      const enhancementCount = enhancementReasoning.length;

      // Import the helper functions
      const { calculateImprovementMetrics, extractContextualEnhancements } = await import('../prompts/prompt-refinement.js');

      const metrics = calculateImprovementMetrics(originalPrompt, obj.refinedPrompt as string, enhancementCount);
      const contextualEnhancements = extractContextualEnhancements(
        enhancementReasoning,
        addedContext
      );

      // Build complete response with calculated fields
      const completeResponse: PromptRefinementResult = {
        refinedPrompt: obj.refinedPrompt as string,
        enhancementReasoning: enhancementReasoning,
        addedContext: addedContext,
        originalLength: metrics.originalLength,
        refinedLength: metrics.refinedLength,
        improvementScore: metrics.improvementScore,
        contextualEnhancements
      };

      logger.info({
        taskId,
        refinedLength: completeResponse.refinedPrompt.length,
        enhancementCount: completeResponse.enhancementReasoning.length,
        addedContextCount: completeResponse.addedContext.length,
        improvementScore: completeResponse.improvementScore,
        contextualEnhancements: completeResponse.contextualEnhancements
      }, 'Prompt refinement completed successfully');

      return completeResponse;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Prompt refinement failed');
      throw new Error(`Prompt refinement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform file discovery using LLM
   */
  async performFileDiscovery(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    codemapContent: string,
    config: OpenRouterConfig,
    searchStrategy: 'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis' = 'semantic_similarity',
    additionalContext?: {
      filePatterns?: string[];
      excludePatterns?: string[];
      focusDirectories?: string[];
      maxFiles?: number;
      tokenBudget?: number;
    }
  ): Promise<FileDiscoveryResult> {
    const taskId = getFileDiscoveryTaskId(searchStrategy);
    const model = this.configLoader.getLLMModel('file_discovery');

    logger.info({ taskId, model, searchStrategy, taskType: intentAnalysis.taskType }, 'Starting file discovery');

    try {
      const userPromptContent = buildFileDiscoveryPrompt(
        originalPrompt,
        intentAnalysis,
        codemapContent,
        searchStrategy,
        additionalContext
      );
      
      const responseText = await performFormatAwareLlmCall(
        userPromptContent,
        FILE_DISCOVERY_SYSTEM_PROMPT,
        config,
        taskId,
        'json'
      );

      // Debug logging for file discovery response
      logger.error({
        taskId,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
        fullResponse: responseText // Include full response for debugging
      }, 'File discovery LLM response received - DEBUG');

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      const response = intelligentJsonParse(responseText, taskId);

      // Debug logging for parsed response
      logger.info({
        taskId,
        parsedResponseType: typeof response,
        parsedResponseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object',
        hasRelevantFiles: response && typeof response === 'object' && 'relevantFiles' in response,
        relevantFilesLength: response && typeof response === 'object' && 'relevantFiles' in response && Array.isArray(response.relevantFiles) ? response.relevantFiles.length : 'not an array'
      }, 'File discovery response parsed');

      // Enhanced debug logging for validation failure
      if (!validateFileDiscoveryResponse(response)) {
        logger.error({
          taskId,
          response: JSON.stringify(response, null, 2),
          validationDetails: {
            hasRelevantFiles: response && typeof response === 'object' && 'relevantFiles' in response,
            relevantFilesType: response && typeof response === 'object' && 'relevantFiles' in response ? typeof response.relevantFiles : 'missing',
            relevantFilesIsArray: response && typeof response === 'object' && 'relevantFiles' in response ? Array.isArray(response.relevantFiles) : false,
            firstFileExample: response && typeof response === 'object' && 'relevantFiles' in response && Array.isArray(response.relevantFiles) && response.relevantFiles.length > 0 ? response.relevantFiles[0] : 'no files',
            requiredFields: ['relevantFiles', 'totalFilesAnalyzed', 'processingTimeMs', 'searchStrategy', 'coverageMetrics'],
            presentFields: response && typeof response === 'object' ? Object.keys(response) : []
          }
        }, 'File discovery response validation failed - DETAILED DEBUG');

        // Try to fix abstract file names before throwing error
        const fixedResponse = this.fixAbstractFileNames(response, codemapContent, taskId);
        if (fixedResponse && validateFileDiscoveryResponse(fixedResponse)) {
          logger.info({
            taskId,
            originalFiles: response && typeof response === 'object' && 'relevantFiles' in response && Array.isArray(response.relevantFiles) ? response.relevantFiles.map((f: any) => f.path) : [],
            fixedFiles: fixedResponse.relevantFiles.map((f: any) => f.path)
          }, 'Successfully fixed abstract file names');
          return fixedResponse;
        }

        throw new Error('Invalid file discovery response format');
      }

      logger.info({
        taskId,
        filesFound: response.relevantFiles.length,
        totalAnalyzed: response.totalFilesAnalyzed,
        strategy: response.searchStrategy
      }, 'File discovery completed successfully');

      return response as FileDiscoveryResult;

    } catch (error) {
      logger.error({
        taskId,
        searchStrategy,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : undefined
      }, 'File discovery failed - DETAILED ERROR');
      throw new Error(`File discovery failed for strategy ${searchStrategy}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fix abstract file names by mapping them to actual file paths from the codemap
   */
  private fixAbstractFileNames(response: any, codemapContent: string, taskId: string): any {
    try {
      if (!response || typeof response !== 'object' || !Array.isArray(response.relevantFiles)) {
        return null;
      }

      // Extract actual file paths from codemap
      const filePathRegex = /(?:^|\s)([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+)(?:\s|$)/gm;
      const actualFilePaths = new Set<string>();
      let match;
      while ((match = filePathRegex.exec(codemapContent)) !== null) {
        actualFilePaths.add(match[1]);
      }

      // Also extract paths from directory structure patterns
      const directoryPathRegex = /(?:^|\n)\s*([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+)/gm;
      while ((match = directoryPathRegex.exec(codemapContent)) !== null) {
        actualFilePaths.add(match[1]);
      }

      const actualFilePathsArray = Array.from(actualFilePaths);
      logger.debug({
        taskId,
        extractedPaths: actualFilePathsArray.slice(0, 10), // Log first 10 for debugging
        totalPaths: actualFilePathsArray.length
      }, 'Extracted actual file paths from codemap');

      // Fix each file in the response
      const fixedFiles = response.relevantFiles.map((file: any) => {
        if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
          return file;
        }

        const originalPath = file.path;

        // If the path already looks like a real file path, keep it
        if (originalPath.includes('/') && originalPath.includes('.')) {
          return file;
        }

        // Try to find a matching actual file path
        const matchingPath = this.findBestFilePathMatch(originalPath, actualFilePathsArray);

        if (matchingPath) {
          logger.debug({
            taskId,
            originalPath,
            matchingPath
          }, 'Fixed abstract file name');

          return {
            ...file,
            path: matchingPath
          };
        }

        // If no match found, keep original (will likely fail validation)
        return file;
      });

      return {
        ...response,
        relevantFiles: fixedFiles
      };
    } catch (error) {
      logger.error({
        taskId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error fixing abstract file names');
      return null;
    }
  }

  /**
   * Find the best matching file path for an abstract name
   */
  private findBestFilePathMatch(abstractName: string, actualPaths: string[]): string | null {
    const normalizedAbstract = abstractName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Try exact matches first
    for (const path of actualPaths) {
      const fileName = path.split('/').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      if (fileName === normalizedAbstract) {
        return path;
      }
    }

    // Try partial matches
    for (const path of actualPaths) {
      const fileName = path.split('/').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      if (fileName.includes(normalizedAbstract) || normalizedAbstract.includes(fileName)) {
        return path;
      }
    }

    // Try directory + file name matches
    for (const path of actualPaths) {
      const normalizedPath = path.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedPath.includes(normalizedAbstract) || normalizedAbstract.includes(normalizedPath)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Perform relevance scoring using LLM
   */
  async performRelevanceScoring(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    refinedPrompt: string,
    fileDiscoveryResult: FileDiscoveryResult,
    config: OpenRouterConfig,
    scoringStrategy: 'semantic_similarity' | 'keyword_density' | 'structural_importance' | 'hybrid' = 'semantic_similarity',
    additionalContext?: {
      codemapContent?: string;
      projectAnalysis?: any;
      languageAnalysis?: any;
      architecturalPatterns?: any;
      priorityWeights?: {
        semantic: number;
        keyword: number;
        structural: number;
      };
      categoryFilters?: string[];
      minRelevanceThreshold?: number;
    }
  ): Promise<RelevanceScoringResult> {
    const taskId = getRelevanceScoringTaskId();
    const model = this.configLoader.getLLMModel('relevance_ranking');
    
    logger.info({ 
      taskId, 
      model, 
      scoringStrategy, 
      filesToScore: fileDiscoveryResult.relevantFiles.length 
    }, 'Starting relevance scoring');

    try {
      const userPromptContent = buildRelevanceScoringPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        fileDiscoveryResult,
        scoringStrategy,
        additionalContext
      );
      
      const responseText = await performFormatAwareLlmCall(
        userPromptContent,
        RELEVANCE_SCORING_SYSTEM_PROMPT,
        config,
        taskId,
        'json'
      );

      // Enhanced debug logging for relevance scoring response
      logger.info({
        taskId,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
        responseEnd: responseText.substring(Math.max(0, responseText.length - 200)),
        containsFileScores: responseText.includes('fileScores'),
        containsOverallMetrics: responseText.includes('overallMetrics'),
        containsScoringStrategy: responseText.includes('scoringStrategy'),
        startsWithBrace: responseText.trim().startsWith('{'),
        endsWithBrace: responseText.trim().endsWith('}')
      }, 'Relevance scoring LLM response received - DETAILED DEBUG');

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      const response = intelligentJsonParse(responseText, taskId);

      // Add fallback logic for missing fields
      const enhancedResponse = enhanceRelevanceScoringResponse(response, scoringStrategy, fileDiscoveryResult.processingTimeMs);

      if (!validateRelevanceScoringResponse(enhancedResponse)) {
        logger.error({
          taskId,
          originalResponse: response,
          enhancedResponse,
          responseKeys: enhancedResponse && typeof enhancedResponse === 'object' ? Object.keys(enhancedResponse) : 'not an object'
        }, 'Enhanced relevance scoring response validation failed');
        throw new Error('Invalid relevance scoring response format after enhancement');
      }

      const typedResponse = enhancedResponse as RelevanceScoringResult;

      logger.info({
        taskId,
        filesScored: typedResponse.fileScores.length,
        averageRelevance: typedResponse.overallMetrics.averageRelevance,
        highRelevanceCount: typedResponse.overallMetrics.highRelevanceCount
      }, 'Relevance scoring completed successfully');

      return typedResponse;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Relevance scoring failed');
      throw new Error(`Relevance scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform meta-prompt generation using LLM
   */
  async performMetaPromptGeneration(
    originalPrompt: string,
    intentAnalysis: IntentAnalysisResult,
    refinedPrompt: string,
    relevanceScoringResult: RelevanceScoringResult,
    config: OpenRouterConfig,
    additionalContext?: {
      codemapContent?: string;
      projectAnalysis?: any;
      languageAnalysis?: any;
      architecturalPatterns?: string[];
      patternConfidence?: { [pattern: string]: number };
      patternEvidence?: { [pattern: string]: string[] };
      technicalConstraints?: string[];
      qualityRequirements?: string[];
      teamExpertise?: string[];
      timelineConstraints?: string;
      existingGuidelines?: string[];
    }
  ): Promise<MetaPromptGenerationResult> {
    const taskId = getMetaPromptGenerationTaskId();
    const model = this.configLoader.getLLMModel('meta_prompt_generation');
    
    logger.info({ 
      taskId, 
      model, 
      taskType: intentAnalysis.taskType,
      relevantFiles: relevanceScoringResult.fileScores.length
    }, 'Starting meta-prompt generation');

    try {
      const userPromptContent = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult,
        additionalContext
      );
      
      const responseText = await performFormatAwareLlmCall(
        userPromptContent,
        META_PROMPT_GENERATION_SYSTEM_PROMPT,
        config,
        taskId,
        'json'
      );

      // Use intelligent JSON parsing to handle LLM responses that may contain markdown code blocks
      // This aligns with the enhanced JSON normalization pipeline used throughout the system
      let response = intelligentJsonParse(responseText, taskId);

      // Debug logging for meta-prompt generation response
      logger.info({
        taskId,
        parsedResponseType: typeof response,
        parsedResponseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object',
        hasSystemPrompt: response && typeof response === 'object' && 'systemPrompt' in response,
        hasUserPrompt: response && typeof response === 'object' && 'userPrompt' in response,
        hasContextSummary: response && typeof response === 'object' && 'contextSummary' in response,
        hasTaskDecomposition: response && typeof response === 'object' && 'taskDecomposition' in response,
        hasGuidelines: response && typeof response === 'object' && 'guidelines' in response,
        hasEstimatedComplexity: response && typeof response === 'object' && 'estimatedComplexity' in response,
        hasQualityScore: response && typeof response === 'object' && 'qualityScore' in response,
        hasAiAgentResponseFormat: response && typeof response === 'object' && 'aiAgentResponseFormat' in response,
        responsePreview: typeof response === 'object' ? JSON.stringify(response).substring(0, 500) : String(response).substring(0, 500),
        rawResponseLength: responseText.length,
        rawResponsePreview: responseText.substring(0, 300)
      }, 'Meta-prompt generation response parsed');

      // Attempt recovery if validation fails
      if (!validateMetaPromptGenerationResponse(response)) {
        logger.warn({
          taskId,
          originalResponseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object'
        }, 'Initial validation failed, attempting response recovery');

        const recoveredResponse = attemptResponseRecovery(response);

        if (validateMetaPromptGenerationResponse(recoveredResponse)) {
          logger.info({
            taskId,
            recoveredResponseKeys: recoveredResponse && typeof recoveredResponse === 'object' ? Object.keys(recoveredResponse) : 'not an object'
          }, 'Response recovery successful');
          response = recoveredResponse;
        } else {
          // Enhanced error logging for validation failure
          logger.error({
            taskId,
            originalResponse: typeof response === 'object' ? JSON.stringify(response, null, 2) : response,
            recoveredResponse: typeof recoveredResponse === 'object' ? JSON.stringify(recoveredResponse, null, 2) : recoveredResponse,
            responseType: typeof response,
            responseKeys: response && typeof response === 'object' ? Object.keys(response) : 'not an object'
          }, 'Meta-prompt generation response validation failed even after recovery attempt');
          throw new Error('Invalid meta-prompt generation response format');
        }
      }

      logger.info({
        taskId,
        qualityScore: response.qualityScore,
        complexity: response.estimatedComplexity,
        epicsCount: response.taskDecomposition.epics.length,
        guidelinesCount: response.guidelines.length
      }, 'Meta-prompt generation completed successfully');

      return response as MetaPromptGenerationResult;

    } catch (error) {
      logger.error({ taskId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Meta-prompt generation failed');
      throw new Error(`Meta-prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
