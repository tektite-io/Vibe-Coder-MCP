import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MCP Config Validation', () => {
  it('should load and parse mcp-config.json successfully', () => {
    const configPath = path.resolve(__dirname, '../../../../mcp-config.json');
    
    const configFile = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configFile);
    
    expect(config).toBeDefined();
    expect(config.tools).toBeDefined();
    expect(typeof config.tools).toBe('object');
  });

  it('should have expanded use cases for key tools', () => {
    const configPath = path.resolve(__dirname, '../../../../mcp-config.json');
    
    const configFile = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configFile);
    
    // Check that fullstack-starter-kit-generator has expanded use cases
    const fullstackTool = config.tools['fullstack-starter-kit-generator'];
    expect(fullstackTool).toBeDefined();
    expect(fullstackTool.use_cases).toBeDefined();
    expect(Array.isArray(fullstackTool.use_cases)).toBe(true);
    expect(fullstackTool.use_cases.length).toBeGreaterThan(10); // Should have many more than original 5
    expect(fullstackTool.use_cases).toContain('project scaffolding');
    expect(fullstackTool.use_cases).toContain('rapid prototyping');
    expect(fullstackTool.use_cases).toContain('mvp development');

    // Check vibe-task-manager has expanded use cases
    const taskManagerTool = config.tools['vibe-task-manager'];
    expect(taskManagerTool).toBeDefined();
    expect(taskManagerTool.use_cases).toBeDefined();
    expect(Array.isArray(taskManagerTool.use_cases)).toBe(true);
    expect(taskManagerTool.use_cases.length).toBeGreaterThan(20); // Should have many expanded cases
    expect(taskManagerTool.use_cases).toContain('task management');
    expect(taskManagerTool.use_cases).toContain('autonomous development');
    expect(taskManagerTool.use_cases).toContain('devops automation');

    // Check process-request has expanded use cases
    const processRequestTool = config.tools['process-request'];
    expect(processRequestTool).toBeDefined();
    expect(processRequestTool.use_cases).toBeDefined();
    expect(Array.isArray(processRequestTool.use_cases)).toBe(true);
    expect(processRequestTool.use_cases.length).toBeGreaterThan(15); // Should have many expanded cases
    expect(processRequestTool.use_cases).toContain('natural language processing');
    expect(processRequestTool.use_cases).toContain('conversational ai');
    expect(processRequestTool.use_cases).toContain('intent recognition');
  });

  it('should have all required fields for each tool', () => {
    const configPath = path.resolve(__dirname, '../../../../mcp-config.json');
    
    const configFile = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configFile);
    
    for (const [, toolData] of Object.entries(config.tools)) {
      expect(toolData).toBeDefined();
      // @ts-expect-error - toolData is of unknown type
      expect(toolData.description).toBeDefined();
      // @ts-expect-error - toolData is of unknown type
      expect(typeof toolData.description).toBe('string');
      // @ts-expect-error - toolData is of unknown type
      expect(toolData.use_cases).toBeDefined();
      // @ts-expect-error - toolData is of unknown type
      expect(Array.isArray(toolData.use_cases)).toBe(true);
      // @ts-expect-error - toolData is of unknown type
      expect(toolData.use_cases.length).toBeGreaterThan(0);
      // @ts-expect-error - toolData is of unknown type
      expect(toolData.input_patterns).toBeDefined();
      // @ts-expect-error - toolData is of unknown type
      expect(Array.isArray(toolData.input_patterns)).toBe(true);
    }
  });
});