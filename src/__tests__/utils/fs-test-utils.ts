/**
 * Utilities for testing file system operations
 */

// fs-extra is mocked, so we don't need to import it directly
// import fs from 'fs-extra';
import path from 'path';
import { vi } from 'vitest';

/**
 * Create a mock file system
 * @returns Mock file system
 */
// Define types for file system operations
type FileSystemOptions = {
  encoding?: string;
  flag?: string;
  mode?: number;
  recursive?: boolean;
  [key: string]: unknown;
};

export function createMockFileSystem() {
  const files: Record<string, string | Buffer> = {};
  const directories: Set<string> = new Set();

  // Add root directory
  directories.add('/');

  return {
    // File operations
    readFile: vi.fn((filePath: string, options?: string | FileSystemOptions) => {
      const normalizedPath = path.normalize(filePath);

      if (!(normalizedPath in files)) {
        throw new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`);
      }

      const content = files[normalizedPath];

      if (options === 'utf8' || (options && typeof options === 'object' && 'encoding' in options && options.encoding === 'utf8')) {
        return Promise.resolve(content.toString());
      }

      return Promise.resolve(content);
    }),

    readFileSync: vi.fn((filePath: string, options?: string | FileSystemOptions) => {
      const normalizedPath = path.normalize(filePath);

      if (!(normalizedPath in files)) {
        throw new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`);
      }

      const content = files[normalizedPath];

      if (options === 'utf8' || (options && typeof options === 'object' && 'encoding' in options && options.encoding === 'utf8')) {
        return content.toString();
      }

      return content;
    }),

    writeFile: vi.fn((filePath: string, content: string | Buffer, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(filePath);
      const dirPath = path.dirname(normalizedPath);

      if (!directories.has(dirPath)) {
        throw new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`);
      }

      files[normalizedPath] = content;

      return Promise.resolve();
    }),

    writeFileSync: vi.fn((filePath: string, content: string | Buffer, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(filePath);
      const dirPath = path.dirname(normalizedPath);

      if (!directories.has(dirPath)) {
        throw new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`);
      }

      files[normalizedPath] = content;
    }),

    appendFile: vi.fn((filePath: string, content: string | Buffer, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(filePath);

      if (normalizedPath in files) {
        const existingContent = files[normalizedPath];

        if (typeof existingContent === 'string' && typeof content === 'string') {
          files[normalizedPath] = existingContent + content;
        } else {
          const existingBuffer = Buffer.isBuffer(existingContent) ? existingContent : Buffer.from(existingContent);
          const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
          files[normalizedPath] = Buffer.concat([existingBuffer, contentBuffer]);
        }
      } else {
        const dirPath = path.dirname(normalizedPath);

        if (!directories.has(dirPath)) {
          throw new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`);
        }

        files[normalizedPath] = content;
      }

      return Promise.resolve();
    }),

    appendFileSync: vi.fn((filePath: string, content: string | Buffer, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(filePath);

      if (normalizedPath in files) {
        const existingContent = files[normalizedPath];

        if (typeof existingContent === 'string' && typeof content === 'string') {
          files[normalizedPath] = existingContent + content;
        } else {
          const existingBuffer = Buffer.isBuffer(existingContent) ? existingContent : Buffer.from(existingContent);
          const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
          files[normalizedPath] = Buffer.concat([existingBuffer, contentBuffer]);
        }
      } else {
        const dirPath = path.dirname(normalizedPath);

        if (!directories.has(dirPath)) {
          throw new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`);
        }

        files[normalizedPath] = content;
      }
    }),

    unlink: vi.fn((filePath: string) => {
      const normalizedPath = path.normalize(filePath);

      if (!(normalizedPath in files)) {
        throw new Error(`ENOENT: no such file or directory, unlink '${normalizedPath}'`);
      }

      delete files[normalizedPath];

      return Promise.resolve();
    }),

    unlinkSync: vi.fn((filePath: string) => {
      const normalizedPath = path.normalize(filePath);

      if (!(normalizedPath in files)) {
        throw new Error(`ENOENT: no such file or directory, unlink '${normalizedPath}'`);
      }

      delete files[normalizedPath];
    }),

    // Directory operations
    mkdir: vi.fn((dirPath: string, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(dirPath);

      if (normalizedPath in files) {
        throw new Error(`EEXIST: file already exists, mkdir '${normalizedPath}'`);
      }

      directories.add(normalizedPath);

      return Promise.resolve();
    }),

    mkdirSync: vi.fn((dirPath: string, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(dirPath);

      if (normalizedPath in files) {
        throw new Error(`EEXIST: file already exists, mkdir '${normalizedPath}'`);
      }

      directories.add(normalizedPath);
    }),

    rmdir: vi.fn((dirPath: string, options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(dirPath);

      if (!directories.has(normalizedPath)) {
        throw new Error(`ENOENT: no such file or directory, rmdir '${normalizedPath}'`);
      }

      // Check if directory is empty
      const dirContents = Object.keys(files).filter(filePath =>
        filePath.startsWith(normalizedPath + path.sep)
      );

      if (dirContents.length > 0 && (!options || !options.recursive)) {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${normalizedPath}'`);
      }

      // Remove directory and its contents if recursive
      if (options && options.recursive) {
        dirContents.forEach(filePath => {
          delete files[filePath];
        });

        // Remove subdirectories
        for (const dir of directories) {
          if (dir.startsWith(normalizedPath + path.sep)) {
            directories.delete(dir);
          }
        }
      }

      directories.delete(normalizedPath);

      return Promise.resolve();
    }),

    rmdirSync: vi.fn((dirPath: string, options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(dirPath);

      if (!directories.has(normalizedPath)) {
        throw new Error(`ENOENT: no such file or directory, rmdir '${normalizedPath}'`);
      }

      // Check if directory is empty
      const dirContents = Object.keys(files).filter(filePath =>
        filePath.startsWith(normalizedPath + path.sep)
      );

      if (dirContents.length > 0 && (!options || !options.recursive)) {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${normalizedPath}'`);
      }

      // Remove directory and its contents if recursive
      if (options && options.recursive) {
        dirContents.forEach(filePath => {
          delete files[filePath];
        });

        // Remove subdirectories
        for (const dir of directories) {
          if (dir.startsWith(normalizedPath + path.sep)) {
            directories.delete(dir);
          }
        }
      }

      directories.delete(normalizedPath);
    }),

    // fs-extra specific operations
    ensureDir: vi.fn((dirPath: string, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(dirPath);

      // Create parent directories if they don't exist
      const parts = normalizedPath.split(path.sep).filter(Boolean);
      let currentPath = '/';

      directories.add(currentPath);

      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        directories.add(currentPath);
      }

      return Promise.resolve();
    }),

    ensureDirSync: vi.fn((dirPath: string, _options?: FileSystemOptions) => {
      const normalizedPath = path.normalize(dirPath);

      // Create parent directories if they don't exist
      const parts = normalizedPath.split(path.sep).filter(Boolean);
      let currentPath = '/';

      directories.add(currentPath);

      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        directories.add(currentPath);
      }
    }),

    // Utility methods for testing
    _files: files,
    _directories: directories,

    _addFile: (filePath: string, content: string | Buffer) => {
      const normalizedPath = path.normalize(filePath);
      const dirPath = path.dirname(normalizedPath);

      // Create parent directory if it doesn't exist
      directories.add(dirPath);

      files[normalizedPath] = content;
    },

    _addDirectory: (dirPath: string) => {
      const normalizedPath = path.normalize(dirPath);
      directories.add(normalizedPath);
    },

    _reset: () => {
      Object.keys(files).forEach(key => {
        delete files[key];
      });

      directories.clear();
      directories.add('/');
    },
  };
}

/**
 * Mock fs-extra module
 * @param mockFs Mock file system
 */
export function mockFsExtra(mockFs: ReturnType<typeof createMockFileSystem>) {
  vi.mock('fs-extra', () => ({
    default: {
      ...mockFs,
    },
    ...mockFs,
  }));
}

/**
 * Restore fs-extra module
 */
export function restoreFsExtra() {
  vi.unmock('fs-extra');
}
