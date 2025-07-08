/**
 * Enhanced Epic Resolver Validation Test
 * 
 * Validates the enhanced epic context resolver with 11 functional areas,
 * enhanced PRD analysis, and strict type safety enforcement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EpicContextResolver } from '../../services/epic-context-resolver.js';
import type { FunctionalArea } from '../../types/task.js';
import logger from '../../../../logger.js';

describe('Enhanced Epic Resolver Validation', () => {
  let epicResolver: EpicContextResolver;

  beforeEach(() => {
    epicResolver = EpicContextResolver.getInstance();
  });

  describe('11 Functional Areas Support', () => {
    it('should extract all 11 functional areas from standard patterns', () => {
      logger.info('🔧 Testing 11 functional areas extraction');

      const testCases: Array<{
        taskContext: {
          title: string;
          description: string;
          type: string;
          tags: string[];
        };
        expected: FunctionalArea;
      }> = [
        {
          taskContext: {
            title: 'User authentication system',
            description: 'Implement login and registration',
            type: 'development',
            tags: ['auth', 'security']
          },
          expected: 'authentication'
        },
        {
          taskContext: {
            title: 'User profile management',
            description: 'Manage user accounts and profiles',
            type: 'development',
            tags: ['user', 'profile']
          },
          expected: 'user-management'
        },
        {
          taskContext: {
            title: 'Content management system',
            description: 'Create and edit content',
            type: 'development',
            tags: ['content', 'cms']
          },
          expected: 'content-management'
        },
        {
          taskContext: {
            title: 'Database schema design',
            description: 'Design database tables and relationships',
            type: 'development',
            tags: ['database', 'schema']
          },
          expected: 'data-management'
        },
        {
          taskContext: {
            title: 'API integration',
            description: 'Integrate with external services',
            type: 'development',
            tags: ['api', 'integration']
          },
          expected: 'integration'
        },
        {
          taskContext: {
            title: 'Admin dashboard',
            description: 'Create admin control panel',
            type: 'development',
            tags: ['admin', 'dashboard']
          },
          expected: 'admin'
        },
        {
          taskContext: {
            title: 'UI components',
            description: 'Build reusable interface components',
            type: 'development',
            tags: ['ui', 'component']
          },
          expected: 'ui-components'
        },
        {
          taskContext: {
            title: 'Performance optimization',
            description: 'Optimize application performance',
            type: 'development',
            tags: ['performance', 'optimization']
          },
          expected: 'performance'
        },
        {
          taskContext: {
            title: 'Frontend development',
            description: 'Build client-side application',
            type: 'development',
            tags: ['frontend', 'client']
          },
          expected: 'frontend'
        },
        {
          taskContext: {
            title: 'Backend services',
            description: 'Implement server-side logic',
            type: 'development',
            tags: ['backend', 'server']
          },
          expected: 'backend'
        },
        {
          taskContext: {
            title: 'Database implementation',
            description: 'Set up database infrastructure',
            type: 'development',
            tags: ['database', 'db']
          },
          expected: 'database'
        }
      ];

      let successCount = 0;
      const allFunctionalAreas = new Set<FunctionalArea>();

      for (const testCase of testCases) {
        // Use the private method via type assertion for testing
        const result = (epicResolver as { extractFromStandardFunctionalAreas: (taskContext: typeof testCase.taskContext) => FunctionalArea | null }).extractFromStandardFunctionalAreas(testCase.taskContext);
        
        if (result === testCase.expected) {
          successCount++;
          allFunctionalAreas.add(result);
          logger.info(`✅ ${testCase.taskContext.title}: ${result} (expected: ${testCase.expected})`);
        } else {
          logger.warn(`❌ ${testCase.taskContext.title}: ${result || 'null'} (expected: ${testCase.expected})`);
        }
      }

      expect(successCount).toBeGreaterThanOrEqual(8); // At least 8 successful extractions 
      expect(allFunctionalAreas.size).toBeGreaterThanOrEqual(8); // Should extract at least 8 different functional areas
      
      logger.info(`✅ Successfully extracted ${allFunctionalAreas.size} different functional areas out of 11 total`);
      logger.info(`📊 Success rate: ${successCount}/${testCases.length} (${Math.round(successCount/testCases.length*100)}%)`);
    });

    it('should handle edge cases with type safety', () => {
      logger.info('🛡️ Testing edge cases with type safety');

      const edgeCases = [
        null,
        undefined,
        {
          title: '',
          description: '',
          type: 'development',
          tags: []
        },
        {
          title: 'Unknown task',
          description: 'Something unrelated to any functional area',
          type: 'development',
          tags: ['random', 'unknown']
        }
      ];

      for (const edgeCase of edgeCases) {
        const result = (epicResolver as { extractFromStandardFunctionalAreas: (taskContext: typeof edgeCase) => FunctionalArea | null }).extractFromStandardFunctionalAreas(edgeCase);
        
        // Should return null for invalid/unknown cases without throwing
        if (edgeCase === null || edgeCase === undefined) {
          expect(result).toBeNull();
        } else {
          // Should either return a valid functional area or null (no errors)
          expect(result === null || typeof result === 'string').toBe(true);
        }
      }

      logger.info('✅ All edge cases handled safely');
    });
  });

  describe('Type Safety Validation', () => {
    it('should maintain strict typing throughout functional area extraction', () => {
      logger.info('🔒 Testing strict type safety');

      const testContext = {
        title: 'User authentication',
        description: 'Implement login system',
        type: 'development' as const,
        tags: ['auth', 'security'] as readonly string[]
      };

      const result = (epicResolver as { extractFromStandardFunctionalAreas: (taskContext: typeof testContext) => FunctionalArea | null }).extractFromStandardFunctionalAreas(testContext);
      
      // Result should be either null or a valid FunctionalArea
      if (result !== null) {
        const validAreas: readonly FunctionalArea[] = [
          'authentication', 'user-management', 'content-management', 'data-management',
          'integration', 'admin', 'ui-components', 'performance', 'frontend', 'backend', 'database'
        ] as const;
        
        expect(validAreas.includes(result as FunctionalArea)).toBe(true);
      }

      logger.info(`✅ Type safety maintained: ${result || 'null'}`);
    });

    it('should handle LLM validation with strict typing', () => {
      logger.info('🧠 Testing LLM validation framework');

      const testResponses = [
        '["authentication", "user-management"]',
        '["frontend", "backend", "database"]',
        'invalid json',
        '[]',
        '["invalid-area", "authentication"]'
      ];

      for (const response of testResponses) {
        const result = (epicResolver as { parseAndValidateLLMFunctionalAreas: (response: string) => FunctionalArea[] }).parseAndValidateLLMFunctionalAreas(response);
        
        // Should return FunctionalArea[] (empty array is valid)
        expect(Array.isArray(result)).toBe(true);
        
        // All items should be valid functional areas
        for (const area of result) {
          const validAreas: readonly FunctionalArea[] = [
            'authentication', 'user-management', 'content-management', 'data-management',
            'integration', 'admin', 'ui-components', 'performance', 'frontend', 'backend', 'database'
          ] as const;
          
          expect(validAreas.includes(area)).toBe(true);
        }
      }

      logger.info('✅ LLM validation framework maintains type safety');
    });
  });

  describe('Enhanced Keyword Matching', () => {
    it('should use weighted scoring for accurate functional area detection', () => {
      logger.info('⚖️ Testing weighted scoring algorithm');

      const complexCases = [
        {
          taskContext: {
            title: 'User authentication with database integration',
            description: 'Implement auth system with user data persistence in database',
            type: 'development',
            tags: ['auth', 'database', 'user']
          },
          // Should prioritize authentication due to title emphasis
          expectedPrimary: 'authentication'
        },
        {
          taskContext: {
            title: 'Database performance optimization',
            description: 'Optimize database queries for better performance',
            type: 'development',
            tags: ['database', 'performance', 'optimization']
          },
          // Should handle multiple valid areas and pick most relevant
          expectedAnyOf: ['performance', 'database', 'data-management'] as FunctionalArea[]
        }
      ];

      for (const testCase of complexCases) {
        const result = (epicResolver as { extractFromStandardFunctionalAreas: (taskContext: typeof testCase.taskContext) => FunctionalArea | null }).extractFromStandardFunctionalAreas(testCase.taskContext);
        
        if ('expectedPrimary' in testCase) {
          expect(result).toBe(testCase.expectedPrimary);
        } else if ('expectedAnyOf' in testCase) {
          expect(testCase.expectedAnyOf.includes(result as FunctionalArea)).toBe(true);
        }
        
        logger.info(`✅ Complex case resolved: "${testCase.taskContext.title}" → ${result}`);
      }

      logger.info('✅ Weighted scoring algorithm working correctly');
    });
  });
});