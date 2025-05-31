import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YamlComposer } from '../yaml-composer.js';
import { ParsingError } from '../../../utils/errors.js';
import path from 'path';

// Mock dependencies
vi.mock('fs-extra');
vi.mock('../../../utils/llmHelper.js');
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('YamlComposer Progressive JSON Parsing', () => {
  let yamlComposer: YamlComposer;
  const mockBaseTemplatePath = '/mock/templates';

  beforeEach(() => {
    vi.clearAllMocks();
    yamlComposer = new YamlComposer(mockBaseTemplatePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('progressiveJsonParse', () => {
    it('should parse valid JSON directly', () => {
      const validJson = '{"moduleName": "test", "type": "frontend"}';
      const result = (yamlComposer as any).progressiveJsonParse(validJson, 'test-context');
      
      expect(result).toEqual({
        moduleName: 'test',
        type: 'frontend'
      });
    });

    it('should fix position 2572 type errors (missing commas)', () => {
      const malformedJson = `{
        "moduleName": "react-native-app"
        "description": "A React Native application"
        "type": "frontend"
      }`;
      
      const result = (yamlComposer as any).progressiveJsonParse(malformedJson, 'react-native');
      
      expect(result).toEqual({
        moduleName: 'react-native-app',
        description: 'A React Native application',
        type: 'frontend'
      });
    });

    it('should fix position 1210 type errors (control characters)', () => {
      const jsonWithControlChars = '{"content": "line1\x0Aline2\x09tab", "type": "pwa"}';
      
      const result = (yamlComposer as any).progressiveJsonParse(jsonWithControlChars, 'pwa');
      
      expect(result.type).toBe('pwa');
      expect(result.content).toMatch(/line1.*line2.*tab/);
    });

    it('should complete missing brackets', () => {
      const incompleteJson = '{"moduleName": "test", "nested": {"inner": "value"';
      
      const result = (yamlComposer as any).progressiveJsonParse(incompleteJson, 'incomplete');
      
      expect(result).toEqual({
        moduleName: 'test',
        nested: { inner: 'value' }
      });
    });

    it('should extract partial valid JSON', () => {
      const mixedContent = 'Some text before {"moduleName": "extracted", "type": "test"} and after';
      
      const result = (yamlComposer as any).progressiveJsonParse(mixedContent, 'mixed');
      
      expect(result).toEqual({
        moduleName: 'extracted',
        type: 'test'
      });
    });

    it('should handle multiple missing brackets', () => {
      const multipleIncomplete = '{"level1": {"level2": {"level3": "value"';
      
      const result = (yamlComposer as any).progressiveJsonParse(multipleIncomplete, 'nested');
      
      expect(result).toEqual({
        level1: {
          level2: {
            level3: 'value'
          }
        }
      });
    });

    it('should handle arrays with missing brackets', () => {
      const arrayIncomplete = '{"items": [1, 2, 3, "nested": {"key": "value"}';
      
      const result = (yamlComposer as any).progressiveJsonParse(arrayIncomplete, 'array');
      
      expect(result.items).toEqual([1, 2, 3]);
      expect(result.nested).toEqual({ key: 'value' });
    });

    it('should throw ParsingError when all strategies fail', () => {
      const completelyInvalid = 'this is not JSON at all and cannot be fixed';
      
      expect(() => {
        (yamlComposer as any).progressiveJsonParse(completelyInvalid, 'invalid');
      }).toThrow(ParsingError);
    });

    it('should include context in error messages', () => {
      const invalid = 'invalid json';
      
      try {
        (yamlComposer as any).progressiveJsonParse(invalid, 'test-module');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ParsingError);
        expect((error as ParsingError).message).toContain('test-module');
      }
    });

    it('should handle real-world React Native template structure', () => {
      const reactNativeTemplate = `{
        "moduleName": "react-native-frontend"
        "description": "React Native frontend with TypeScript"
        "type": "frontend"
        "provides": {
          "techStack": {
            "mobileFramework": {
              "name": "React Native"
              "version": "^0.72.0"
            }
          }
          "directoryStructure": [
            {
              "path": "src/"
              "type": "directory"
            }
          ]
        }
      }`;
      
      const result = (yamlComposer as any).progressiveJsonParse(reactNativeTemplate, 'react-native');
      
      expect(result.moduleName).toBe('react-native-frontend');
      expect(result.type).toBe('frontend');
      expect(result.provides.techStack.mobileFramework.name).toBe('React Native');
      expect(Array.isArray(result.provides.directoryStructure)).toBe(true);
    });

    it('should handle real-world PWA template structure', () => {
      const pwaTemplate = `{
        "moduleName": "pwa-frontend",
        "description": "Progressive Web App with service worker\nand offline capabilities\tfor better UX",
        "type": "frontend",
        "provides": {
          "techStack": {
            "pwaFeatures": {
              "name": "Service Worker",
              "version": "latest"
            }
          }
        }
      }`;
      
      const result = (yamlComposer as any).progressiveJsonParse(pwaTemplate, 'pwa');
      
      expect(result.moduleName).toBe('pwa-frontend');
      expect(result.type).toBe('frontend');
      expect(result.description).toContain('Progressive Web App');
      expect(result.provides.techStack.pwaFeatures.name).toBe('Service Worker');
    });

    it('should handle complex nested structures with multiple issues', () => {
      const complexMalformed = `{
        "moduleName": "complex-module"
        "description": "A complex module with\tmultiple\nissues"
        "type": "backend"
        "provides": {
          "techStack": {
            "database": {
              "name": "PostgreSQL"
              "version": "^15.0"
            }
            "framework": {
              "name": "Express.js"
              "version": "^4.18.0"
            }
          }
          "dependencies": {
            "npm": {
              "root": {
                "dependencies": {
                  "express": "^4.18.0"
                  "pg": "^8.8.0"
                }
              }
            }
          }
        }
      }`;
      
      const result = (yamlComposer as any).progressiveJsonParse(complexMalformed, 'complex');
      
      expect(result.moduleName).toBe('complex-module');
      expect(result.type).toBe('backend');
      expect(result.provides.techStack.database.name).toBe('PostgreSQL');
      expect(result.provides.techStack.framework.name).toBe('Express.js');
      expect(result.provides.dependencies.npm.root.dependencies.express).toBe('^4.18.0');
      expect(result.provides.dependencies.npm.root.dependencies.pg).toBe('^8.8.0');
    });

    it('should maintain performance under 50ms for large templates', () => {
      // Create a large template with multiple issues
      const largeTemplate = `{
        "moduleName": "large-template"
        "description": "A very large template for testing performance"
        "type": "fullstack"
        "provides": {
          "techStack": {
            ${'framework'.repeat(100)}: {
              "name": "Large Framework"
              "version": "1.0.0"
            }
          }
          "directoryStructure": [
            ${Array.from({ length: 50 }, (_, i) => `{
              "path": "dir${i}/"
              "type": "directory"
              "children": [
                {
                  "path": "file${i}.ts"
                  "type": "file"
                  "content": "// File ${i} content with\ttabs and\nnewlines"
                }
              ]
            }`).join(',')}
          ]
        }
      }`;
      
      const startTime = Date.now();
      const result = (yamlComposer as any).progressiveJsonParse(largeTemplate, 'large');
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(50);
      expect(result.moduleName).toBe('large-template');
      expect(Array.isArray(result.provides.directoryStructure)).toBe(true);
      expect(result.provides.directoryStructure.length).toBe(50);
    });
  });
});
