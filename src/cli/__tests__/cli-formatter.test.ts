/**
 * CLI Formatter Test Suite
 * Tests for enhanced CLI formatting utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedCLIUtils } from '../utils/cli-formatter.js';

// Mock chalk to control colors in tests
vi.mock('chalk', () => ({
  default: {
    green: vi.fn((text: string) => `[GREEN]${text}[/GREEN]`),
    red: vi.fn((text: string) => `[RED]${text}[/RED]`),
    yellow: vi.fn((text: string) => `[YELLOW]${text}[/YELLOW]`),
    blue: vi.fn((text: string) => `[BLUE]${text}[/BLUE]`),
    cyan: vi.fn((text: string) => `[CYAN]${text}[/CYAN]`),
    gray: vi.fn((text: string) => `[GRAY]${text}[/GRAY]`),
    bold: {
      green: vi.fn((text: string) => `[BOLD_GREEN]${text}[/BOLD_GREEN]`),
      red: vi.fn((text: string) => `[BOLD_RED]${text}[/BOLD_RED]`),
      yellow: vi.fn((text: string) => `[BOLD_YELLOW]${text}[/BOLD_YELLOW]`),
      blue: vi.fn((text: string) => `[BOLD_BLUE]${text}[/BOLD_BLUE]`),
      cyan: vi.fn((text: string) => `[BOLD_CYAN]${text}[/BOLD_CYAN]`)
    }
  }
}));

// Mock boxen for testing
vi.mock('boxen', () => ({
  default: vi.fn((text: string, _options?: unknown) => `[BOX]${text}[/BOX]`)
}));

describe('EnhancedCLIUtils', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('formatSuccess', () => {
    it('should format success messages with green color and checkmark', () => {
      EnhancedCLIUtils.formatSuccess('Task completed');
      expect(consoleSpy).toHaveBeenCalledWith('[GREEN]✓ Task completed[/GREEN]');
    });

    it('should handle empty messages', () => {
      EnhancedCLIUtils.formatSuccess('');
      expect(consoleSpy).toHaveBeenCalledWith('[GREEN]✓ [/GREEN]');
    });
  });

  describe('formatError', () => {
    it('should format error messages with red color and cross mark', () => {
      EnhancedCLIUtils.formatError('Something went wrong');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[RED]✗ Something went wrong[/RED]');
    });

    it('should handle multiline error messages', () => {
      const multilineError = 'Error line 1\nError line 2';
      EnhancedCLIUtils.formatError(multilineError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[RED]✗ Error line 1\nError line 2[/RED]');
    });
  });

  describe('formatWarning', () => {
    it('should format warning messages with yellow color and warning symbol', () => {
      EnhancedCLIUtils.formatWarning('This is a warning');
      expect(consoleSpy).toHaveBeenCalledWith('[YELLOW]⚠ This is a warning[/YELLOW]');
    });
  });

  describe('formatInfo', () => {
    it('should format info messages with blue color and info symbol', () => {
      EnhancedCLIUtils.formatInfo('Information message');
      expect(consoleSpy).toHaveBeenCalledWith('[BLUE]ℹ Information message[/BLUE]');
    });
  });

  describe('formatExample', () => {
    it('should format examples with proper command and description styling', () => {
      EnhancedCLIUtils.formatExample('vibe "research React"', 'Research React best practices');
      
      // Check that we got the expected calls
      expect(consoleSpy).toHaveBeenCalledWith('  [GREEN]vibe "research React"[/GREEN]');
      expect(consoleSpy).toHaveBeenCalledWith('    [GRAY]Research React best practices[/GRAY]');
      expect(consoleSpy).toHaveBeenCalledWith(); // Empty line call
    });

    it('should handle long commands and descriptions', () => {
      const longCommand = 'vibe "create a comprehensive PRD for an e-commerce platform with user authentication"';
      const longDescription = 'This example shows how to create detailed product requirements documents for complex applications';
      
      EnhancedCLIUtils.formatExample(longCommand, longDescription);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('formatBox', () => {
    it('should create boxed content with title', () => {
      EnhancedCLIUtils.formatBox('Content inside box', 'Box Title');
      expect(consoleSpy).toHaveBeenCalledWith('[BOX]Content inside box[/BOX]');
    });

    it('should handle multiline content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      EnhancedCLIUtils.formatBox(content, 'Multi-line Title');
      expect(consoleSpy).toHaveBeenCalledWith('[BOX]Line 1\nLine 2\nLine 3[/BOX]');
    });

    it('should handle empty content', () => {
      EnhancedCLIUtils.formatBox('', 'Empty Box');
      expect(consoleSpy).toHaveBeenCalledWith('[BOX][/BOX]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in messages', () => {
      const specialMessage = 'Message with émojis 🚀 and spéciál characters!';
      EnhancedCLIUtils.formatSuccess(specialMessage);
      expect(consoleSpy).toHaveBeenCalledWith(`[GREEN]✓ ${specialMessage}[/GREEN]`);
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(1000);
      EnhancedCLIUtils.formatInfo(longMessage);
      expect(consoleSpy).toHaveBeenCalledWith(`[BLUE]ℹ ${longMessage}[/BLUE]`);
    });

    it('should handle undefined/null messages gracefully', () => {
      // @ts-expect-error - testing error handling
      expect(() => EnhancedCLIUtils.formatSuccess(null)).not.toThrow();
      // @ts-expect-error - testing error handling
      expect(() => EnhancedCLIUtils.formatError(undefined)).not.toThrow();
    });
  });

  describe('Integration with CLIUtils base class', () => {
    it('should extend CLIUtils functionality', () => {
      // Test that EnhancedCLIUtils has access to base CLIUtils methods
      expect(typeof EnhancedCLIUtils.formatSuccess).toBe('function');
      expect(typeof EnhancedCLIUtils.formatError).toBe('function');
      expect(typeof EnhancedCLIUtils.formatWarning).toBe('function');
      expect(typeof EnhancedCLIUtils.formatInfo).toBe('function');
    });
  });

  describe('Color Support Detection', () => {
    it('should work regardless of color support', () => {
      // Test that functions work even if colors are disabled
      const originalSupportsColor = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

      EnhancedCLIUtils.formatSuccess('No color test');
      expect(consoleSpy).toHaveBeenCalled();

      // Restore
      Object.defineProperty(process.stdout, 'isTTY', { value: originalSupportsColor, configurable: true });
    });
  });
});