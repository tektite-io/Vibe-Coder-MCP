/**
 * Tests for Intent Pattern Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntentPatternEngine, EntityExtractors } from '../../nl/patterns.js';
import { Intent } from '../../types/nl.js';

describe('IntentPatternEngine', () => {
  let patternEngine: IntentPatternEngine;

  beforeEach(() => {
    patternEngine = new IntentPatternEngine();
  });

  describe('Pattern Matching', () => {
    it('should match create project intent', () => {
      const matches = patternEngine.matchIntent('Create a new project called "Web App"');
      
      expect(matches).toHaveLength(1);
      expect(matches[0].intent).toBe('create_project');
      expect(matches[0].confidence).toBeGreaterThan(0.5);
      expect(matches[0].entities.projectName).toBe('Web App');
    });

    it('should match create task intent', () => {
      const matches = patternEngine.matchIntent('Create a task for implementing authentication');
      
      expect(matches).toHaveLength(1);
      expect(matches[0].intent).toBe('create_task');
      expect(matches[0].confidence).toBeGreaterThan(0.5);
    });

    it('should match list projects intent', () => {
      const matches = patternEngine.matchIntent('Show me all projects');
      
      expect(matches).toHaveLength(1);
      expect(matches[0].intent).toBe('list_projects');
      expect(matches[0].confidence).toBeGreaterThan(0.5);
    });

    it('should match status check intent', () => {
      const matches = patternEngine.matchIntent('What\'s the status of the web project?');
      
      expect(matches).toHaveLength(1);
      expect(matches[0].intent).toBe('check_status');
      expect(matches[0].confidence).toBeGreaterThan(0.5);
    });

    it('should return empty array for unrecognized input', () => {
      const matches = patternEngine.matchIntent('This is completely unrelated text');
      
      expect(matches).toHaveLength(0);
    });

    it('should handle case insensitive matching', () => {
      const matches = patternEngine.matchIntent('CREATE A NEW PROJECT');
      
      expect(matches).toHaveLength(1);
      expect(matches[0].intent).toBe('create_project');
    });
  });

  describe('Entity Extraction', () => {
    it('should extract project name from quotes', () => {
      const entities = EntityExtractors.projectName('Create project "My App"', [] as any);
      expect(entities.projectName).toBe('My App');
    });

    it('should extract task information', () => {
      const entities = EntityExtractors.taskInfo('Create a high priority development task', [] as any);
      expect(entities.priority).toBe('high');
      expect(entities.type).toBe('development');
    });

    it('should extract status information', () => {
      const entities = EntityExtractors.statusInfo('Show completed tasks from today', [] as any);
      expect(entities.status).toBe('completed');
      expect(entities.timeframe).toBe('today');
    });

    it('should extract agent information', () => {
      const entities = EntityExtractors.agentInfo('Assign to agent "John"', [] as any);
      expect(entities.assignee).toBe('John');
    });

    it('should extract general entities like tags', () => {
      const entities = EntityExtractors.general('Create task #urgent #frontend', [] as any);
      expect(entities.tags).toEqual(['urgent', 'frontend']);
    });
  });

  describe('Pattern Management', () => {
    it('should add custom patterns', () => {
      const customPattern = {
        id: 'custom_test',
        intent: 'create_project' as Intent,
        patterns: ['build\\s+new\\s+app'],
        keywords: ['build', 'new', 'app'],
        requiredEntities: [],
        optionalEntities: [],
        priority: 5,
        active: true,
        examples: ['Build new app']
      };

      patternEngine.addPattern('create_project', customPattern);
      
      const matches = patternEngine.matchIntent('Build new app');
      expect(matches).toHaveLength(1);
      expect(matches[0].intent).toBe('create_project');
    });

    it('should remove patterns', () => {
      const removed = patternEngine.removePattern('create_project', 'create_project_basic');
      expect(removed).toBe(true);
      
      // Should not match anymore
      const matches = patternEngine.matchIntent('Create a new project');
      expect(matches).toHaveLength(0);
    });

    it('should get patterns for intent', () => {
      const patterns = patternEngine.getPatternsForIntent('create_project');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].intent).toBe('create_project');
    });

    it('should get supported intents', () => {
      const intents = patternEngine.getSupportedIntents();
      expect(intents).toContain('create_project');
      expect(intents).toContain('create_task');
      expect(intents).toContain('list_projects');
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        minConfidence: 0.8,
        enableFuzzyMatching: true
      };

      patternEngine.updateConfig(newConfig);
      const config = patternEngine.getConfig();
      
      expect(config.minConfidence).toBe(0.8);
      expect(config.enableFuzzyMatching).toBe(true);
    });

    it('should export and import patterns', () => {
      const exported = patternEngine.exportPatterns();
      expect(exported).toHaveProperty('create_project');
      
      patternEngine.clearPatterns();
      expect(patternEngine.getTotalPatternCount()).toBe(0);
      
      patternEngine.importPatterns(exported);
      expect(patternEngine.getTotalPatternCount()).toBeGreaterThan(0);
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign higher confidence to exact matches', () => {
      const matches1 = patternEngine.matchIntent('create project');
      const matches2 = patternEngine.matchIntent('create a new project with advanced features');
      
      expect(matches1[0].confidence).toBeGreaterThan(matches2[0].confidence);
    });

    it('should boost confidence for keyword matches', () => {
      const matches = patternEngine.matchIntent('create new project');
      expect(matches[0].confidence).toBeGreaterThan(0.5);
    });
  });
});
