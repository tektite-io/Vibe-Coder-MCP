/**
 * Common helper functions for tests
 */

import fs from 'fs-extra';
import path from 'path';
import { vi } from 'vitest';

/**
 * Create a temporary directory for testing
 * @param prefix Directory name prefix
 * @returns Path to the temporary directory
 */
export function createTempDir(prefix: string = 'test-'): string {
  const tempDir = path.join(process.cwd(), 'temp', `${prefix}${Date.now()}`);
  fs.ensureDirSync(tempDir);
  return tempDir;
}

/**
 * Remove a temporary directory
 * @param tempDir Path to the temporary directory
 */
export function removeTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.removeSync(tempDir);
  }
}

/**
 * Create a temporary file for testing
 * @param content File content
 * @param extension File extension
 * @param tempDir Temporary directory
 * @returns Path to the temporary file
 */
export function createTempFile(content: string, extension: string = '.txt', tempDir?: string): string {
  const dir = tempDir || createTempDir();
  const filePath = path.join(dir, `test-${Date.now()}${extension}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Create a temporary project for testing
 * @param files Map of file paths to file contents
 * @param tempDir Temporary directory
 * @returns Path to the temporary project
 */
export function createTempProject(files: Map<string, string>, tempDir?: string): string {
  const dir = tempDir || createTempDir('project-');

  for (const [filePath, content] of files.entries()) {
    const fullPath = path.join(dir, filePath);
    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content);
  }

  return dir;
}

/**
 * Wait for a condition to be true
 * @param condition Condition function
 * @param timeout Timeout in milliseconds
 * @param interval Check interval in milliseconds
 * @returns Promise that resolves when the condition is true
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Create a mock function that resolves after a delay
 * @param result Result to resolve with
 * @param delay Delay in milliseconds
 * @returns Mock function
 */
export function createDelayedMock<T>(result: T, delay: number = 100): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() => {
    return new Promise<T>(resolve => {
      setTimeout(() => resolve(result), delay);
    });
  });
}

/**
 * Create a mock function that rejects after a delay
 * @param error Error to reject with
 * @param delay Delay in milliseconds
 * @returns Mock function
 */
export function createDelayedErrorMock(error: Error, delay: number = 100): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() => {
    return new Promise<never>((_, reject) => {
      setTimeout(() => reject(error), delay);
    });
  });
}

/**
 * Create a mock event emitter
 * @returns Mock event emitter
 */
export function createMockEventEmitter() {
  // Define a more specific type for event listeners
  type EventListener = (...args: unknown[]) => void;
  const listeners: Record<string, EventListener[]> = {};

  return {
    on: vi.fn((event: string, listener: EventListener) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(listener);
    }),
    off: vi.fn((event: string, listener: EventListener) => {
      if (listeners[event]) {
        const index = listeners[event].indexOf(listener);
        if (index !== -1) {
          listeners[event].splice(index, 1);
        }
      }
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      if (listeners[event]) {
        for (const listener of listeners[event]) {
          listener(...args);
        }
      }
    }),
    _listeners: listeners,
  };
}
