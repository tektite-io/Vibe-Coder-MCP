/**
 * Tests for CommentProcessor - Centralized comment processing with semantic preservation
 */

import { CommentProcessor } from '../utils/commentProcessor.js';
import { EnhancementConfig } from '../config/enhancementConfig.js';
import { CommentContext } from '../utils/semanticExtractor.js';

describe('CommentProcessor', () => {
  let processor: CommentProcessor;
  let mockConfig: EnhancementConfig;

  beforeEach(() => {
    mockConfig = {
      enableOptimizations: true,
      maxOptimizationLevel: 'maximum',
      contentDensity: {
        enabled: true,
        importanceThreshold: 6.0,
        maxContentLength: 25,
        layeredDetailLevels: 'aggressive',
        fileImportanceScoring: true
      },
      universalOptimization: {
        eliminateVerboseDiagrams: true,
        reduceClassDetails: true,
        consolidateRepetitiveContent: true,
        focusOnPublicInterfaces: true,
        adaptiveOptimization: true
      },
      pathCompression: {
        enabled: true,
        maxAbbreviationLength: 3,
        preserveImportantSegments: true
      },
      functionCompression: {
        enabled: true,
        compressTypeNames: true,
        compressParameterNames: true
      },
      semanticCompression: {
        enabled: true,
        removeRedundantPhrases: true,
        compressDescriptions: true
      },
      patternConsolidation: {
        enabled: true,
        maxComponentsShown: 3,
        groupArchitecturalPatterns: true,
        groupFunctionPatterns: true,
        consolidationThreshold: 3
      },
      qualityThresholds: {
        minSemanticCompleteness: 90,
        minArchitecturalIntegrity: 95,
        maxInformationLoss: 15
      }
    } as EnhancementConfig;

    processor = new CommentProcessor(mockConfig);
  });

  describe('processComment', () => {
    it('should return empty string for undefined comment', () => {
      const result = processor.processComment(undefined);
      expect(result).toBe('');
    });

    it('should return empty string when maxContentLength is 0', () => {
      mockConfig.contentDensity.maxContentLength = 0;
      processor = new CommentProcessor(mockConfig);
      
      const result = processor.processComment('This is a test comment');
      expect(result).toBe('');
    });

    it('should return original comment when within length limits', () => {
      const shortComment = 'Short comment';
      const result = processor.processComment(shortComment);
      expect(result).toBe(shortComment);
    });

    it('should preserve semantic meaning within length limits', () => {
      const longComment = 'This function processes user authentication requests and validates credentials against the database';
      const context: CommentContext = { type: 'function', name: 'authenticate' };
      
      const result = processor.processComment(longComment, context);
      
      expect(result.length).toBeLessThanOrEqual(25);
      expect(result.toLowerCase()).toMatch(/auth|process|valid/); // Should preserve key semantic terms
    });

    it('should handle class comments appropriately', () => {
      const classComment = 'This class manages user authentication and session handling for the application';
      const context: CommentContext = { type: 'class', name: 'AuthManager' };
      
      const result = processor.processComment(classComment, context);
      
      expect(result.length).toBeLessThanOrEqual(25);
      expect(result.toLowerCase()).toMatch(/auth|manage|session/);
    });

    it('should handle method comments with parent class context', () => {
      const methodComment = 'Validates user credentials and returns authentication token';
      const context: CommentContext = { 
        type: 'method', 
        name: 'validateCredentials',
        parentClass: 'AuthService'
      };
      
      const result = processor.processComment(methodComment, context);
      
      expect(result.length).toBeLessThanOrEqual(25);
      expect(result.toLowerCase()).toMatch(/valid|auth|token/);
    });

    it('should remove redundant phrases', () => {
      const verboseComment = 'This function is used to process the user authentication requests';
      const result = processor.processComment(verboseComment);
      
      expect(result).not.toContain('This function');
      expect(result).not.toContain('is used to');
      expect(result.length).toBeLessThanOrEqual(25);
    });

    it('should handle file comments', () => {
      const fileComment = 'This file contains utility functions for handling user authentication and session management';
      const context: CommentContext = { type: 'file', name: 'auth-utils.ts' };
      
      const result = processor.processComment(fileComment, context);
      
      expect(result.length).toBeLessThanOrEqual(25);
      expect(result.toLowerCase()).toMatch(/util|auth|session/);
    });

    it('should handle import comments', () => {
      const importComment = 'Authentication service for handling user login and logout operations';
      const context: CommentContext = { type: 'import', name: './auth-service' };
      
      const result = processor.processComment(importComment, context);
      
      expect(result.length).toBeLessThanOrEqual(25);
      expect(result.toLowerCase()).toMatch(/auth|service|login/);
    });

    it('should handle property comments', () => {
      const propertyComment = 'The user authentication token used for API requests';
      const context: CommentContext = { 
        type: 'property', 
        name: 'authToken',
        parentClass: 'User'
      };
      
      const result = processor.processComment(propertyComment, context);
      
      expect(result.length).toBeLessThanOrEqual(25);
      // Should preserve some meaningful content (could be 'user', 'auth', 'token', or 'api')
      expect(result.toLowerCase()).toMatch(/user|auth|token|api/);
    });

    it('should return original comment when content density is disabled', () => {
      mockConfig.contentDensity.enabled = false;
      processor = new CommentProcessor(mockConfig);

      const longComment = 'This is a very long comment that would normally be compressed but should be returned as-is when content density is disabled';
      const result = processor.processComment(longComment);

      expect(result).toBe(longComment);
    });

    it('should use semantic extraction without truncation', () => {
      const longComment = 'This function processes user authentication requests and validates credentials against the database while ensuring proper security measures are implemented throughout the process';
      const result = processor.processComment(longComment);

      expect(result.length).toBeLessThanOrEqual(25);
      // Should preserve meaningful keywords without truncation
      expect(result.toLowerCase()).toMatch(/auth|user|validation|database/);
      // Should NOT contain truncation indicator
      expect(result).not.toContain('...');
      // Should be composed of meaningful words, not truncated text
      expect(result.split(' ').every(word => word.length > 0)).toBe(true);
    });
  });

  describe('processComments', () => {
    it('should process multiple comments', () => {
      const comments = [
        { comment: 'This function handles user authentication', context: { type: 'function' as const } },
        { comment: 'This class manages database connections', context: { type: 'class' as const } },
        { comment: undefined, context: { type: 'method' as const } }
      ];
      
      const results = processor.processComments(comments);
      
      expect(results).toHaveLength(3);
      expect(results[0].length).toBeLessThanOrEqual(25);
      expect(results[1].length).toBeLessThanOrEqual(25);
      expect(results[2]).toBe('');
    });
  });

  describe('utility methods', () => {
    it('should report if processing is enabled', () => {
      expect(processor.isEnabled()).toBe(true);
      
      mockConfig.contentDensity.enabled = false;
      processor = new CommentProcessor(mockConfig);
      expect(processor.isEnabled()).toBe(false);
    });

    it('should return configured max content length', () => {
      expect(processor.getMaxContentLength()).toBe(25);
      
      mockConfig.contentDensity.maxContentLength = 50;
      processor = new CommentProcessor(mockConfig);
      expect(processor.getMaxContentLength()).toBe(50);
    });
  });
});
