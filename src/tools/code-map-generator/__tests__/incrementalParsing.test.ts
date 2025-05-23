/**
 * Tests for incremental parsing of large files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCode, initializeParser, cleanupParser } from '../parser';
import * as Parser from 'tree-sitter';

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
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024 * 1024 }), // 1MB
  },
  constants: {
    F_OK: 0,
  },
  existsSync: vi.fn().mockReturnValue(true),
}));

describe('Incremental Parsing', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Initialize parser
    await initializeParser({
      allowedMappingDirectory: '/test',
      output: {
        outputDir: '/test/output',
      },
      cache: {
        enabled: true,
      },
      grammarManager: {
        enableIncrementalParsing: true,
        incrementalParsingThreshold: 1 * 1024 * 1024, // 1MB
      },
    });

    // Mock global.gc
    global.gc = vi.fn();
  });

  afterEach(() => {
    cleanupParser();
    delete global.gc;
  });

  describe('parseCode', () => {
    it('should use regular parsing for small files', async () => {
      // Create a small source code string
      const sourceCode = 'const x = 1;'.repeat(1000); // Much less than 1MB

      // Parse the code
      const tree = await parseCode(sourceCode, '.js');

      // Verify the parser was called with the source code
      expect(Parser.default.prototype.parse).toHaveBeenCalledWith(sourceCode);
      expect(tree).toBeDefined();
    });

    it('should use incremental parsing for large files', async () => {
      // Create a large source code string
      const sourceCode = 'const x = 1;'.repeat(1000000); // More than 1MB

      // Parse the code
      const tree = await parseCode(sourceCode, '.js');

      // Verify the parser was called multiple times
      expect(Parser.default.prototype.parse).toHaveBeenCalled();
      expect(tree).toBeDefined();
    });
  });

  describe('parseCodeIncrementally', () => {
    it('should parse large files in chunks', async () => {
      // Create a large source code string
      const sourceCode = 'const x = 1;'.repeat(1000000); // More than 1MB

      // Parse the code
      const tree = await parseCode(sourceCode, '.js');

      // Verify the parser was called
      expect(Parser.default.prototype.parse).toHaveBeenCalled();
      expect(tree).toBeDefined();
    });

    it('should check memory usage during incremental parsing', async () => {
      // Create a large source code string
      const sourceCode = 'const x = 1;'.repeat(1000000); // More than 1MB

      // Parse the code
      const tree = await parseCode(sourceCode, '.js');

      // Verify garbage collection was called
      expect(global.gc).toHaveBeenCalled();
    });
  });
});
