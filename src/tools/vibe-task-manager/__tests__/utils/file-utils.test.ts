import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import { FileUtils } from '../../utils/file-utils.js';
import { setupCommonMocks, cleanupMocks } from './test-setup.js';

// Mock fs-extra
vi.mock('fs-extra');
const mockFs = fs as any;

describe('FileUtils', () => {
  beforeEach(() => {
    setupCommonMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('readFile', () => {
    it('should read file successfully', async () => {
      const testContent = 'test file content';
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 1000 });
      mockFs.readFile.mockResolvedValue(testContent);

      const result = await FileUtils.readFile('test.txt');

      expect(result.success).toBe(true);
      expect(result.data).toBe(testContent);
      expect(result.metadata?.filePath).toBe('test.txt');
      expect(result.metadata?.operation).toBe('read');
    });

    it('should reject files that are too large', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: 20 * 1024 * 1024 }); // 20MB

      const result = await FileUtils.readFile('large.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File too large');
    });

    it('should reject non-existent files', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await FileUtils.readFile('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File does not exist');
    });

    it('should reject path traversal attempts', async () => {
      const result = await FileUtils.readFile('../../../etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path traversal not allowed');
    });

    it('should reject disallowed file extensions', async () => {
      const result = await FileUtils.readFile('test.exe');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File extension .exe not allowed');
    });
  });

  describe('writeFile', () => {
    it('should write file successfully', async () => {
      const testContent = 'test content';
      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ size: testContent.length });

      const result = await FileUtils.writeFile('test.txt', testContent);

      expect(result.success).toBe(true);
      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith('test.txt', testContent, 'utf-8');
    });

    it('should reject invalid file paths', async () => {
      const result = await FileUtils.writeFile('../invalid.txt', 'content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path traversal not allowed');
    });
  });

  describe('readYamlFile', () => {
    it('should read and parse YAML file successfully', async () => {
      const yamlContent = 'key: value\nnumber: 42';
      const expectedData = { key: 'value', number: 42 };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: yamlContent.length });
      mockFs.readFile.mockResolvedValue(yamlContent);

      const result = await FileUtils.readYamlFile('test.yaml');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedData);
    });

    it('should validate YAML against schema if provided', async () => {
      const yamlContent = 'name: test\nage: 25';
      const schema = vi.fn().mockReturnValue({
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { name: 'test', age: 25 }
        })
      });

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: yamlContent.length });
      mockFs.readFile.mockResolvedValue(yamlContent);

      const result = await FileUtils.readYamlFile('test.yaml', schema());

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test', age: 25 });
    });

    it('should handle YAML validation errors', async () => {
      const yamlContent = 'name: test';
      const schema = vi.fn().mockReturnValue({
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: {
            errors: [{ path: ['age'], message: 'Required' }]
          }
        })
      });

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: yamlContent.length });
      mockFs.readFile.mockResolvedValue(yamlContent);

      const result = await FileUtils.readYamlFile('test.yaml', schema());

      expect(result.success).toBe(false);
      expect(result.error).toContain('YAML validation failed');
      expect(result.error).toContain('age: Required');
    });
  });

  describe('writeYamlFile', () => {
    it('should write YAML file successfully', async () => {
      const testData = { key: 'value', number: 42 };
      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ size: 100 });

      const result = await FileUtils.writeYamlFile('test.yaml', testData);

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();

      // Check that YAML content was generated
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[1]).toContain('key: value');
      expect(writeCall[1]).toContain('number: 42');
    });

    it('should validate data against schema before writing', async () => {
      const testData = { name: 'test' };
      const schema = vi.fn().mockReturnValue({
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: {
            errors: [{ path: ['age'], message: 'Required' }]
          }
        })
      });

      const result = await FileUtils.writeYamlFile('test.yaml', testData, schema());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Data validation failed');
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('readJsonFile', () => {
    it('should read and parse JSON file successfully', async () => {
      const jsonContent = '{"key": "value", "number": 42}';
      const expectedData = { key: 'value', number: 42 };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: jsonContent.length });
      mockFs.readFile.mockResolvedValue(jsonContent);

      const result = await FileUtils.readJsonFile('test.json');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedData);
    });

    it('should handle invalid JSON', async () => {
      const invalidJson = '{"key": "value"'; // Missing closing brace

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ size: invalidJson.length });
      mockFs.readFile.mockResolvedValue(invalidJson);

      const result = await FileUtils.readJsonFile('test.json');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected');
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON file successfully', async () => {
      const testData = { key: 'value', number: 42 };
      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ size: 100 });

      const result = await FileUtils.writeJsonFile('test.json', testData);

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();

      // Check that JSON content was generated
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1]);
      expect(writtenContent).toEqual(testData);
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory successfully', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined);

      const result = await FileUtils.ensureDirectory('/test/dir');

      expect(result.success).toBe(true);
      expect(mockFs.ensureDir).toHaveBeenCalledWith('/test/dir');
    });

    it('should handle directory creation errors', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('Permission denied'));

      const result = await FileUtils.ensureDirectory('/test/dir');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing files', async () => {
      mockFs.pathExists.mockResolvedValue(true);

      const exists = await FileUtils.fileExists('test.txt');

      expect(exists).toBe(true);
    });

    it('should return false for non-existing files', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const exists = await FileUtils.fileExists('nonexistent.txt');

      expect(exists).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockFs.pathExists.mockRejectedValue(new Error('Access denied'));

      const exists = await FileUtils.fileExists('test.txt');

      expect(exists).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.remove.mockResolvedValue(undefined);

      const result = await FileUtils.deleteFile('test.txt');

      expect(result.success).toBe(true);
      expect(mockFs.remove).toHaveBeenCalledWith('test.txt');
    });

    it('should handle non-existent files gracefully', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await FileUtils.deleteFile('nonexistent.txt');

      expect(result.success).toBe(true); // Should consider it deleted
      expect(mockFs.remove).not.toHaveBeenCalled();
    });

    it('should reject invalid file paths', async () => {
      const result = await FileUtils.deleteFile('../invalid.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path traversal not allowed');
    });
  });
});
