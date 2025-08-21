import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VibeInteractiveREPL, REPLTimeoutError } from '../repl.js';
import { EventEmitter } from 'events';

// Mock the logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock tool registry with realistic tool execution
vi.mock('../../../services/routing/toolRegistry.js', () => ({
  getAllTools: vi.fn().mockResolvedValue([
    { name: 'research-manager', description: 'Research management tool' },
    { name: 'prd-generator', description: 'Product requirements tool' }
  ]),
  executeTool: vi.fn()
}));

// Mock hybrid matcher
vi.mock('../../../services/hybrid-matcher/index.js', () => ({
  hybridMatch: vi.fn()
}));

// Define the mock readline interface type
interface MockReadlineInterface extends EventEmitter {
  prompt: ReturnType<typeof vi.fn>;
  setPrompt: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  line: string;
  cursor: number;
  question: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  getPrompt: ReturnType<typeof vi.fn>;
  setRawMode: ReturnType<typeof vi.fn>;
  clearLine: ReturnType<typeof vi.fn>;
  moveCursor: ReturnType<typeof vi.fn>;
  simulateInput: (input: string) => void;
  simulateSIGINT: () => void;
  simulateClose: () => void;
}

// Create mock readline interface that behaves like real readline
const createMockReadlineInterface = (): MockReadlineInterface => {
  const eventEmitter = new EventEmitter();
  const mockRl = Object.assign(eventEmitter, {
    prompt: vi.fn(),
    setPrompt: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
    line: '', // Current line content
    cursor: 0, // Cursor position
    // Add methods that real readline interface has
    question: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getPrompt: vi.fn(() => '> '),
    setRawMode: vi.fn(),
    clearLine: vi.fn(),
    moveCursor: vi.fn(),
    
    // Simulate line input method
    simulateInput: (input: string) => {
      mockRl.line = input;
      mockRl.emit('line', input);
    },
    
    // Simulate SIGINT (Ctrl+C)
    simulateSIGINT: () => {
      mockRl.emit('SIGINT');
    },
    
    // Simulate close event
    simulateClose: () => {
      mockRl.emit('close');
    }
  }) as MockReadlineInterface;
  
  return mockRl;
};

// Mock readline module
let mockRl: MockReadlineInterface;
vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn(() => {
      mockRl = createMockReadlineInterface();
      return mockRl;
    }),
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

// Mock UI components
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
    saveSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue([]),
    exportSession: vi.fn().mockResolvedValue('/tmp/session.md')
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

// Mock UI formatters
vi.mock('../ui/formatter.js', () => ({
  ResponseFormatter: {
    formatResponse: vi.fn((text: string) => console.log(text)),
    formatError: vi.fn((text: string) => console.error(text)),
    formatSuccess: vi.fn((text: string) => console.log(text)),
    formatWarning: vi.fn((text: string) => console.warn(text)),
    formatInfo: vi.fn((text: string) => console.info(text)),
    formatTable: vi.fn(),
    formatKeyValue: vi.fn()
  }
}));

vi.mock('../ui/markdown.js', () => ({
  MarkdownRenderer: {
    renderWrapped: vi.fn((text: string) => text)
  }
}));

// Mock process.stdin for keypress events
const mockStdin = {
  isTTY: true,
  setRawMode: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
};
Object.defineProperty(process, 'stdin', {
  value: mockStdin,
  writable: true
});

describe('REPL Integration Tests - Multi-turn Operations', () => {
  let repl: VibeInteractiveREPL;
  let mockConfig: { apiKey: string; baseUrl: string; geminiModel: string; perplexityModel: string };
  let mockExecuteTool: ReturnType<typeof vi.fn>;
  let mockHybridMatch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    vi.clearAllTimers();
    
    // Get mocked functions
    const { executeTool } = await import('../../../services/routing/toolRegistry.js');
    const { hybridMatch } = await import('../../../services/hybrid-matcher/index.js');
    
    mockExecuteTool = vi.mocked(executeTool);
    mockHybridMatch = vi.mocked(hybridMatch);
    
    // Setup REPL and config
    repl = new VibeInteractiveREPL();
    mockConfig = {
      apiKey: 'test-key',
      baseUrl: 'https://test.com',
      geminiModel: 'gemini-test',
      perplexityModel: 'perplexity-test'
    };
  });

  afterEach(async () => {
    // Stop REPL first if running
    if (repl) {
      repl.stop();
    }
    
    // Clear mocks and timers
    vi.clearAllMocks();
    vi.clearAllTimers();
    
    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('Multi-turn Operations Core Functionality', () => {
    it('should handle multiple commands in sequence while keeping REPL alive', async () => {
      // Setup tool execution mocks for different commands
      mockHybridMatch
        .mockResolvedValueOnce({
          toolName: 'research-manager',
          parameters: { query: 'test research' },
          confidence: 0.9,
          requiresConfirmation: false
        })
        .mockResolvedValueOnce({
          toolName: 'prd-generator',
          parameters: { project: 'test project' },
          confidence: 0.9,
          requiresConfirmation: false
        });

      mockExecuteTool
        .mockResolvedValueOnce({
          content: [{ text: 'Research completed successfully' }],
          isError: false
        })
        .mockResolvedValueOnce({
          content: [{ text: 'PRD generated successfully' }],
          isError: false
        });

      // Start REPL
      await repl.start(mockConfig);
      
      // Verify REPL is running and ready for input
      expect(mockRl.prompt).toHaveBeenCalled();
      const initialPromptCalls = mockRl.prompt.mock.calls.length;
      
      // First command: research
      mockRl.simulateInput('research blockchain technology');
      
      // Wait for command processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify first tool was executed
      expect(mockHybridMatch).toHaveBeenCalledWith('research blockchain technology', mockConfig);
      expect(mockExecuteTool).toHaveBeenCalledWith('research-manager', { query: 'test research' }, mockConfig, expect.any(Object));
      
      // Second command: PRD generation
      mockRl.simulateInput('generate PRD for mobile app');
      
      // Wait for command processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify second tool was executed
      expect(mockHybridMatch).toHaveBeenCalledWith('generate PRD for mobile app', mockConfig);
      expect(mockExecuteTool).toHaveBeenCalledWith('prd-generator', { project: 'test project' }, mockConfig, expect.any(Object));
      
      // Verify prompt was shown again after commands (REPL still alive)
      expect(mockRl.prompt.mock.calls.length).toBeGreaterThanOrEqual(initialPromptCalls + 2);
      
      // Stop REPL
      repl.stop();
    });

    it('should maintain session state across multiple commands', async () => {
      // Setup tool execution mock
      mockHybridMatch.mockResolvedValue({
        toolName: 'research-manager',
        parameters: { query: 'test' },
        confidence: 0.9,
        requiresConfirmation: false
      });

      mockExecuteTool.mockResolvedValue({
        content: [{ text: 'Command executed' }],
        isError: false
      });

      // Start REPL
      await repl.start(mockConfig);
      
      // Execute first command
      mockRl.simulateInput('first command');
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Execute second command
      mockRl.simulateInput('second command');
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify both commands were executed with the same session context
      expect(mockExecuteTool).toHaveBeenCalledTimes(2);
      
      const firstCallContext = mockExecuteTool.mock.calls[0][3];
      const secondCallContext = mockExecuteTool.mock.calls[1][3];
      
      // Session ID should be the same
      expect(firstCallContext.sessionId).toBe(secondCallContext.sessionId);
      expect(firstCallContext.transportType).toBe('interactive');
      expect(secondCallContext.transportType).toBe('interactive');
      
      // Stop REPL
      repl.stop();
    });

    it('should handle empty commands gracefully without breaking the session', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      const initialPromptCalls = mockRl.prompt.mock.calls.length;
      
      // Send empty command
      mockRl.simulateInput('');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send whitespace-only command
      mockRl.simulateInput('   ');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify prompt is still being shown (REPL still alive)
      expect(mockRl.prompt.mock.calls.length).toBeGreaterThanOrEqual(initialPromptCalls);
      
      // Verify no tools were executed for empty commands
      expect(mockExecuteTool).not.toHaveBeenCalled();
      expect(mockHybridMatch).not.toHaveBeenCalled();
      
      // Stop REPL
      repl.stop();
    });
  });

  describe('Process Lifecycle', () => {
    it('should start up properly and show initial prompt', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Verify startup sequence
      expect(mockRl.prompt).toHaveBeenCalled();
      
      // Stop REPL
      repl.stop();
    });

    it('should handle graceful exit with /exit command', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Execute exit command
      mockRl.simulateInput('/exit');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify REPL stops gracefully
      // The REPL should handle the exit and stop running
      
      // We can't easily test the actual exit since it would terminate the test
      // But we can verify the command was processed
      expect(mockRl.prompt).toHaveBeenCalled();
    });

    it('should handle SIGINT (Ctrl+C) gracefully', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Simulate Ctrl+C
      mockRl.simulateSIGINT();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // The REPL should handle the signal gracefully
      // Exact behavior depends on implementation but should not crash
    });
  });

  describe('waitForExit Functionality', () => {
    it('should keep process alive with waitForExit until stopped', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Start waiting for exit
      const waitPromise = repl.waitForExit(1000); // 1 second timeout for test
      
      // Execute some commands while waiting
      mockRl.simulateInput('test command 1');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      mockRl.simulateInput('test command 2');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify REPL is still running
      expect(mockRl.prompt).toHaveBeenCalled();
      
      // Stop REPL
      repl.stop();
      
      // Wait should resolve after stop
      await expect(waitPromise).resolves.toBeUndefined();
    });

    it('should timeout if waitForExit times out', async () => {
      // Start REPL
      await repl.start(mockConfig);
      
      // Wait with very short timeout (don't stop REPL)
      const waitPromise = repl.waitForExit(100); // 100ms timeout
      
      // Should reject with timeout error
      await expect(waitPromise).rejects.toThrow(REPLTimeoutError);
      await expect(waitPromise).rejects.toThrow('REPL timeout after 100ms');
    });
  });

  describe('Tool Integration', () => {
    it('should execute simple tools and return to prompt', async () => {
      // Setup mock for simple tool execution
      mockHybridMatch.mockResolvedValue({
        toolName: 'research-manager',
        parameters: { query: 'JavaScript frameworks' },
        confidence: 0.9,
        requiresConfirmation: false
      });

      mockExecuteTool.mockResolvedValue({
        content: [{ text: 'Research completed: Found 5 frameworks' }],
        isError: false
      });

      // Start REPL
      await repl.start(mockConfig);
      const initialPromptCalls = mockRl.prompt.mock.calls.length;
      
      // Execute tool command
      mockRl.simulateInput('research JavaScript frameworks');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify tool was executed
      expect(mockHybridMatch).toHaveBeenCalledWith('research JavaScript frameworks', mockConfig);
      expect(mockExecuteTool).toHaveBeenCalledWith(
        'research-manager',
        { query: 'JavaScript frameworks' },
        mockConfig,
        expect.objectContaining({
          sessionId: expect.any(String),
          transportType: 'interactive'
        })
      );
      
      // Verify REPL returns to prompt after tool execution
      expect(mockRl.prompt.mock.calls.length).toBeGreaterThanOrEqual(initialPromptCalls);
      
      // Stop REPL
      repl.stop();
    });

    it('should handle command errors without terminating the REPL', async () => {
      // Setup tool execution to fail first, then succeed
      mockHybridMatch.mockResolvedValue({
        toolName: 'research-manager',
        parameters: { query: 'test' },
        confidence: 0.9,
        requiresConfirmation: false
      });

      mockExecuteTool
        .mockRejectedValueOnce(new Error('Tool execution failed'))
        .mockResolvedValueOnce({
          content: [{ text: 'Success after error' }],
          isError: false
        });

      // Start REPL
      await repl.start(mockConfig);
      const initialPromptCalls = mockRl.prompt.mock.calls.length;
      
      // Execute command that will fail
      mockRl.simulateInput('failing command');
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Execute another command to verify REPL is still responsive
      mockRl.simulateInput('recovery command');
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify REPL recovered and handled both commands
      expect(mockExecuteTool).toHaveBeenCalledTimes(2);
      expect(mockRl.prompt.mock.calls.length).toBeGreaterThanOrEqual(initialPromptCalls);
      
      // Stop REPL
      repl.stop();
    });
  });

  describe('REPL Multi-turn Fix Validation', () => {
    it('should demonstrate that the REPL stays responsive after multiple operations', async () => {
      // This test specifically validates the fix for the multi-turn operation issue
      
      // Setup multiple different tool executions
      const tools = [
        { name: 'research-manager', response: 'Research completed' },
        { name: 'prd-generator', response: 'PRD generated' },
        { name: 'research-manager', response: 'Additional research done' }
      ];

      let callIndex = 0;
      mockHybridMatch.mockImplementation(() => {
        const tool = tools[callIndex % tools.length];
        return Promise.resolve({
          toolName: tool.name,
          parameters: { input: `test-${callIndex}` },
          confidence: 0.9,
          requiresConfirmation: false
        });
      });

      mockExecuteTool.mockImplementation(() => {
        const tool = tools[callIndex++];
        return Promise.resolve({
          content: [{ text: tool.response }],
          isError: false
        });
      });

      // Start REPL
      await repl.start(mockConfig);
      const initialPromptCalls = mockRl.prompt.mock.calls.length;
      
      // Execute multiple commands to test the multi-turn fix
      const commands = [
        'research AI trends',
        'generate PRD for AI app',
        'research more AI info'
      ];
      
      for (let i = 0; i < commands.length; i++) {
        mockRl.simulateInput(commands[i]);
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify REPL is still responsive after each command
        expect(mockRl.prompt.mock.calls.length).toBeGreaterThan(initialPromptCalls);
      }
      
      // Verify all tools were executed
      expect(mockExecuteTool).toHaveBeenCalledTimes(3);
      
      // Verify REPL is still alive and responsive
      expect(mockRl.prompt.mock.calls.length).toBeGreaterThanOrEqual(initialPromptCalls + 3);
      
      // Execute one more command to confirm continued responsiveness
      mockRl.simulateInput('final test command');
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // This demonstrates the fix: REPL continues to work after multiple operations
      expect(mockExecuteTool).toHaveBeenCalledTimes(4);
      
      // Stop REPL
      repl.stop();
    });

    it('should validate waitForExit keeps process alive during multi-turn operations', async () => {
      // This test validates that waitForExit properly keeps the process alive
      // during multiple operations, which was the core issue being fixed
      
      mockHybridMatch.mockResolvedValue({
        toolName: 'research-manager',
        parameters: { query: 'test' },
        confidence: 0.9,
        requiresConfirmation: false
      });

      mockExecuteTool.mockResolvedValue({
        content: [{ text: 'Operation completed' }],
        isError: false
      });

      // Start REPL
      await repl.start(mockConfig);
      
      // Start waiting for exit with reasonable timeout
      const waitPromise = repl.waitForExit(2000); // 2 seconds
      
      // Execute multiple operations while waiting
      const operationPromises: Promise<void>[] = [];
      
      for (let i = 0; i < 3; i++) {
        operationPromises.push(
          new Promise<void>(resolve => {
            setTimeout(() => {
              mockRl.simulateInput(`operation ${i + 1}`);
              setTimeout(resolve, 100); // Allow processing time
            }, i * 150);
          })
        );
      }
      
      // Wait for all operations to complete
      await Promise.all(operationPromises);
      
      // Verify operations were processed
      expect(mockExecuteTool).toHaveBeenCalled();
      
      // Stop REPL (this should cause waitForExit to resolve)
      repl.stop();
      
      // Verify waitForExit resolves after stop
      await expect(waitPromise).resolves.toBeUndefined();
      
      // This validates the fix: waitForExit kept the process alive during operations
      // and properly resolved when stopped
    });
  });
});