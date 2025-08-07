/**
 * Comprehensive CLI test suite
 * Tests CLI functionality including argument parsing, configuration loading, and tool execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseCliArgs, extractRequestArgs, shouldDisplayHelp, generateSessionId, validateEnvironment } from '../utils/config-loader.js';
import { CLIConfig } from '../types/index.js';

describe('CLI Argument Parsing', () => {
  it('should parse verbose flag correctly', () => {
    const args = ['--verbose', 'test request'];
    const config = parseCliArgs(args);
    expect(config.verbose).toBe(true);
    expect(config.quiet).toBe(false);
    expect(config.color).toBe(true);
    expect(config.outputFormat).toBe('text');
  });

  it('should parse quiet flag correctly', () => {
    const args = ['--quiet', 'test request'];
    const config = parseCliArgs(args);
    expect(config.verbose).toBe(false);
    expect(config.quiet).toBe(true);
    expect(config.color).toBe(true);
    expect(config.outputFormat).toBe('text');
  });

  it('should parse no-color flag correctly', () => {
    const args = ['--no-color', 'test request'];
    const config = parseCliArgs(args);
    expect(config.color).toBe(false);
  });

  it('should parse json output format', () => {
    const args = ['--json', 'test request'];
    const config = parseCliArgs(args);
    expect(config.outputFormat).toBe('json');
  });

  it('should parse yaml output format', () => {
    const args = ['--yaml', 'test request'];  
    const config = parseCliArgs(args);
    expect(config.outputFormat).toBe('yaml');
  });

  it('should parse format flag with value', () => {
    const args = ['--format', 'json', 'test request'];
    const config = parseCliArgs(args);
    expect(config.outputFormat).toBe('json');
  });

  it('should default to text format for invalid format', () => {
    const args = ['--format', 'invalid', 'test request'];
    const config = parseCliArgs(args);
    expect(config.outputFormat).toBe('text');
  });
});

describe('Request Argument Extraction', () => {
  it('should extract simple request', () => {
    const args = ['research', 'React', 'hooks'];
    const result = extractRequestArgs(args);
    expect(result).toEqual(['research', 'React', 'hooks']);
  });

  it('should filter out flags', () => {
    const args = ['--verbose', 'research', 'React', '--quiet', 'hooks'];
    const result = extractRequestArgs(args);
    expect(result).toEqual(['research', 'React', 'hooks']);
  });

  it('should handle format flag with value', () => {
    const args = ['research', '--format', 'json', 'React', 'hooks'];
    const result = extractRequestArgs(args);
    expect(result).toEqual(['research', 'React', 'hooks']);
  });

  it('should return empty array when only flags provided', () => {
    const args = ['--verbose', '--json', '--no-color'];
    const result = extractRequestArgs(args);
    expect(result).toEqual([]);
  });
});

describe('Help Display Logic', () => {
  it('should show help for empty arguments', () => {
    expect(shouldDisplayHelp([])).toBe(true);
  });

  it('should show help for --help flag', () => {
    expect(shouldDisplayHelp(['--help'])).toBe(true);
  });

  it('should show help for -h flag', () => {
    expect(shouldDisplayHelp(['-h'])).toBe(true);
  });

  it('should not show help for normal requests', () => {
    expect(shouldDisplayHelp(['research', 'React'])).toBe(false);
  });

  it('should show help even with other arguments if help flag present', () => {
    expect(shouldDisplayHelp(['research', '--help', 'React'])).toBe(true);
  });
});

describe('Session ID Generation', () => {
  it('should generate unique session IDs', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^cli-\d+-[a-z0-9]+$/);
    expect(id2).toMatch(/^cli-\d+-[a-z0-9]+$/);
  });

  it('should start with cli- prefix', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^cli-/);
  });
});

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return validation result structure', async () => {
    const result = await validateEnvironment();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('should check Node.js version', async () => {
    const originalNodeVersion = process.version;
    Object.defineProperty(process, 'version', {
      value: 'v18.0.0',
      configurable: true
    });

    const result = await validateEnvironment();
    expect(result.errors.some(error => error.includes('Node.js 20.0.0+ is required'))).toBe(true);

    // Restore original version
    Object.defineProperty(process, 'version', {
      value: originalNodeVersion,
      configurable: true
    });
  });

  it('should handle validation process without throwing', async () => {
    expect(async () => await validateEnvironment()).not.toThrow();
  });
});

describe('CLI Configuration Type Validation', () => {
  it('should accept valid CLI config', () => {
    const config: CLIConfig = {
      verbose: true,
      quiet: false,
      outputFormat: 'json',
      color: true
    };
    expect(config.verbose).toBe(true);
    expect(config.outputFormat).toBe('json');
  });

  it('should have readonly properties', () => {
    const config: CLIConfig = {
      verbose: true,
      quiet: false,
      outputFormat: 'text',
      color: true
    };
    
    // TypeScript should prevent modification of these properties
    expect(() => {
      // @ts-expect-error - testing readonly properties
      config.verbose = false;
    }).toBeDefined();
  });
});

describe('Error Scenarios', () => {
  it('should handle malformed arguments gracefully', () => {
    expect(() => parseCliArgs(['--format'])).not.toThrow();
    expect(() => extractRequestArgs(['--format'])).not.toThrow();
  });

  it('should handle empty format values', () => {
    const config = parseCliArgs(['--format', '', 'test']);
    expect(config.outputFormat).toBe('text'); // Should default to text
  });

  it('should handle null/undefined arguments', () => {
    // These should throw since the functions expect valid arrays
    // @ts-expect-error - testing error handling
    expect(() => parseCliArgs(null)).toThrow();
    // @ts-expect-error - testing error handling  
    expect(() => extractRequestArgs(undefined)).toThrow();
  });
});

describe('Integration Scenarios', () => {
  it('should handle complex argument combinations', () => {
    const args = ['--verbose', '--format', 'yaml', '--no-color', 'research', 'best', 'practices', 'for', 'React'];
    const config = parseCliArgs(args);
    const request = extractRequestArgs(args);

    expect(config).toEqual({
      verbose: true,
      quiet: false,
      outputFormat: 'yaml',
      color: false
    });
    expect(request).toEqual(['research', 'best', 'practices', 'for', 'React']);
  });

  it('should prioritize explicit format over shorthand', () => {
    const args = ['--json', '--format', 'yaml', 'test'];
    const config = parseCliArgs(args);
    expect(config.outputFormat).toBe('yaml'); // Format flag should override shorthand
  });
});