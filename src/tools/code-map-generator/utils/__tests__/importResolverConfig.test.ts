/**
 * Tests for the import resolver configuration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateImportResolverConfig } from '../../configValidator.js';
import { ImportResolverConfig } from '../../types.js';
import logger from '../../../../logger.js';

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

describe('Import Resolver Configuration', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should use default values when no config is provided', () => {
    const result = validateImportResolverConfig();

    expect(result).toEqual(expect.objectContaining({
      enabled: false,
      useCache: true,
      cacheSize: 10000,
      generateImportGraph: false,
      expandSecurityBoundary: true
    }));
    expect(result.extensions).toBeDefined();
    expect(Object.keys(result.extensions!)).toContain('javascript');
    expect(Object.keys(result.extensions!)).toContain('typescript');
  });

  it('should override default values with provided values', () => {
    const config: Partial<ImportResolverConfig> = {
      enabled: true,
      useCache: false,
      cacheSize: 5000,
      generateImportGraph: true,
      expandSecurityBoundary: false
    };

    const result = validateImportResolverConfig(config);

    expect(result).toEqual(expect.objectContaining({
      enabled: true,
      useCache: false,
      cacheSize: 5000,
      generateImportGraph: true,
      expandSecurityBoundary: false
    }));
  });

  it('should merge extensions with default extensions', () => {
    const config: Partial<ImportResolverConfig> = {
      extensions: {
        custom: ['.custom']
      }
    };

    const result = validateImportResolverConfig(config);

    expect(result.extensions).toBeDefined();
    expect(Object.keys(result.extensions!)).toContain('javascript');
    expect(Object.keys(result.extensions!)).toContain('typescript');
    expect(Object.keys(result.extensions!)).toContain('custom');
    expect(result.extensions!.custom).toEqual(['.custom']);
  });

  it('should log security-related information when expandSecurityBoundary is true', () => {
    const config: Partial<ImportResolverConfig> = {
      expandSecurityBoundary: true
    };

    validateImportResolverConfig(config);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Import resolver configured with expanded security boundary')
    );
  });

  it('should not log security-related information when expandSecurityBoundary is false', () => {
    const config: Partial<ImportResolverConfig> = {
      expandSecurityBoundary: false
    };

    validateImportResolverConfig(config);

    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Import resolver configured with expanded security boundary')
    );
  });
});
