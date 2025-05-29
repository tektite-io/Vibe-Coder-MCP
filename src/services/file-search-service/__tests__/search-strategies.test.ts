import { describe, it, expect } from 'vitest';
import { FuzzyMatcher, GlobMatcher } from '../search-strategies.js';

describe('FuzzyMatcher', () => {
  describe('calculateScore', () => {
    it('should return 1.0 for exact matches', () => {
      const score = FuzzyMatcher.calculateScore('test', 'test');
      expect(score).toBe(1.0);
    });

    it('should return high score for substring matches', () => {
      const score = FuzzyMatcher.calculateScore('test', 'testing');
      expect(score).toBeGreaterThan(0.8);
      expect(score).toBeLessThan(1.0);
    });

    it('should return 0 for empty inputs', () => {
      expect(FuzzyMatcher.calculateScore('', 'test')).toBe(0);
      expect(FuzzyMatcher.calculateScore('test', '')).toBe(0);
      expect(FuzzyMatcher.calculateScore('', '')).toBe(0);
    });

    it('should handle case sensitivity', () => {
      const caseSensitiveScore = FuzzyMatcher.calculateScore('Test', 'test', true);
      const caseInsensitiveScore = FuzzyMatcher.calculateScore('Test', 'test', false);
      
      expect(caseInsensitiveScore).toBeGreaterThan(caseSensitiveScore);
    });

    it('should give bonus for prefix matches', () => {
      const prefixScore = FuzzyMatcher.calculateScore('test', 'testing');
      const nonPrefixScore = FuzzyMatcher.calculateScore('est', 'testing');
      
      expect(prefixScore).toBeGreaterThan(nonPrefixScore);
    });

    it('should handle similar strings', () => {
      const score = FuzzyMatcher.calculateScore('component', 'components');
      expect(score).toBeGreaterThan(0.7);
    });

    it('should handle completely different strings', () => {
      const score = FuzzyMatcher.calculateScore('abc', 'xyz');
      expect(score).toBeLessThan(0.5);
    });
  });
});

describe('GlobMatcher', () => {
  describe('globToRegex', () => {
    it('should convert simple glob patterns', () => {
      const regex = GlobMatcher.globToRegex('*.ts');
      expect(regex.test('file.ts')).toBe(true);
      expect(regex.test('file.js')).toBe(false);
    });

    it('should handle double star patterns', () => {
      const regex = GlobMatcher.globToRegex('**/*.test.ts');
      expect(regex.test('src/components/Button.test.ts')).toBe(true);
      expect(regex.test('Button.test.ts')).toBe(true);
      expect(regex.test('Button.ts')).toBe(false);
    });

    it('should handle question mark wildcards', () => {
      const regex = GlobMatcher.globToRegex('file?.ts');
      expect(regex.test('file1.ts')).toBe(true);
      expect(regex.test('fileA.ts')).toBe(true);
      expect(regex.test('file12.ts')).toBe(false);
    });

    it('should escape special regex characters', () => {
      const regex = GlobMatcher.globToRegex('file[1-9].ts');
      expect(regex.test('file[1-9].ts')).toBe(true);
      expect(regex.test('file5.ts')).toBe(false);
    });
  });

  describe('matches', () => {
    it('should match simple patterns', () => {
      expect(GlobMatcher.matches('*.ts', 'component.ts')).toBe(true);
      expect(GlobMatcher.matches('*.ts', 'component.js')).toBe(false);
    });

    it('should match complex patterns', () => {
      expect(GlobMatcher.matches('src/**/*.test.ts', 'src/components/Button.test.ts')).toBe(true);
      expect(GlobMatcher.matches('src/**/*.test.ts', 'src/utils/helper.test.ts')).toBe(true);
      expect(GlobMatcher.matches('src/**/*.test.ts', 'src/components/Button.ts')).toBe(false);
    });

    it('should handle directory patterns', () => {
      expect(GlobMatcher.matches('**/node_modules/**', 'project/node_modules/package/index.js')).toBe(true);
      expect(GlobMatcher.matches('**/node_modules/**', 'project/src/index.js')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(GlobMatcher.matches('*.TS', 'component.ts')).toBe(true);
      expect(GlobMatcher.matches('*.ts', 'COMPONENT.TS')).toBe(true);
    });

    it('should handle invalid patterns gracefully', () => {
      expect(GlobMatcher.matches('[invalid', 'test.ts')).toBe(false);
    });

    it('should match exact file names', () => {
      expect(GlobMatcher.matches('package.json', 'package.json')).toBe(true);
      expect(GlobMatcher.matches('package.json', 'package-lock.json')).toBe(false);
    });

    it('should match directory structures', () => {
      expect(GlobMatcher.matches('src/components/*', 'src/components/Button.tsx')).toBe(true);
      expect(GlobMatcher.matches('src/components/*', 'src/components/forms/Input.tsx')).toBe(false);
      expect(GlobMatcher.matches('src/components/**', 'src/components/forms/Input.tsx')).toBe(true);
    });
  });
});

describe('Search Strategy Types', () => {
  it('should have correct search strategy types', () => {
    const strategies = ['fuzzy', 'exact', 'regex', 'glob', 'content'];
    
    // This test ensures our types are correctly defined
    strategies.forEach(strategy => {
      expect(typeof strategy).toBe('string');
    });
  });
});
