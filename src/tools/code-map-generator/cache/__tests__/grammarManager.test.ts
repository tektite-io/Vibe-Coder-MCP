/**
 * Tests for the enhanced GrammarManager with memory tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrammarManager } from '../grammarManager';
import fs from 'fs';
import path from 'path';

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024 * 1024 }), // 1MB
  },
}));

// Mock tree-sitter
vi.mock('tree-sitter', () => {
  const mockLanguage = {
    nodeTypeInfo: {},
    nodeSubtypeInfo: {},
  };

  return {
    default: class MockParser {
      static Language = {
        load: vi.fn().mockResolvedValue(mockLanguage),
      };

      constructor() {
        this.setLanguage = vi.fn();
        this.parse = vi.fn().mockReturnValue({ rootNode: { type: 'program' } });
      }
    }
  };
});

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Enhanced GrammarManager', () => {
  let grammarManager: GrammarManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create grammar manager with memory tracking
    grammarManager = new GrammarManager({
      maxGrammars: 5,
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      grammarIdleTimeout: 5 * 60 * 1000, // 5 minutes
      enableIncrementalParsing: true,
      incrementalParsingThreshold: 1 * 1024 * 1024, // 1MB
    });

    // Initialize grammar manager
    await grammarManager.initialize();
  });

  afterEach(() => {
    grammarManager.unloadUnusedGrammars();
  });

  describe('Memory Tracking', () => {
    it('should track memory usage when loading grammars', async () => {
      // Load a grammar
      await grammarManager.loadGrammar('.js');

      // Get stats
      const stats = grammarManager.getStats();

      // Verify memory tracking
      expect(stats.totalMemoryUsage).toBeGreaterThan(0);
      expect(stats.memoryUsagePercentage).toBeGreaterThan(0);
      expect(stats.grammars).toHaveLength(1);
      expect(stats.grammars[0].extension).toBe('.js');
      expect(stats.grammars[0].size).toBeGreaterThan(0);
    });

    it('should unload unused grammars when memory usage is high', async () => {
      // Mock fs.stat to return a large file size
      vi.mocked(fs.promises.stat).mockResolvedValue({ size: 20 * 1024 * 1024 } as any); // 20MB

      // Load multiple grammars to exceed memory limit
      await grammarManager.loadGrammar('.js');
      await grammarManager.loadGrammar('.ts');
      await grammarManager.loadGrammar('.py');

      // Get stats
      const stats = grammarManager.getStats();

      // Verify memory tracking
      expect(stats.loadedGrammars).toBeLessThanOrEqual(3);

      // Load another grammar to trigger unloading
      await grammarManager.loadGrammar('.html');

      // Get updated stats
      const updatedStats = grammarManager.getStats();

      // Verify some grammars were unloaded
      expect(updatedStats.loadedGrammars).toBeLessThan(4);
    });
  });

  describe('Grammar Idle Timeout', () => {
    it('should track last used timestamps for grammars', async () => {
      // Load a grammar
      await grammarManager.loadGrammar('.js');

      // Get stats
      const stats = grammarManager.getStats();

      // Verify last used timestamp
      expect(stats.grammars[0].lastUsed).toBeDefined();
      expect(new Date(stats.grammars[0].lastUsed as string).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should update last used timestamp when grammar is used', async () => {
      // Load a grammar
      await grammarManager.loadGrammar('.js');

      // Get initial stats
      const initialStats = grammarManager.getStats();
      const initialLastUsed = new Date(initialStats.grammars[0].lastUsed as string).getTime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Use the grammar again
      await grammarManager.loadGrammar('.js');

      // Get updated stats
      const updatedStats = grammarManager.getStats();
      const updatedLastUsed = new Date(updatedStats.grammars[0].lastUsed as string).getTime();

      // Verify last used timestamp was updated
      expect(updatedLastUsed).toBeGreaterThan(initialLastUsed);
    });
  });

  describe('Unloading Grammars', () => {
    it('should unload grammars and track freed memory', async () => {
      // Load multiple grammars
      await grammarManager.loadGrammar('.js');
      await grammarManager.loadGrammar('.ts');
      await grammarManager.loadGrammar('.py');

      // Get initial stats
      const initialStats = grammarManager.getStats();
      const initialMemoryUsage = initialStats.totalMemoryUsage;

      // Unload unused grammars
      const unloadedCount = grammarManager.unloadUnusedGrammars(1); // Keep only 1

      // Get updated stats
      const updatedStats = grammarManager.getStats();

      // Verify grammars were unloaded
      expect(unloadedCount).toBe(2);
      expect(updatedStats.loadedGrammars).toBe(1);
      expect(updatedStats.totalMemoryUsage).toBeLessThan(initialMemoryUsage);
    });
  });
});
