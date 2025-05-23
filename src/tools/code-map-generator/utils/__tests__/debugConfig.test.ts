/**
 * Tests for the debug configuration options.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateDebugConfig } from '../../configValidator.js';
import { DebugConfig } from '../../types.js';

// Mock the logger
vi.mock('../../../../logger.js', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('Debug Configuration', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should use default values when no config is provided', () => {
    const result = validateDebugConfig();

    expect(result).toEqual({
      showDetailedImports: false,
      generateASTDebugFiles: false
    });
  });

  it('should override default values with provided values', () => {
    const config: Partial<DebugConfig> = {
      showDetailedImports: true,
      generateASTDebugFiles: true
    };

    const result = validateDebugConfig(config);

    expect(result).toEqual({
      showDetailedImports: true,
      generateASTDebugFiles: true
    });
  });

  it('should handle partial configuration', () => {
    const config: Partial<DebugConfig> = {
      showDetailedImports: true
    };

    const result = validateDebugConfig(config);

    expect(result).toEqual({
      showDetailedImports: true,
      generateASTDebugFiles: false
    });
  });
});
