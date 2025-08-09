/**
 * String similarity utilities for fuzzy matching and typo tolerance
 * Based on the FuzzyMatcher implementation from file-search-service
 */

/**
 * Configuration options for fuzzy matching
 */
export interface FuzzyMatchOptions {
  /** Whether matching should be case sensitive */
  caseSensitive?: boolean;
  /** Maximum allowed edit distance for typo tolerance */
  maxEditDistance?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
}

/**
 * Result of a fuzzy string match
 */
export interface FuzzyMatchResult {
  /** Similarity score between 0 and 1 */
  score: number;
  /** Whether the match exceeds the threshold */
  isMatch: boolean;
  /** Edit distance between the strings */
  editDistance: number;
  /** Type of match found */
  matchType: 'exact' | 'substring' | 'fuzzy' | 'none';
}

/**
 * String similarity utilities for fuzzy matching and typo tolerance
 */
export class StringSimilarity {
  /**
   * Calculate similarity score between query and target with typo tolerance
   * 
   * @param query The input query string
   * @param target The target string to match against
   * @param options Configuration options for matching
   * @returns Detailed match result with score and metadata
   */
  static fuzzyMatch(query: string, target: string, options: FuzzyMatchOptions = {}): FuzzyMatchResult {
    const {
      caseSensitive = false,
      maxEditDistance = 2,
      threshold = 0.6
    } = options;

    if (!query || !target) {
      return {
        score: 0,
        isMatch: false,
        editDistance: Infinity,
        matchType: 'none'
      };
    }

    const q = caseSensitive ? query : query.toLowerCase();
    const t = caseSensitive ? target : target.toLowerCase();

    // Exact match gets highest score
    if (q === t) {
      return {
        score: 1.0,
        isMatch: true,
        editDistance: 0,
        matchType: 'exact'
      };
    }

    // Check if query is substring - high score but not perfect
    if (t.includes(q)) {
      const ratio = q.length / t.length;
      const score = 0.8 + (ratio * 0.2); // 0.8-1.0 range for substring matches
      return {
        score,
        isMatch: score >= threshold,
        editDistance: t.length - q.length,
        matchType: 'substring'
      };
    }

    // Calculate Levenshtein distance for typo tolerance
    const editDistance = this.levenshteinDistance(q, t);
    
    // Early exit if edit distance is too high
    if (editDistance > maxEditDistance) {
      return {
        score: 0,
        isMatch: false,
        editDistance,
        matchType: 'none'
      };
    }

    const maxLength = Math.max(q.length, t.length);
    let similarity = 1 - (editDistance / maxLength);

    // Apply bonus for matching prefixes (common in typos)
    let prefixBonus = 0;
    const minLength = Math.min(q.length, t.length);
    for (let i = 0; i < minLength; i++) {
      if (q[i] === t[i]) {
        prefixBonus += 0.1;
      } else {
        break;
      }
    }

    // Apply bonus for matching suffixes (helps with plurals, etc.)
    let suffixBonus = 0;
    for (let i = 1; i <= minLength; i++) {
      if (q[q.length - i] === t[t.length - i]) {
        suffixBonus += 0.05;
      } else {
        break;
      }
    }

    similarity = Math.min(similarity + prefixBonus + suffixBonus, 0.79); // Cap below substring matches

    return {
      score: similarity,
      isMatch: similarity >= threshold,
      editDistance,
      matchType: similarity > 0 ? 'fuzzy' : 'none'
    };
  }

  /**
   * Fast typo tolerance check - optimized for common typo patterns
   * 
   * @param query The input query string
   * @param target The target string to match against
   * @param options Configuration options
   * @returns True if the strings are similar enough to be considered a typo match
   */
  static isTypoMatch(query: string, target: string, options: FuzzyMatchOptions = {}): boolean {
    const result = this.fuzzyMatch(query, target, {
      threshold: 0.6,
      maxEditDistance: 2,
      ...options
    });

    // Additional typo-specific checks for common patterns
    if (!result.isMatch && result.editDistance <= 2) {
      // Check for transposed characters (common typo)
      if (this.hasTransposition(query, target)) {
        return true;
      }
      
      // Check for doubled characters
      if (this.hasDoubledChar(query, target)) {
        return true;
      }
    }

    return result.isMatch;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Optimized implementation for performance
   */
  private static levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Use single array approach for better performance
    let previousRow = Array(b.length + 1).fill(0).map((_, i) => i);
    
    for (let i = 0; i < a.length; i++) {
      const currentRow = [i + 1];
      
      for (let j = 0; j < b.length; j++) {
        const insertCost = currentRow[j] + 1;
        const deleteCost = previousRow[j + 1] + 1;
        const replaceCost = previousRow[j] + (a[i] !== b[j] ? 1 : 0);
        
        currentRow.push(Math.min(insertCost, deleteCost, replaceCost));
      }
      
      previousRow = currentRow;
    }

    return previousRow[b.length];
  }

  /**
   * Check for character transposition (adjacent chars swapped)
   */
  private static hasTransposition(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) !== 0) return false;
    
    let differences = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        differences++;
        if (differences > 2) return false;
        
        // Check if next characters are swapped
        if (i + 1 < a.length && 
            a[i] === b[i + 1] && 
            a[i + 1] === b[i]) {
          // Skip next character as it's part of the transposition
          i++;
        }
      }
    }
    
    return differences === 2;
  }

  /**
   * Check for doubled character patterns (extra/missing character)
   */
  private static hasDoubledChar(a: string, b: string): boolean {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    
    if (longer.length - shorter.length !== 1) return false;
    
    let shorterIndex = 0;
    let differences = 0;
    
    for (let i = 0; i < longer.length; i++) {
      if (shorterIndex < shorter.length && longer[i] === shorter[shorterIndex]) {
        shorterIndex++;
      } else {
        differences++;
        if (differences > 1) return false;
      }
    }
    
    return shorterIndex === shorter.length && differences === 1;
  }

  /**
   * Utility method to calculate simple similarity ratio
   */
  static similarity(a: string, b: string): number {
    return this.fuzzyMatch(a, b).score;
  }
}