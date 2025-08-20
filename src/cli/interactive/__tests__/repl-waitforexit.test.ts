import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VibeInteractiveREPL, REPLTimeoutError, REPLMemoryError } from '../repl.js';

// Mock the logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock other dependencies
vi.mock('../../../services/routing/toolRegistry.js', () => ({
  getAllTools: vi.fn().mockResolvedValue([]),
  executeTool: vi.fn().mockResolvedValue({ content: [{ text: 'test response' }] })
}));

vi.mock('../../../services/hybrid-matcher/index.js', () => ({
  hybridMatch: vi.fn().mockResolvedValue({
    toolName: 'test-tool',
    parameters: {},
    confidence: 0.9,
    requiresConfirmation: false
  })
}));

// Mock readline
const mockRl = {
  on: vi.fn(),
  prompt: vi.fn(),
  setPrompt: vi.fn(),
  write: vi.fn(),
  close: vi.fn()
};

vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn(() => mockRl),
    emitKeypressEvents: vi.fn()
  }
}));

// Mock other UI components
vi.mock('../ui/banner.js', () => ({
  getBanner: vi.fn(() => 'Mock Banner'),
  getSessionStartMessage: vi.fn(() => 'Mock Start Message'),
  getPrompt: vi.fn(() => '> ')
}));

vi.mock('../ui/progress.js', () => ({
  progress: {
    start: vi.fn(),
    update: vi.fn(),
    success: vi.fn(),
    fail: vi.fn()
  }
}));

vi.mock('../history.js', () => ({
  CommandHistory: vi.fn(() => ({
    add: vi.fn(),
    getPrevious: vi.fn(),
    getNext: vi.fn(),
    saveHistory: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../completion.js', () => ({
  AutoCompleter: vi.fn(() => ({
    setTools: vi.fn(),
    complete: vi.fn(() => [[], ''])
  }))
}));

vi.mock('../persistence.js', () => ({
  SessionPersistence: vi.fn(() => ({
    loadSession: vi.fn(),
    saveSession: vi.fn(),
    listSessions: vi.fn(),
    exportSession: vi.fn()
  }))
}));

vi.mock('../shutdown.js', () => ({
  GracefulShutdown: vi.fn(() => ({
    register: vi.fn(),
    setupSignalHandlers: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined)
  })),
  createAutoSaveHandler: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../multiline.js', () => ({
  MultilineInput: vi.fn(() => ({
    isActive: vi.fn(() => false),
    isStarting: vi.fn(() => false),
    addLine: vi.fn(),
    getPrompt: vi.fn(),
    getContent: vi.fn(),
    reset: vi.fn()
  }))
}));

vi.mock('../config.js', () => ({
  configManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    get: vi.fn((section: string, key: string) => {
      const config: Record<string, Record<string, unknown>> = {
        display: { enableMarkdown: true, theme: 'default' },
        history: { maxSize: 100 },
        session: { autoSave: false, autoSaveInterval: 5 },
        commands: { aliasEnabled: false, aliases: {} },
        performance: { maxConcurrentRequests: 3 }
      };
      return config[section]?.[key];
    }),
    set: vi.fn(),
    autoSave: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../themes.js', () => ({
  themeManager: {
    setTheme: vi.fn(),
    getCurrentThemeName: vi.fn(() => 'default'),
    getAvailableThemes: vi.fn(() => ['default']),
    getThemeDescription: vi.fn(() => 'Default theme'),
    getColors: vi.fn(() => ({
      primary: vi.fn((text: string) => text),
      secondary: vi.fn((text: string) => text),
      accent: vi.fn((text: string) => text),
      success: vi.fn((text: string) => text),
      error: vi.fn((text: string) => text),
      warning: vi.fn((text: string) => text),
      info: vi.fn((text: string) => text),
      code: vi.fn((text: string) => text),
      link: vi.fn((text: string) => text)
    }))
  }
}));

describe('VibeInteractiveREPL waitForExit', () => {
  let repl: VibeInteractiveREPL;
  let mockConfig: { apiKey: string; baseUrl: string; geminiModel: string; perplexityModel: string };

  beforeEach(() => {
    vi.clearAllMocks();
    repl = new VibeInteractiveREPL();
    mockConfig = {
      apiKey: 'test-key',
      baseUrl: 'https://test.com',
      geminiModel: 'gemini-test',
      perplexityModel: 'perplexity-test'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Ensure the REPL is stopped after each test
    if (repl) {
      repl.stop();
    }
  });

  describe('waitForExit method', () => {
    it('should resolve when REPL is stopped', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Start waiting for exit
      const waitPromise = repl.waitForExit();
      
      // Simulate some time passing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Stop the REPL
      repl.stop();
      
      // Should resolve quickly after stop
      await expect(waitPromise).resolves.toBeUndefined();
    });

    it('should timeout after specified time', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Wait with very short timeout
      const waitPromise = repl.waitForExit(200); // 200ms timeout
      
      // Should reject with timeout error
      await expect(waitPromise).rejects.toThrow(REPLTimeoutError);
      await expect(waitPromise).rejects.toThrow('REPL timeout after 200ms');
    });

    it('should handle timeout when not stopped', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Wait with very short timeout (don't stop REPL)
      const waitPromise = repl.waitForExit(50);
      
      // Should reject with timeout error
      await expect(waitPromise).rejects.toThrow(REPLTimeoutError);
    });

    it('should not throw memory error with normal memory usage', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Mock normal memory usage (under 1GB)
      const originalMemoryUsage = process.memoryUsage;
      (process as { memoryUsage: unknown }).memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024, // 100MB
        heapTotal: 50 * 1024 * 1024, // 50MB
        heapUsed: 30 * 1024 * 1024, // 30MB
        external: 5 * 1024 * 1024, // 5MB
        arrayBuffers: 0
      }));
      
      // Start waiting for exit
      const waitPromise = repl.waitForExit();
      
      // Let it run for a bit
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Stop the REPL
      repl.stop();
      
      // Should resolve normally
      await expect(waitPromise).resolves.toBeUndefined();
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('stop method', () => {
    it('should stop the REPL and set isRunning to false', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Verify it's running by checking that waitForExit doesn't resolve immediately
      const waitPromise = repl.waitForExit();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Stop the REPL
      repl.stop();
      
      // Wait should now resolve
      await expect(waitPromise).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should properly type custom errors', () => {
      const timeoutError = new REPLTimeoutError('Test timeout');
      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError).toBeInstanceOf(REPLTimeoutError);
      expect(timeoutError.name).toBe('REPLTimeoutError');
      expect(timeoutError.message).toBe('Test timeout');

      const memoryError = new REPLMemoryError('Test memory');
      expect(memoryError).toBeInstanceOf(Error);
      expect(memoryError).toBeInstanceOf(REPLMemoryError);
      expect(memoryError.name).toBe('REPLMemoryError');
      expect(memoryError.message).toBe('Test memory');
    });
  });
});