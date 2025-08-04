/**
 * Centralized fs-extra Mock for Testing Infrastructure
 * 
 * Provides consistent filesystem mocking across all test files to prevent conflicts.
 * Covers all common fs-extra operations with configurable behaviors.
 */

import { vi } from 'vitest';

// Default mock data and state
const mockFileSystem = new Map(); // Simulates filesystem state
const mockStats = new Map(); // Stores file stats

// Helper function to create mock file stats
function createMockStat(size = 1024, isDirectory = false) {
  return {
    size,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    mtime: new Date(),
    ctime: new Date(),
    atime: new Date(),
    mode: isDirectory ? 0o755 : 0o644
  };
}

// Reset mock filesystem state
export function resetMockFileSystem() {
  mockFileSystem.clear();
  mockStats.clear();
}

// Add mock file to virtual filesystem
export function setMockFile(path, content = '', size = content.length) {
  mockFileSystem.set(path, content);
  mockStats.set(path, createMockStat(size, false));
}

// Add mock directory to virtual filesystem
export function setMockDirectory(path) {
  mockFileSystem.set(path, null);
  mockStats.set(path, createMockStat(0, true));
}

// Check if mock file/directory exists
export function mockExists(path) {
  return mockFileSystem.has(path);
}

// File read operations
export const readFile = vi.fn().mockImplementation(async (filePath, options) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  
  if (!mockFileSystem.has(path)) {
    const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
    error.code = 'ENOENT';
    error.errno = -2;
    error.path = path;
    throw error;
  }
  
  const content = mockFileSystem.get(path);
  if (content === null) {
    const error = new Error(`EISDIR: illegal operation on a directory, read`);
    error.code = 'EISDIR';
    throw error;
  }
  
  // Handle encoding options
  if (options && options.encoding === null) {
    return Buffer.from(content);
  }
  
  return content;
});

export const readFileSync = vi.fn().mockImplementation((filePath, options) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  
  if (!mockFileSystem.has(path)) {
    const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
    error.code = 'ENOENT';
    throw error;
  }
  
  const content = mockFileSystem.get(path);
  if (content === null) {
    const error = new Error(`EISDIR: illegal operation on a directory, read`);
    error.code = 'EISDIR';
    throw error;
  }
  
  return content;
});

// File write operations
export const writeFile = vi.fn().mockImplementation(async (filePath, data, options) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  const content = typeof data === 'string' ? data : data.toString();
  
  setMockFile(path, content);
  return undefined;
});

export const writeFileSync = vi.fn().mockImplementation((filePath, data, options) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  const content = typeof data === 'string' ? data : data.toString();
  
  setMockFile(path, content);
  return undefined;
});

// JSON operations
export const readJson = vi.fn().mockImplementation(async (filePath) => {
  const content = await readFile(filePath);
  try {
    return JSON.parse(content);
  } catch (error) {
    const parseError = new Error(`Invalid JSON in ${filePath}`);
    parseError.code = 'EJSONPARSE';
    throw parseError;
  }
});

export const readJsonSync = vi.fn().mockImplementation((filePath) => {
  const content = readFileSync(filePath);
  try {
    return JSON.parse(content);
  } catch (error) {
    const parseError = new Error(`Invalid JSON in ${filePath}`);
    parseError.code = 'EJSONPARSE';
    throw parseError;
  }
});

export const writeJson = vi.fn().mockImplementation(async (filePath, object, options = {}) => {
  const spaces = options.spaces || 0;
  const content = JSON.stringify(object, null, spaces);
  await writeFile(filePath, content);
  return undefined;
});

export const writeJsonSync = vi.fn().mockImplementation((filePath, object, options = {}) => {
  const spaces = options.spaces || 0;
  const content = JSON.stringify(object, null, spaces);
  writeFileSync(filePath, content);
  return undefined;
});

// Directory operations
export const ensureDir = vi.fn().mockImplementation(async (dirPath) => {
  const path = typeof dirPath === 'string' ? dirPath : dirPath.toString();
  setMockDirectory(path);
  return undefined;
});

export const ensureDirSync = vi.fn().mockImplementation((dirPath) => {
  const path = typeof dirPath === 'string' ? dirPath : dirPath.toString();
  setMockDirectory(path);
  return undefined;
});

export const mkdirp = vi.fn().mockImplementation(async (dirPath) => {
  await ensureDir(dirPath);
  return undefined;
});

export const mkdirpSync = vi.fn().mockImplementation((dirPath) => {
  ensureDirSync(dirPath);
  return undefined;
});

export const emptyDir = vi.fn().mockImplementation(async (dirPath) => {
  // In real implementation, this would empty the directory
  // For testing, we'll just ensure it exists
  await ensureDir(dirPath);
  return undefined;
});

export const emptyDirSync = vi.fn().mockImplementation((dirPath) => {
  ensureDirSync(dirPath);
  return undefined;
});

// Path operations
export const pathExists = vi.fn().mockImplementation(async (filePath) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  return mockFileSystem.has(path);
});

export const pathExistsSync = vi.fn().mockImplementation((filePath) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  return mockFileSystem.has(path);
});

// File stats
export const stat = vi.fn().mockImplementation(async (filePath) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  
  if (!mockFileSystem.has(path)) {
    const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
    error.code = 'ENOENT';
    error.errno = -2;
    error.path = path;
    throw error;
  }
  
  return mockStats.get(path) || createMockStat();
});

export const statSync = vi.fn().mockImplementation((filePath) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  
  if (!mockFileSystem.has(path)) {
    const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
    error.code = 'ENOENT';
    throw error;
  }
  
  return mockStats.get(path) || createMockStat();
});

// File operations
export const remove = vi.fn().mockImplementation(async (filePath) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  mockFileSystem.delete(path);
  mockStats.delete(path);
  return undefined;
});

export const removeSync = vi.fn().mockImplementation((filePath) => {
  const path = typeof filePath === 'string' ? filePath : filePath.toString();
  mockFileSystem.delete(path);
  mockStats.delete(path);
  return undefined;
});

export const rename = vi.fn().mockImplementation(async (oldPath, newPath) => {
  const oldPathStr = typeof oldPath === 'string' ? oldPath : oldPath.toString();
  const newPathStr = typeof newPath === 'string' ? newPath : newPath.toString();
  
  if (!mockFileSystem.has(oldPathStr)) {
    const error = new Error(`ENOENT: no such file or directory, rename '${oldPathStr}' -> '${newPathStr}'`);
    error.code = 'ENOENT';
    throw error;
  }
  
  const content = mockFileSystem.get(oldPathStr);
  const stats = mockStats.get(oldPathStr);
  
  mockFileSystem.delete(oldPathStr);
  mockStats.delete(oldPathStr);
  
  mockFileSystem.set(newPathStr, content);
  if (stats) {
    mockStats.set(newPathStr, stats);
  }
  
  return undefined;
});

export const renameSync = vi.fn().mockImplementation((oldPath, newPath) => {
  const oldPathStr = typeof oldPath === 'string' ? oldPath : oldPath.toString();
  const newPathStr = typeof newPath === 'string' ? newPath : newPath.toString();
  
  if (!mockFileSystem.has(oldPathStr)) {
    const error = new Error(`ENOENT: no such file or directory, rename '${oldPathStr}' -> '${newPathStr}'`);
    error.code = 'ENOENT';
    throw error;
  }
  
  const content = mockFileSystem.get(oldPathStr);
  const stats = mockStats.get(oldPathStr);
  
  mockFileSystem.delete(oldPathStr);
  mockStats.delete(oldPathStr);
  
  mockFileSystem.set(newPathStr, content);
  if (stats) {
    mockStats.set(newPathStr, stats);
  }
  
  return undefined;
});

// Copy operations
export const copy = vi.fn().mockImplementation(async (src, dest, options = {}) => {
  const srcPath = typeof src === 'string' ? src : src.toString();
  const destPath = typeof dest === 'string' ? dest : dest.toString();
  
  if (!mockFileSystem.has(srcPath)) {
    const error = new Error(`ENOENT: no such file or directory, open '${srcPath}'`);
    error.code = 'ENOENT';
    throw error;
  }
  
  const content = mockFileSystem.get(srcPath);
  const stats = mockStats.get(srcPath);
  
  mockFileSystem.set(destPath, content);
  if (stats) {
    mockStats.set(destPath, { ...stats });
  }
  
  return undefined;
});

export const copySync = vi.fn().mockImplementation((src, dest, options = {}) => {
  const srcPath = typeof src === 'string' ? src : src.toString();
  const destPath = typeof dest === 'string' ? dest : dest.toString();
  
  if (!mockFileSystem.has(srcPath)) {
    const error = new Error(`ENOENT: no such file or directory, open '${srcPath}'`);
    error.code = 'ENOENT';
    throw error;
  }
  
  const content = mockFileSystem.get(srcPath);
  const stats = mockStats.get(srcPath);
  
  mockFileSystem.set(destPath, content);
  if (stats) {
    mockStats.set(destPath, { ...stats });
  }
  
  return undefined;
});

// Utility functions for tests
export const getMockFileSystem = () => new Map(mockFileSystem);
export const getMockStats = () => new Map(mockStats);

// Default export with all methods
export default {
  readFile,
  readFileSync,
  writeFile,
  writeFileSync,
  readJson,
  readJsonSync,
  writeJson,
  writeJsonSync,
  ensureDir,
  ensureDirSync,
  mkdirp,
  mkdirpSync,
  emptyDir,
  emptyDirSync,
  pathExists,
  pathExistsSync,
  stat,
  statSync,
  remove,
  removeSync,
  rename,
  renameSync,
  copy,
  copySync,
  
  // Utility methods
  resetMockFileSystem,
  setMockFile,
  setMockDirectory,
  mockExists,
  getMockFileSystem,
  getMockStats
};