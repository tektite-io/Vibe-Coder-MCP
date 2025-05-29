/**
 * Intent Pattern Engine for Natural Language Processing
 * Implements regex-based pattern matching for intent recognition
 */

import { Intent, IntentPattern, RecognizedIntent, ConfidenceLevel } from '../types/nl.js';
import logger from '../../../logger.js';

/**
 * Entity extractor function type
 */
export type EntityExtractor = (text: string, match: RegExpMatchArray) => Record<string, any>;

/**
 * Intent match result
 */
export interface IntentMatch {
  intent: Intent;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  entities: Record<string, any>;
  pattern: IntentPattern;
  matchedText: string;
  processingTime: number;
}

/**
 * Pattern engine configuration
 */
export interface PatternEngineConfig {
  /** Minimum confidence threshold for pattern matches */
  minConfidence: number;
  /** Maximum number of patterns to check per intent */
  maxPatternsPerIntent: number;
  /** Whether to enable fuzzy matching */
  enableFuzzyMatching: boolean;
  /** Fuzzy matching threshold (0-1) */
  fuzzyThreshold: number;
}

/**
 * Default entity extractors for common patterns
 */
export class EntityExtractors {
  /**
   * Extract project name from text
   */
  static projectName(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Look for project name in quotes or after keywords
    const projectPatterns = [
      /called\s+["']([^"']+)["']/i,
      /project\s+["']([^"']+)["']/i,
      /["']([^"']+)["']\s+project/i,
      /for\s+["']([^"']+)["']/i,
      // Patterns without quotes
      /called\s+(\w+)/i,
      /project\s+(\w+)/i,
      /for\s+(\w+)/i
    ];

    for (const pattern of projectPatterns) {
      const projectMatch = text.match(pattern);
      if (projectMatch) {
        entities.projectName = projectMatch[1].trim();
        break;
      }
    }

    return entities;
  }

  /**
   * Extract task information from text
   */
  static taskInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract task title - try patterns with and without quotes
    const titlePatterns = [
      /task\s+["']([^"']+)["']/i,
      /["']([^"']+)["']\s+task/i,
      /for\s+["']([^"']+)["']/i,
      /called\s+["']([^"']+)["']/i,
      /to\s+["']([^"']+)["']/i,
      // Patterns without quotes
      /called\s+(\w+)/i,
      /for\s+(\w+)/i,
      /task\s+(\w+)/i,
      /(\w+)\s+task/i
    ];

    for (const pattern of titlePatterns) {
      const titleMatch = text.match(pattern);
      if (titleMatch) {
        entities.taskTitle = titleMatch[1].trim();
        break;
      }
    }

    // Extract priority
    const priorityMatch = text.match(/\b(low|medium|high|critical)\s+priority\b/i) ||
                         text.match(/priority\s+(low|medium|high|critical)\b/i);
    if (priorityMatch) {
      entities.priority = priorityMatch[1].toLowerCase();
    }

    // Extract task type
    const typeMatch = text.match(/\b(development|testing|documentation|research|bug|feature)\b/i);
    if (typeMatch) {
      entities.type = typeMatch[1].toLowerCase();
    }

    return entities;
  }

  /**
   * Extract status information from text
   */
  static statusInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract status
    const statusMatch = text.match(/\b(pending|in_progress|completed|blocked|cancelled)\b/i);
    if (statusMatch) {
      entities.status = statusMatch[1].toLowerCase();
    }

    // Extract timeframe
    const timePatterns = [
      /\b(today|tomorrow|this\s+week|next\s+week|this\s+month)\b/i,
      /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
      /\b(\d{4}-\d{2}-\d{2})\b/
    ];

    for (const pattern of timePatterns) {
      const timeMatch = text.match(pattern);
      if (timeMatch) {
        entities.timeframe = timeMatch[1];
        break;
      }
    }

    return entities;
  }

  /**
   * Extract agent information from text
   */
  static agentInfo(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract agent name
    const agentPatterns = [
      /agent\s+["']([^"']+)["']/i,
      /to\s+["']([^"']+)["']/i,
      /assign\s+to\s+(\w+)/i,
      /give\s+(\w+)\s+the/i
    ];

    for (const pattern of agentPatterns) {
      const agentMatch = text.match(pattern);
      if (agentMatch) {
        entities.assignee = agentMatch[1].trim();
        break;
      }
    }

    return entities;
  }

  /**
   * Extract general entities from text
   */
  static general(text: string, match: RegExpMatchArray): Record<string, any> {
    const entities: Record<string, any> = {};

    // Extract tags
    const tagMatches = text.match(/#(\w+)/g);
    if (tagMatches) {
      entities.tags = tagMatches.map(tag => tag.substring(1));
    }

    // Extract numbers (could be IDs, hours, etc.)
    const numberMatches = text.match(/\b\d+\b/g);
    if (numberMatches) {
      entities.numbers = numberMatches.map(num => parseInt(num, 10));
    }

    return entities;
  }
}

/**
 * Intent Pattern Engine implementation
 */
export class IntentPatternEngine {
  private patterns = new Map<Intent, IntentPattern[]>();
  private config: PatternEngineConfig;

  constructor(config: Partial<PatternEngineConfig> = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.3,
      maxPatternsPerIntent: config.maxPatternsPerIntent ?? 10,
      enableFuzzyMatching: config.enableFuzzyMatching ?? false,
      fuzzyThreshold: config.fuzzyThreshold ?? 0.7
    };

    this.initializeDefaultPatterns();
  }

  /**
   * Initialize default patterns for common intents
   */
  private initializeDefaultPatterns(): void {
    // Project creation patterns
    this.addPattern('create_project', {
      id: 'create_project_basic',
      intent: 'create_project',
      patterns: [
        'create\\s+(?:a\\s+)?(?:new\\s+)?project',
        'start\\s+(?:a\\s+)?(?:new\\s+)?project',
        'set\\s+up\\s+(?:a\\s+)?(?:new\\s+)?project',
        'initialize\\s+(?:a\\s+)?(?:new\\s+)?project',
        'create\\s+(?:something\\s+)?(?:new\\s+)?(?:for\\s+the\\s+)?project',
        'make\\s+(?:a\\s+)?(?:new\\s+)?project'
      ],
      keywords: ['create', 'start', 'setup', 'initialize', 'project', 'new', 'make', 'something'],
      requiredEntities: [],
      optionalEntities: ['projectName', 'description'],
      priority: 10,
      active: true,
      examples: [
        'Create a new project called "Web App"',
        'Start a project for the mobile app',
        'Set up a new project',
        'Create something new for the project'
      ]
    });

    // Task creation patterns
    this.addPattern('create_task', {
      id: 'create_task_basic',
      intent: 'create_task',
      patterns: [
        'create\\s+(?:a\\s+)?(?:new\\s+)?(?:high\\s+priority\\s+)?(?:development\\s+)?task',
        'add\\s+(?:a\\s+)?(?:new\\s+)?task',
        'make\\s+(?:a\\s+)?(?:new\\s+)?task',
        'need\\s+(?:a\\s+)?(?:new\\s+)?task',
        'create\\s+(?:a\\s+)?(?:high|medium|low|critical)\\s+priority\\s+(?:development|testing|documentation|research|bug|feature)\\s+task',
        'create\\s+(?:a\\s+)?(?:development|testing|documentation|research|bug|feature)\\s+task'
      ],
      keywords: ['create', 'add', 'make', 'need', 'task', 'new', 'priority', 'development', 'high'],
      requiredEntities: [],
      optionalEntities: ['taskTitle', 'priority', 'type', 'assignee'],
      priority: 10,
      active: true,
      examples: [
        'Create a task for implementing authentication',
        'Add a new task to fix the login bug',
        'Make a task for testing the API',
        'Create a high priority development task for implementing authentication'
      ]
    });

    // Listing patterns
    this.addPattern('list_projects', {
      id: 'list_projects_basic',
      intent: 'list_projects',
      patterns: [
        'list\\s+(?:all\\s+)?projects',
        'show\\s+(?:me\\s+)?(?:all\\s+)?projects',
        'display\\s+(?:all\\s+)?projects',
        'what\\s+projects',
        'show\\s+(?:me\\s+)?(?:all\\s+)?(?:completed|pending|in_progress|blocked|cancelled)\\s+projects',
        'list\\s+(?:all\\s+)?(?:completed|pending|in_progress)\\s+projects',
        'show\\s+(?:me\\s+)?(?:all\\s+)?(?:completed|pending|in_progress|blocked|cancelled)\\s+projects\\s+(?:from\\s+)?(?:today|tomorrow|this\\s+week|next\\s+week|this\\s+month)'
      ],
      keywords: ['list', 'show', 'display', 'projects', 'all', 'completed', 'pending', 'week'],
      requiredEntities: [],
      optionalEntities: ['status', 'timeframe'],
      priority: 10,
      active: true,
      examples: [
        'List all projects',
        'Show me the projects',
        'What projects do we have?',
        'Show me all completed projects from this week'
      ]
    });

    // Task listing patterns
    this.addPattern('list_tasks', {
      id: 'list_tasks_basic',
      intent: 'list_tasks',
      patterns: [
        'list\\s+(?:all\\s+)?tasks',
        'show\\s+(?:me\\s+)?(?:all\\s+)?tasks',
        'display\\s+(?:all\\s+)?tasks',
        'what\\s+tasks',
        'show\\s+(?:completed|pending|in_progress|blocked|cancelled)\\s+tasks',
        'list\\s+(?:all\\s+)?(?:pending|completed|in_progress)\\s+tasks',
        'show\\s+(?:completed|pending|in_progress|blocked|cancelled)\\s+tasks\\s+(?:from\\s+)?(?:today|tomorrow|this\\s+week|next\\s+week|this\\s+month)',
        'list\\s+(?:all\\s+)?(?:pending|completed|in_progress)\\s+tasks\\s+assigned\\s+to\\s+me'
      ],
      keywords: ['list', 'show', 'display', 'tasks', 'all', 'completed', 'pending', 'today', 'assigned'],
      requiredEntities: [],
      optionalEntities: ['status', 'priority', 'assignee', 'timeframe'],
      priority: 10,
      active: true,
      examples: [
        'List all tasks',
        'Show me pending tasks',
        'What tasks are assigned to me?',
        'Show completed tasks from today',
        'List all pending tasks assigned to me'
      ]
    });

    // Status checking patterns
    this.addPattern('check_status', {
      id: 'check_status_basic',
      intent: 'check_status',
      patterns: [
        'status\\s+of',
        'check\\s+(?:the\\s+)?status',
        'what(?:\'s|\\s+is)\\s+the\\s+status',
        'how\\s+is\\s+.+\\s+(?:going|progressing)',
        'show\\s+(?:project\\s+)?status',
        'show\\s+(?:me\\s+)?(?:the\\s+)?(?:project\\s+)?status',
        'what(?:\'s|\\s+is)\\s+the\\s+status\\s+of\\s+the\\s+.+\\s+(?:application\\s+)?project'
      ],
      keywords: ['status', 'check', 'progress', 'how', 'going', 'show', 'project'],
      requiredEntities: [],
      optionalEntities: ['projectName', 'taskId'],
      priority: 10,
      active: true,
      examples: [
        'What\'s the status of the web project?',
        'Check the status of task 123',
        'How is the development going?',
        'Show project status',
        'What\'s the status of the web application project?'
      ]
    });

    // Task execution patterns
    this.addPattern('run_task', {
      id: 'run_task_basic',
      intent: 'run_task',
      patterns: [
        'run\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'execute\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'start\\s+(?:working\\s+on\\s+)?(?:the\\s+)?(?:\\w+\\s+)?task',
        'begin\\s+(?:the\\s+)?(?:\\w+\\s+)?task',
        'run\\s+(?:task\\s+)?\\d+',
        'execute\\s+(?:task\\s+)?\\d+',
        'run\\s+(?:the\\s+)?\\w+\\s+task',
        'execute\\s+(?:the\\s+)?\\w+\\s+task'
      ],
      keywords: ['run', 'execute', 'start', 'begin', 'task', 'authentication'],
      requiredEntities: [],
      optionalEntities: ['taskId', 'taskTitle'],
      priority: 10,
      active: true,
      examples: [
        'Run task 123',
        'Execute the authentication task',
        'Start working on the login feature',
        'Run the authentication task'
      ]
    });

    logger.info({ patternCount: this.getTotalPatternCount() }, 'Default patterns initialized');
  }

  /**
   * Add a pattern for an intent
   */
  addPattern(intent: Intent, pattern: IntentPattern): void {
    if (!this.patterns.has(intent)) {
      this.patterns.set(intent, []);
    }

    const intentPatterns = this.patterns.get(intent)!;

    // Check if pattern already exists
    const existingPattern = intentPatterns.find(p => p.id === pattern.id);
    if (existingPattern) {
      logger.warn({ patternId: pattern.id, intent }, 'Pattern already exists, updating');
      Object.assign(existingPattern, pattern);
    } else {
      intentPatterns.push(pattern);
      intentPatterns.sort((a, b) => b.priority - a.priority); // Sort by priority descending
    }

    logger.debug({ patternId: pattern.id, intent, priority: pattern.priority }, 'Pattern added');
  }

  /**
   * Remove a pattern by ID
   */
  removePattern(intent: Intent, patternId: string): boolean {
    const intentPatterns = this.patterns.get(intent);
    if (!intentPatterns) {
      return false;
    }

    const index = intentPatterns.findIndex(p => p.id === patternId);
    if (index === -1) {
      return false;
    }

    intentPatterns.splice(index, 1);
    logger.debug({ patternId, intent }, 'Pattern removed');
    return true;
  }

  /**
   * Match intent from text using pattern matching
   */
  matchIntent(text: string): IntentMatch[] {
    const startTime = Date.now();
    const matches: IntentMatch[] = [];
    const normalizedText = text.toLowerCase().trim();

    for (const [intent, intentPatterns] of this.patterns) {
      for (const pattern of intentPatterns) {
        if (!pattern.active) continue;

        const match = this.matchPattern(normalizedText, pattern, text);
        if (match) {
          matches.push({
            intent,
            confidence: match.confidence,
            confidenceLevel: this.getConfidenceLevel(match.confidence),
            entities: match.entities,
            pattern,
            matchedText: match.matchedText,
            processingTime: Date.now() - startTime
          });
        }
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    // Filter by minimum confidence
    const filteredMatches = matches.filter(m => m.confidence >= this.config.minConfidence);

    logger.debug({
      inputLength: text.length,
      totalMatches: matches.length,
      filteredMatches: filteredMatches.length,
      processingTime: Date.now() - startTime
    }, 'Intent matching completed');

    return filteredMatches;
  }

  /**
   * Match a single pattern against text
   */
  private matchPattern(text: string, pattern: IntentPattern, originalText: string): {
    confidence: number;
    entities: Record<string, any>;
    matchedText: string;
  } | null {
    let bestMatch: RegExpMatchArray | null = null;
    let bestConfidence = 0;

    // Try each regex pattern
    for (const patternStr of pattern.patterns) {
      try {
        const regex = new RegExp(patternStr, 'i');
        const match = text.match(regex);

        if (match) {
          // Calculate confidence based on match quality
          const confidence = this.calculatePatternConfidence(text, match, pattern);

          if (confidence > bestConfidence) {
            bestMatch = match;
            bestConfidence = confidence;
          }
        }
      } catch (error) {
        logger.warn({ pattern: patternStr, error }, 'Invalid regex pattern');
      }
    }

    if (!bestMatch || bestConfidence < this.config.minConfidence) {
      return null;
    }

    // Extract entities using original text to preserve case
    const entities = this.extractEntities(originalText, bestMatch, pattern);

    return {
      confidence: bestConfidence,
      entities,
      matchedText: bestMatch[0]
    };
  }

  /**
   * Calculate confidence score for a pattern match
   */
  private calculatePatternConfidence(text: string, match: RegExpMatchArray, pattern: IntentPattern): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence for exact keyword matches
    const keywordMatches = pattern.keywords.filter(keyword =>
      text.toLowerCase().includes(keyword.toLowerCase())
    );
    confidence += (keywordMatches.length / pattern.keywords.length) * 0.3;

    // Boost confidence for longer matches
    const matchRatio = match[0].length / text.length;
    confidence += Math.min(matchRatio * 0.2, 0.2);

    // Boost confidence for matches at the beginning of text
    if (match.index === 0) {
      confidence += 0.1;
    }

    // Ensure confidence is within bounds
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Extract entities from matched text
   */
  private extractEntities(originalText: string, match: RegExpMatchArray, pattern: IntentPattern): Record<string, any> {
    const entities: Record<string, any> = {};

    // Apply built-in entity extractors based on intent using original text to preserve case
    switch (pattern.intent) {
      case 'create_project':
      case 'open_project':
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        break;
      case 'create_task':
      case 'run_task':
        Object.assign(entities, EntityExtractors.taskInfo(originalText, match));
        break;
      case 'list_projects':
        Object.assign(entities, EntityExtractors.statusInfo(originalText, match));
        break;
      case 'list_tasks':
        Object.assign(entities, EntityExtractors.statusInfo(originalText, match));
        Object.assign(entities, EntityExtractors.agentInfo(originalText, match));
        break;
      case 'check_status':
        Object.assign(entities, EntityExtractors.statusInfo(originalText, match));
        Object.assign(entities, EntityExtractors.projectName(originalText, match));
        break;
      case 'assign_task':
        Object.assign(entities, EntityExtractors.agentInfo(originalText, match));
        Object.assign(entities, EntityExtractors.taskInfo(originalText, match));
        break;
    }

    // Always apply general extractors
    Object.assign(entities, EntityExtractors.general(originalText, match));

    return entities;
  }

  /**
   * Get confidence level from numeric confidence
   */
  private getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.9) return 'very_high';
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.5) return 'medium';
    if (confidence >= 0.3) return 'low';
    return 'very_low';
  }

  /**
   * Get total number of patterns across all intents
   */
  getTotalPatternCount(): number {
    let total = 0;
    for (const patterns of this.patterns.values()) {
      total += patterns.length;
    }
    return total;
  }

  /**
   * Get patterns for a specific intent
   */
  getPatternsForIntent(intent: Intent): IntentPattern[] {
    return this.patterns.get(intent) || [];
  }

  /**
   * Get all supported intents
   */
  getSupportedIntents(): Intent[] {
    return Array.from(this.patterns.keys());
  }

  /**
   * Update pattern engine configuration
   */
  updateConfig(config: Partial<PatternEngineConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Pattern engine configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): PatternEngineConfig {
    return { ...this.config };
  }

  /**
   * Clear all patterns
   */
  clearPatterns(): void {
    this.patterns.clear();
    logger.info('All patterns cleared');
  }

  /**
   * Export patterns to JSON
   */
  exportPatterns(): Record<string, IntentPattern[]> {
    const exported: Record<string, IntentPattern[]> = {};
    for (const [intent, patterns] of this.patterns) {
      exported[intent] = patterns;
    }
    return exported;
  }

  /**
   * Import patterns from JSON
   */
  importPatterns(patterns: Record<string, IntentPattern[]>): void {
    this.clearPatterns();
    for (const [intent, intentPatterns] of Object.entries(patterns)) {
      for (const pattern of intentPatterns) {
        this.addPattern(intent as Intent, pattern);
      }
    }
    logger.info({ intentCount: Object.keys(patterns).length }, 'Patterns imported');
  }
}
