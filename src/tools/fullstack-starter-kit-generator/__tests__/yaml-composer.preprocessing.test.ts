import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YAMLComposer } from '../yaml-composer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('YAMLComposer Preprocessing Fix', () => {
  let yamlComposer: YAMLComposer;
  const mockConfig = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'test-key',
    geminiModel: 'google/gemini-2.5-flash-preview',
    perplexityModel: 'perplexity/sonar-deep-research',
    llm_mapping: {
      fullstack_starter_kit_dynamic_yaml_module_generation: 'google/gemini-2.5-flash-preview'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    yamlComposer = new YAMLComposer(mockConfig, path.join(__dirname, '../templates'));
  });

  describe('preprocessTemplateForValidation', () => {
    it('should fix missing content field for directories', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              // Missing content field - this is the bug!
              children: []
            }
          ]
        }
      };

      // Access the private method using bracket notation for testing
      const preprocessed = (yamlComposer as any).preprocessTemplateForValidation(problematicJson, 'test/module');

      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('content');
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
    });

    it('should fix missing content field for files', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/index.js',
              type: 'file',
              // Missing content field - this is the bug!
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as any).preprocessTemplateForValidation(problematicJson, 'test/module');

      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('content');
      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('generationPrompt');
      expect(preprocessed.provides.directoryStructure[0].generationPrompt).toBe(null);
    });

    it('should fix missing generationPrompt field for files', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/index.js',
              type: 'file',
              content: 'console.log("test");'
              // Missing generationPrompt field
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as any).preprocessTemplateForValidation(problematicJson, 'test/module');

      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('generationPrompt');
      expect(preprocessed.provides.directoryStructure[0].generationPrompt).toBe(null);
    });

    it('should handle nested directory structures', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              // Missing content field
              children: [
                {
                  path: 'src/components/',
                  type: 'directory',
                  // Missing content field
                  children: [
                    {
                      path: 'src/components/Button.js',
                      type: 'file',
                      content: 'export default Button;'
                      // Missing generationPrompt field
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as any).preprocessTemplateForValidation(problematicJson, 'test/module');

      // Check root directory
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
      
      // Check nested directory
      expect(preprocessed.provides.directoryStructure[0].children[0].content).toBe(null);
      
      // Check nested file
      const nestedFile = preprocessed.provides.directoryStructure[0].children[0].children[0];
      expect(nestedFile.content).toBe('export default Button;');
      expect(nestedFile.generationPrompt).toBe(null);
    });

    it('should handle the exact voice-recognition-web-api error case', () => {
      // This is the exact structure that caused the original error
      const problematicJson = {
        moduleName: 'voice-recognition-web-api-utility',
        description: 'Voice Recognition Web API utility module for {projectName}',
        type: 'utility',
        placeholders: ['projectName'],
        provides: {
          techStack: {
            'web-api': {
              name: 'Web Speech API',
              rationale: 'Provides browser-native voice recognition capabilities.'
            }
          },
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              // Missing content field - this is the exact bug!
              children: [
                {
                  path: 'src/voiceRecognition.js',
                  type: 'file',
                  content: 'console.log("voice recognition code");'
                  // Missing generationPrompt field
                }
              ]
            }
          ],
          dependencies: {},
          setupCommands: []
        }
      };

      const preprocessed = (yamlComposer as any).preprocessTemplateForValidation(problematicJson, 'utility/voice-recognition-web-api');

      // Verify the directory has content: null
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
      
      // Verify the file has both content and generationPrompt fields
      const fileItem = preprocessed.provides.directoryStructure[0].children[0];
      expect(fileItem.content).toBe('console.log("voice recognition code");');
      expect(fileItem.generationPrompt).toBe(null);
    });

    it('should not modify already valid structures', () => {
      const validJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              content: null,
              children: [
                {
                  path: 'src/index.js',
                  type: 'file',
                  content: 'console.log("test");',
                  generationPrompt: null
                }
              ]
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as any).preprocessTemplateForValidation(validJson, 'test/module');

      // Should remain unchanged
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
      const fileItem = preprocessed.provides.directoryStructure[0].children[0];
      expect(fileItem.content).toBe('console.log("test");');
      expect(fileItem.generationPrompt).toBe(null);
    });
  });
});
