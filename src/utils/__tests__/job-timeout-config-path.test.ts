/**
 * Test to verify JobTimeoutConfigManager uses correct path resolution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { JobTimeoutConfigManager } from '../job-timeout-config-manager.js';
import { getProjectRoot } from '../../tools/code-map-generator/utils/pathUtils.enhanced.js';

describe('JobTimeoutConfigManager Path Resolution', () => {
  let manager: JobTimeoutConfigManager;
  const originalCwd = process.cwd();

  beforeEach(() => {
    // Reset singleton instance for clean test
    // Using type assertion to access private static property for testing
    const managerClass = JobTimeoutConfigManager as unknown as {
      instance: JobTimeoutConfigManager | null;
    };
    managerClass.instance = null;
  });

  afterEach(() => {
    // Restore original working directory
    process.chdir(originalCwd);
  });

  it('should use getProjectRoot() for config path resolution', () => {
    // Change working directory to root to simulate MCP client launch
    process.chdir('/');
    
    // Get manager instance
    manager = JobTimeoutConfigManager.getInstance();
    
    // Get config summary to access configPath
    const summary = manager.getConfigSummary();
    
    // Expected path should be based on project root, not process.cwd()
    const expectedPath = path.join(getProjectRoot(), 'job-timeout-config.json');
    
    // Verify the config path is correct
    expect(summary.configPath).toBe(expectedPath);
    
    // Verify it's NOT using process.cwd() (which would be '/')
    expect(summary.configPath).not.toBe('/job-timeout-config.json');
    
    // Verify the path contains the actual project directory
    expect(summary.configPath).toContain('Vibe-Coder-MCP');
  });

  it('should maintain correct path regardless of working directory', () => {
    const expectedPath = path.join(getProjectRoot(), 'job-timeout-config.json');
    
    // Test from different working directories
    const testDirs = ['/', '/tmp', '/Users', originalCwd];
    
    for (const testDir of testDirs) {
      // Reset singleton
      const managerClass = JobTimeoutConfigManager as unknown as {
        instance: JobTimeoutConfigManager | null;
      };
      managerClass.instance = null;
      
      // Change to test directory
      try {
        process.chdir(testDir);
      } catch {
        // Skip if directory doesn't exist
        continue;
      }
      
      // Get new instance
      const testManager = JobTimeoutConfigManager.getInstance();
      const summary = testManager.getConfigSummary();
      
      // Path should always be the same
      expect(summary.configPath).toBe(expectedPath);
    }
  });

  it('should match OpenRouterConfigManager path resolution pattern', async () => {
    // Both managers should resolve to the same project root
    const jobManager = JobTimeoutConfigManager.getInstance();
    const jobSummary = jobManager.getConfigSummary();
    
    // Extract directory from config path
    const jobConfigDir = path.dirname(jobSummary.configPath);
    
    // Should match the project root
    expect(jobConfigDir).toBe(getProjectRoot());
  });
});