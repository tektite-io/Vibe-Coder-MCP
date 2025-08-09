// src/utils/__tests__/string-similarity.test.ts
import { describe, it, expect } from 'vitest';
import { StringSimilarity } from '../string-similarity.js';

describe('StringSimilarity', () => {
  describe('fuzzyMatch', () => {
    it('should return perfect match for identical strings', () => {
      const result = StringSimilarity.fuzzyMatch('create', 'create');
      expect(result.score).toBe(1.0);
      expect(result.isMatch).toBe(true);
      expect(result.editDistance).toBe(0);
      expect(result.matchType).toBe('exact');
    });

    it('should handle substring matches', () => {
      const result = StringSimilarity.fuzzyMatch('create', 'recreate');
      expect(result.score).toBeGreaterThan(0.8);
      expect(result.isMatch).toBe(true);
      expect(result.matchType).toBe('substring');
    });

    it('should handle typos with 1 character difference', () => {
      const result = StringSimilarity.fuzzyMatch('create', 'crate', {
        threshold: 0.6,
        maxEditDistance: 2
      });
      expect(result.isMatch).toBe(true);
      expect(result.editDistance).toBe(1);
      expect(result.matchType).toBe('fuzzy');
    });

    it('should handle typos with 2 character differences', () => {
      const result = StringSimilarity.fuzzyMatch('project', 'projct', {
        threshold: 0.6,
        maxEditDistance: 2
      });
      expect(result.isMatch).toBe(true);
      expect(result.editDistance).toBe(1);
      expect(result.matchType).toBe('fuzzy');
    });

    it('should reject matches with too many differences', () => {
      const result = StringSimilarity.fuzzyMatch('create', 'delete', {
        threshold: 0.6,
        maxEditDistance: 2
      });
      expect(result.isMatch).toBe(false);
      expect(result.editDistance).toBeGreaterThan(2);
      expect(result.matchType).toBe('none');
    });

    it('should handle case insensitive matching by default', () => {
      const result = StringSimilarity.fuzzyMatch('CREATE', 'create');
      expect(result.score).toBe(1.0);
      expect(result.isMatch).toBe(true);
    });

    it('should respect case sensitive option', () => {
      const result = StringSimilarity.fuzzyMatch('CREATE', 'create', {
        caseSensitive: true
      });
      expect(result.score).toBeLessThan(1.0);
    });

    it('should handle empty strings', () => {
      const result1 = StringSimilarity.fuzzyMatch('', 'test');
      expect(result1.isMatch).toBe(false);
      expect(result1.matchType).toBe('none');

      const result2 = StringSimilarity.fuzzyMatch('test', '');
      expect(result2.isMatch).toBe(false);
      expect(result2.matchType).toBe('none');
    });
  });

  describe('isTypoMatch', () => {
    it('should detect common typos', () => {
      expect(StringSimilarity.isTypoMatch('create', 'crate')).toBe(true);
      expect(StringSimilarity.isTypoMatch('project', 'projct')).toBe(true);
      expect(StringSimilarity.isTypoMatch('task', 'taks')).toBe(true);
    });

    it('should detect transposed characters', () => {
      expect(StringSimilarity.isTypoMatch('form', 'from')).toBe(true);
      expect(StringSimilarity.isTypoMatch('unite', 'untie')).toBe(true);
    });

    it('should detect doubled characters', () => {
      expect(StringSimilarity.isTypoMatch('create', 'crreate')).toBe(true);
      expect(StringSimilarity.isTypoMatch('project', 'projject')).toBe(true);
    });

    it('should reject unrelated words', () => {
      expect(StringSimilarity.isTypoMatch('create', 'delete')).toBe(false);
      expect(StringSimilarity.isTypoMatch('project', 'banana')).toBe(false);
    });
  });

  describe('similarity', () => {
    it('should return similarity scores', () => {
      expect(StringSimilarity.similarity('create', 'create')).toBe(1.0);
      expect(StringSimilarity.similarity('create', 'crate')).toBeGreaterThan(0.6);
      expect(StringSimilarity.similarity('create', 'delete')).toBeLessThan(0.5);
    });
  });

  describe('performance', () => {
    it('should complete fuzzy matching within performance bounds', () => {
      const startTime = Date.now();
      
      // Test 100 fuzzy matches
      for (let i = 0; i < 100; i++) {
        StringSimilarity.fuzzyMatch('create', 'crate');
        StringSimilarity.fuzzyMatch('project', 'projct');
        StringSimilarity.fuzzyMatch('task', 'taks');
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete 300 fuzzy matches in under 50ms (target from requirements)
      expect(totalTime).toBeLessThan(50);
    });
  });
});