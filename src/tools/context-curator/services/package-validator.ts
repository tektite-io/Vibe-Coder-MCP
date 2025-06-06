/**
 * Package Validator Service for Context Curator
 * 
 * Validates context packages for quality, completeness, and correctness
 * before final output generation.
 */

import { z } from 'zod';
import logger from '../../../logger.js';
import type { ContextPackage } from '../types/context-curator.js';
import { contextPackageSchema } from '../types/context-curator.js';

export interface ValidationResult {
  /** Whether the package is valid */
  isValid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
  /** Overall quality score (0-1) */
  qualityScore: number;
  /** Detailed quality metrics */
  qualityMetrics: QualityMetrics;
}

export interface QualityMetrics {
  /** Schema compliance score (0-1) */
  schemaCompliance: number;
  /** Content completeness score (0-1) */
  contentCompleteness: number;
  /** Meta-prompt quality score (0-1) */
  metaPromptQuality: number;
  /** File relevance score (0-1) */
  fileRelevance: number;
  /** Token efficiency score (0-1) */
  tokenEfficiency: number;
  /** Task decomposition quality (0-1) */
  taskDecompositionQuality: number;
}

export class PackageValidator {
  private static readonly MIN_QUALITY_SCORE = 0.7;
  private static readonly MIN_FILES_COUNT = 1;
  private static readonly MAX_TOKEN_COUNT = 100000;
  private static readonly MIN_RELEVANCE_SCORE = 0.3;

  /**
   * Validate and score a context package
   */
  static async validatePackage(
    contextPackage: ContextPackage
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.info({ packageId: contextPackage.id }, 'Starting package validation');

    try {
      // Schema validation
      const schemaCompliance = this.validateSchema(contextPackage, errors);

      // Content validation
      const contentCompleteness = this.validateContent(contextPackage, errors, warnings);

      // Meta-prompt validation
      const metaPromptQuality = this.validateMetaPrompt(contextPackage, errors, warnings);

      // File relevance validation
      const fileRelevance = this.validateFileRelevance(contextPackage, warnings);

      // Token efficiency validation
      const tokenEfficiency = this.validateTokenEfficiency(contextPackage, warnings);

      // Task decomposition validation
      const taskDecompositionQuality = this.validateTaskDecomposition(contextPackage, warnings);

      // Calculate quality metrics
      const qualityMetrics: QualityMetrics = {
        schemaCompliance,
        contentCompleteness,
        metaPromptQuality,
        fileRelevance,
        tokenEfficiency,
        taskDecompositionQuality
      };

      // Calculate overall quality score
      const qualityScore = this.calculateOverallQualityScore(qualityMetrics);

      const result: ValidationResult = {
        isValid: errors.length === 0 && qualityScore >= this.MIN_QUALITY_SCORE,
        errors,
        warnings,
        qualityScore,
        qualityMetrics
      };

      logger.info({
        packageId: contextPackage.id,
        isValid: result.isValid,
        qualityScore: result.qualityScore,
        errorsCount: errors.length,
        warningsCount: warnings.length
      }, 'Package validation completed');

      return result;

    } catch (error) {
      logger.error({
        packageId: contextPackage.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Package validation failed');

      return {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        qualityScore: 0,
        qualityMetrics: {
          schemaCompliance: 0,
          contentCompleteness: 0,
          metaPromptQuality: 0,
          fileRelevance: 0,
          tokenEfficiency: 0,
          taskDecompositionQuality: 0
        }
      };
    }
  }

  /**
   * Validate schema compliance
   */
  private static validateSchema(contextPackage: ContextPackage, errors: string[]): number {
    try {
      contextPackageSchema.parse(contextPackage);
      return 1.0; // Perfect schema compliance
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          errors.push(`Schema validation error: ${err.path.join('.')} - ${err.message}`);
        });
        // Partial score based on number of errors
        const errorRatio = Math.min(error.errors.length / 10, 1);
        return Math.max(0, 1 - errorRatio);
      }
      errors.push('Unknown schema validation error');
      return 0;
    }
  }

  /**
   * Validate content completeness
   */
  private static validateContent(
    contextPackage: ContextPackage,
    errors: string[],
    warnings: string[]
  ): number {
    let score = 1.0;

    // Check minimum files count
    if (contextPackage.files.length < this.MIN_FILES_COUNT) {
      errors.push(`Insufficient files: ${contextPackage.files.length} < ${this.MIN_FILES_COUNT}`);
      score -= 0.3;
    }

    // Check for empty user prompt
    if (!contextPackage.userPrompt || contextPackage.userPrompt.trim().length === 0) {
      errors.push('User prompt is empty');
      score -= 0.2;
    }

    // Check for missing project path
    if (!contextPackage.projectPath || contextPackage.projectPath.trim().length === 0) {
      errors.push('Project path is empty');
      score -= 0.2;
    }

    // Check for missing task type
    if (!contextPackage.taskType) {
      errors.push('Task type is missing');
      score -= 0.1;
    }

    // Check statistics validity
    if (contextPackage.statistics.totalFiles !== contextPackage.files.length) {
      warnings.push('Statistics total files mismatch with actual files count');
      score -= 0.1;
    }

    // Check for reasonable token counts
    if (contextPackage.statistics.totalTokens > this.MAX_TOKEN_COUNT) {
      warnings.push(`High token count: ${contextPackage.statistics.totalTokens} > ${this.MAX_TOKEN_COUNT}`);
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Validate meta-prompt quality
   */
  private static validateMetaPrompt(
    contextPackage: ContextPackage,
    errors: string[],
    warnings: string[]
  ): number {
    let score = 1.0;

    if (!contextPackage.metaPrompt) {
      errors.push('Meta-prompt is missing');
      return 0;
    }

    const metaPrompt = contextPackage.metaPrompt;

    // Check system prompt
    if (!metaPrompt.systemPrompt || metaPrompt.systemPrompt.trim().length < 50) {
      errors.push('System prompt is missing or too short');
      score -= 0.2;
    }

    // Check user prompt
    if (!metaPrompt.userPrompt || metaPrompt.userPrompt.trim().length < 20) {
      errors.push('Meta-prompt user prompt is missing or too short');
      score -= 0.2;
    }

    // Check context summary
    if (!metaPrompt.contextSummary || metaPrompt.contextSummary.trim().length < 50) {
      warnings.push('Context summary is missing or too short');
      score -= 0.1;
    }

    // Check guidelines
    if (!metaPrompt.guidelines || metaPrompt.guidelines.length === 0) {
      warnings.push('No guidelines provided in meta-prompt');
      score -= 0.1;
    }

    // Check estimated complexity
    if (!metaPrompt.estimatedComplexity) {
      warnings.push('Estimated complexity is missing');
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Validate file relevance scores
   */
  private static validateFileRelevance(
    contextPackage: ContextPackage,
    warnings: string[]
  ): number {
    if (contextPackage.files.length === 0) {
      return 0;
    }

    let totalRelevance = 0;
    let lowRelevanceCount = 0;

    for (const file of contextPackage.files) {
      const relevance = file.relevanceScore.score;
      totalRelevance += relevance;

      if (relevance < this.MIN_RELEVANCE_SCORE) {
        lowRelevanceCount++;
      }
    }

    const averageRelevance = totalRelevance / contextPackage.files.length;

    if (lowRelevanceCount > contextPackage.files.length * 0.3) {
      warnings.push(`High number of low-relevance files: ${lowRelevanceCount}/${contextPackage.files.length}`);
    }

    if (averageRelevance < 0.5) {
      warnings.push(`Low average relevance score: ${averageRelevance.toFixed(2)}`);
    }

    return Math.min(1.0, averageRelevance * 2); // Scale to 0-1 range
  }

  /**
   * Validate token efficiency
   */
  private static validateTokenEfficiency(
    contextPackage: ContextPackage,
    warnings: string[]
  ): number {
    const totalTokens = contextPackage.statistics.totalTokens;
    const totalFiles = contextPackage.files.length;

    if (totalFiles === 0) {
      return 0;
    }

    const averageTokensPerFile = totalTokens / totalFiles;

    // Check for extremely large files that might need optimization
    const largeFiles = contextPackage.files.filter(file => file.file.tokenCount > 5000);
    if (largeFiles.length > 0) {
      warnings.push(`${largeFiles.length} files have high token counts (>5000 tokens)`);
    }

    // Check for very small files that might not be useful
    const smallFiles = contextPackage.files.filter(file => file.file.tokenCount < 50);
    if (smallFiles.length > totalFiles * 0.3) {
      warnings.push(`${smallFiles.length} files have very low token counts (<50 tokens)`);
    }

    // Calculate efficiency score based on token distribution
    let efficiencyScore = 1.0;

    if (averageTokensPerFile > 3000) {
      efficiencyScore -= 0.2; // Penalty for very large average
    }

    if (averageTokensPerFile < 100) {
      efficiencyScore -= 0.2; // Penalty for very small average
    }

    if (totalTokens > this.MAX_TOKEN_COUNT) {
      efficiencyScore -= 0.3; // Penalty for exceeding max tokens
    }

    return Math.max(0, efficiencyScore);
  }

  /**
   * Validate task decomposition quality
   */
  private static validateTaskDecomposition(
    contextPackage: ContextPackage,
    warnings: string[]
  ): number {
    if (!contextPackage.metaPrompt?.taskDecomposition) {
      warnings.push('Task decomposition is missing');
      return 0;
    }

    const decomposition = contextPackage.metaPrompt.taskDecomposition;
    let score = 1.0;

    // Check epics count
    if (!decomposition.epics || decomposition.epics.length === 0) {
      warnings.push('No epics defined in task decomposition');
      return 0;
    }

    if (decomposition.epics.length < 2) {
      warnings.push('Very few epics defined (recommended: 3-10)');
      score -= 0.2;
    }

    // Check tasks within epics
    let totalTasks = 0;
    let totalSubtasks = 0;

    for (const epic of decomposition.epics) {
      if (!epic.tasks || epic.tasks.length === 0) {
        warnings.push(`Epic "${epic.title}" has no tasks`);
        score -= 0.1;
        continue;
      }

      totalTasks += epic.tasks.length;

      for (const task of epic.tasks) {
        if (task.subtasks) {
          totalSubtasks += task.subtasks.length;
        }
      }
    }

    // Check for reasonable task distribution
    const averageTasksPerEpic = totalTasks / decomposition.epics.length;
    if (averageTasksPerEpic < 2) {
      warnings.push('Low average tasks per epic (recommended: 3-7)');
      score -= 0.1;
    }

    if (totalSubtasks === 0) {
      warnings.push('No subtasks defined (recommended for detailed planning)');
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate overall quality score from individual metrics
   */
  private static calculateOverallQualityScore(metrics: QualityMetrics): number {
    // Weighted average of quality metrics
    const weights = {
      schemaCompliance: 0.25,      // Critical - must be valid
      contentCompleteness: 0.20,   // Important - must have content
      metaPromptQuality: 0.20,     // Important - core output
      fileRelevance: 0.15,         // Moderate - affects usefulness
      tokenEfficiency: 0.10,       // Moderate - affects performance
      taskDecompositionQuality: 0.10 // Moderate - affects usability
    };

    return (
      metrics.schemaCompliance * weights.schemaCompliance +
      metrics.contentCompleteness * weights.contentCompleteness +
      metrics.metaPromptQuality * weights.metaPromptQuality +
      metrics.fileRelevance * weights.fileRelevance +
      metrics.tokenEfficiency * weights.tokenEfficiency +
      metrics.taskDecompositionQuality * weights.taskDecompositionQuality
    );
  }

  /**
   * Get validation summary for logging
   */
  static getValidationSummary(result: ValidationResult): string {
    const { isValid, qualityScore, errors, warnings } = result;
    
    return `Validation ${isValid ? 'PASSED' : 'FAILED'} - ` +
           `Quality: ${(qualityScore * 100).toFixed(1)}% - ` +
           `Errors: ${errors.length} - ` +
           `Warnings: ${warnings.length}`;
  }
}
