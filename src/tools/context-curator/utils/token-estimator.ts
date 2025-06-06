/**
 * Token Estimation Utility for Context Curator
 * 
 * Provides accurate token count estimation for text content, files, and token budget validation.
 * Uses conservative estimation algorithms to ensure reliable token budget management.
 * 
 * Features:
 * - Basic text token estimation using character-to-token ratio
 * - File-specific token estimation including path overhead
 * - Token budget validation with utilization metrics
 * - Support for different content types and formats
 * - Conservative estimation to prevent token budget overruns
 */

export interface TokenEstimationResult {
  estimatedTokens: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'character_ratio' | 'word_count' | 'hybrid';
  breakdown?: {
    contentTokens: number;
    pathTokens?: number;
    metadataTokens?: number;
    formattingTokens?: number;
  };
}

export interface TokenBudgetValidation {
  isValid: boolean;
  utilizationPercentage: number;
  remainingTokens: number;
  recommendedAction: 'proceed' | 'optimize' | 'reduce_scope';
  warningLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface FileTokenEstimate {
  filePath: string;
  contentTokens: number;
  pathTokens: number;
  totalTokens: number;
  confidence: 'high' | 'medium' | 'low';
  estimationMethod: string;
}

/**
 * Token Estimation Utility Class
 * 
 * Provides comprehensive token estimation capabilities for Context Curator operations.
 * Uses multiple estimation strategies to provide accurate token counts for budget management.
 */
export class TokenEstimator {
  // Conservative character-to-token ratio based on GPT tokenization patterns
  private static readonly CHARS_PER_TOKEN = 4;
  
  // Word-to-token ratio for alternative estimation
  private static readonly WORDS_PER_TOKEN = 0.75;
  
  // Token overhead for different content types
  private static readonly OVERHEAD_RATIOS = {
    xml: 1.15,        // XML formatting adds ~15% overhead
    json: 1.10,       // JSON formatting adds ~10% overhead
    markdown: 1.05,   // Markdown formatting adds ~5% overhead
    code: 1.20,       // Code content adds ~20% overhead due to syntax
    plain: 1.0        // Plain text has no overhead
  };

  /**
   * Estimate tokens for basic text content using character-based method
   */
  static estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    
    // Remove excessive whitespace for more accurate estimation
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    return Math.ceil(normalizedText.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Estimate tokens using word-based method for comparison
   */
  static estimateTokensByWords(text: string): number {
    if (!text || text.length === 0) return 0;

    const trimmed = text.trim();
    if (trimmed.length === 0) return 0;

    const words = trimmed.split(/\s+/).length;
    return Math.ceil(words / this.WORDS_PER_TOKEN);
  }

  /**
   * Advanced token estimation with detailed breakdown and confidence scoring
   */
  static estimateTokensAdvanced(text: string, contentType: keyof typeof TokenEstimator.OVERHEAD_RATIOS = 'plain'): TokenEstimationResult {
    if (!text || text.length === 0) {
      return {
        estimatedTokens: 0,
        confidence: 'high',
        method: 'character_ratio',
        breakdown: { contentTokens: 0 }
      };
    }

    const charBasedTokens = this.estimateTokens(text);
    const wordBasedTokens = this.estimateTokensByWords(text);
    
    // Use hybrid approach: average of both methods for better accuracy
    const baseTokens = Math.ceil((charBasedTokens + wordBasedTokens) / 2);
    
    // Apply content type overhead
    const overhead = this.OVERHEAD_RATIOS[contentType];
    const finalTokens = Math.ceil(baseTokens * overhead);
    
    // Determine confidence based on text characteristics
    const confidence = this.determineConfidence(text, charBasedTokens, wordBasedTokens);
    
    return {
      estimatedTokens: finalTokens,
      confidence,
      method: 'hybrid',
      breakdown: {
        contentTokens: baseTokens,
        formattingTokens: finalTokens - baseTokens
      }
    };
  }

  /**
   * Estimate tokens for a file including path overhead
   */
  static estimateFileTokens(filePath: string, content: string, contentType?: keyof typeof TokenEstimator.OVERHEAD_RATIOS): FileTokenEstimate {
    const pathTokens = this.estimateTokens(filePath);
    
    // Determine content type from file extension if not provided
    const detectedType = contentType || this.detectContentType(filePath);
    const contentEstimation = this.estimateTokensAdvanced(content, detectedType);
    
    const totalTokens = contentEstimation.estimatedTokens + pathTokens;
    
    return {
      filePath,
      contentTokens: contentEstimation.estimatedTokens,
      pathTokens,
      totalTokens,
      confidence: contentEstimation.confidence,
      estimationMethod: `${contentEstimation.method}_with_path`
    };
  }

  /**
   * Validate token usage against budget with detailed recommendations
   */
  static validateTokenBudget(
    estimatedTokens: number, 
    maxBudget: number
  ): TokenBudgetValidation {
    const utilizationPercentage = (estimatedTokens / maxBudget) * 100;
    const remainingTokens = maxBudget - estimatedTokens;
    const isValid = estimatedTokens <= maxBudget;
    
    // Determine warning level and recommended action
    let warningLevel: TokenBudgetValidation['warningLevel'] = 'none';
    let recommendedAction: TokenBudgetValidation['recommendedAction'] = 'proceed';
    
    if (utilizationPercentage >= 100) {
      warningLevel = 'critical';
      recommendedAction = 'reduce_scope';
    } else if (utilizationPercentage >= 90) {
      warningLevel = 'high';
      recommendedAction = 'optimize';
    } else if (utilizationPercentage >= 75) {
      warningLevel = 'medium';
      recommendedAction = 'optimize';
    } else if (utilizationPercentage >= 60) {
      warningLevel = 'low';
      recommendedAction = 'proceed';
    }
    
    return {
      isValid,
      utilizationPercentage: Math.round(utilizationPercentage * 100) / 100, // Round to 2 decimal places
      remainingTokens,
      recommendedAction,
      warningLevel
    };
  }

  /**
   * Estimate tokens for multiple files with aggregation
   */
  static estimateMultipleFiles(files: Array<{ path: string; content: string }>): {
    totalTokens: number;
    fileEstimates: FileTokenEstimate[];
    budgetRecommendation: string;
  } {
    const fileEstimates = files.map(file => 
      this.estimateFileTokens(file.path, file.content)
    );
    
    const totalTokens = fileEstimates.reduce((sum, estimate) => sum + estimate.totalTokens, 0);
    
    // Provide budget recommendation based on total
    let budgetRecommendation = 'suitable_for_standard_budget';
    if (totalTokens > 100000) {
      budgetRecommendation = 'requires_large_budget';
    } else if (totalTokens > 50000) {
      budgetRecommendation = 'requires_medium_budget';
    }
    
    return {
      totalTokens,
      fileEstimates,
      budgetRecommendation
    };
  }

  /**
   * Determine confidence level based on text characteristics
   */
  private static determineConfidence(text: string, charTokens: number, wordTokens: number): 'high' | 'medium' | 'low' {
    const variance = Math.abs(charTokens - wordTokens) / Math.max(charTokens, wordTokens);
    
    // High confidence when both methods agree closely
    if (variance < 0.1) return 'high';
    
    // Medium confidence for moderate variance
    if (variance < 0.3) return 'medium';
    
    // Low confidence for high variance (unusual text patterns)
    return 'low';
  }

  /**
   * Detect content type from file extension
   */
  private static detectContentType(filePath: string): keyof typeof TokenEstimator.OVERHEAD_RATIOS {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'xml':
      case 'html':
      case 'xhtml':
        return 'xml';
      case 'json':
      case 'jsonl':
        return 'json';
      case 'md':
      case 'markdown':
      case 'rst':
        return 'markdown';
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
      case 'py':
      case 'java':
      case 'cpp':
      case 'c':
      case 'cs':
      case 'php':
      case 'rb':
      case 'go':
      case 'rs':
      case 'swift':
      case 'kt':
        return 'code';
      default:
        return 'plain';
    }
  }

  /**
   * Get token estimation statistics for debugging and optimization
   */
  static getEstimationStats(text: string): {
    characterCount: number;
    wordCount: number;
    lineCount: number;
    charBasedTokens: number;
    wordBasedTokens: number;
    averageWordsPerLine: number;
    averageCharsPerWord: number;
  } {
    const lines = text.split('\n');
    const words = text.trim().split(/\s+/);
    
    return {
      characterCount: text.length,
      wordCount: words.length,
      lineCount: lines.length,
      charBasedTokens: this.estimateTokens(text),
      wordBasedTokens: this.estimateTokensByWords(text),
      averageWordsPerLine: Math.round((words.length / lines.length) * 100) / 100,
      averageCharsPerWord: Math.round((text.length / words.length) * 100) / 100
    };
  }
}
