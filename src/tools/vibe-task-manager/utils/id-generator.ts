import { getStorageManager } from '../core/storage/storage-manager.js';
import logger from '../../../logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { getVibeTaskManagerOutputDir } from './config-loader.js';

/**
 * ID generation configuration
 */
export interface IdGeneratorConfig {
  projectPrefix: string;
  epicPrefix: string;
  taskPrefix: string;
  projectIdLength: number;
  epicIdLength: number;
  taskIdLength: number;
  maxRetries: number;
}

/**
 * Default ID generation configuration
 */
const DEFAULT_CONFIG: IdGeneratorConfig = {
  projectPrefix: 'PID',
  epicPrefix: 'E',
  taskPrefix: 'T',
  projectIdLength: 3,
  epicIdLength: 3,
  taskIdLength: 4,
  maxRetries: 100
};

/**
 * ID generation result
 */
export interface IdGenerationResult {
  success: boolean;
  id?: string;
  error?: string;
  attempts?: number;
}

/**
 * Hierarchical ID generation system
 * Generates unique IDs in the format:
 * - Projects: PID-NAME-001
 * - Epics: E001 (within project context)
 * - Tasks: T0001 (within epic context)
 */
export class IdGenerator {
  private static instance: IdGenerator;
  private config: IdGeneratorConfig;
  private counterFilePath: string;
  private counterLock: Promise<void> = Promise.resolve();

  private constructor(config?: Partial<IdGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.counterFilePath = path.join(getVibeTaskManagerOutputDir(), 'id-counters.json');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<IdGeneratorConfig>): IdGenerator {
    if (!IdGenerator.instance) {
      IdGenerator.instance = new IdGenerator(config);
    }
    return IdGenerator.instance;
  }

  /**
   * Generate unique project ID
   * Format: PID-PROJECTNAME-001
   */
  async generateProjectId(projectName: string): Promise<IdGenerationResult> {
    try {
      logger.debug({ projectName }, 'Generating project ID');

      // Validate project name
      const nameValidation = this.validateProjectName(projectName);
      if (!nameValidation.valid) {
        return {
          success: false,
          error: `Invalid project name: ${nameValidation.errors.join(', ')}`
        };
      }

      // Create base ID from project name
      const baseId = this.createProjectBaseId(projectName);
      const storageManager = await getStorageManager();

      // Find unique ID with counter
      for (let counter = 1; counter <= this.config.maxRetries; counter++) {
        const projectId = `${baseId}-${counter.toString().padStart(this.config.projectIdLength, '0')}`;

        const exists = await storageManager.projectExists(projectId);
        if (!exists) {
          logger.debug({ projectId, attempts: counter }, 'Generated unique project ID');
          return {
            success: true,
            id: projectId,
            attempts: counter
          };
        }
      }

      return {
        success: false,
        error: `Failed to generate unique project ID after ${this.config.maxRetries} attempts`,
        attempts: this.config.maxRetries
      };

    } catch (error) {
      logger.error({ err: error, projectName }, 'Failed to generate project ID');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate unique epic ID within project context with file-based counter
   * Format: E001
   */
  async generateEpicId(projectId: string): Promise<IdGenerationResult> {
    // Serialize access to prevent race conditions
    return new Promise((resolve) => {
      this.counterLock = this.counterLock.then(async () => {
        try {
          logger.debug({ projectId }, 'Generating epic ID with counter lock');

          // Validate project exists
          const storageManager = await getStorageManager();
          const projectExists = await storageManager.projectExists(projectId);
          if (!projectExists) {
            resolve({
              success: false,
              error: `Project ${projectId} not found`
            });
            return;
          }

          // Load current counters
          const counters = await this.loadCounters();
          const currentEpicCounter = counters.epics || 0;

          // Find unique epic ID starting from the last counter
          for (let counter = currentEpicCounter + 1; counter <= currentEpicCounter + this.config.maxRetries; counter++) {
            const epicId = `${this.config.epicPrefix}${counter.toString().padStart(this.config.epicIdLength, '0')}`;

            const exists = await storageManager.epicExists(epicId);
            if (!exists) {
              // Update and save the counter
              counters.epics = counter;
              await this.saveCounters(counters);
              
              logger.debug({ epicId, projectId, attempts: counter - currentEpicCounter }, 'Generated unique epic ID');
              resolve({
                success: true,
                id: epicId,
                attempts: counter - currentEpicCounter
              });
              return;
            }
          }

          resolve({
            success: false,
            error: `Failed to generate unique epic ID after ${this.config.maxRetries} attempts`,
            attempts: this.config.maxRetries
          });

        } catch (error) {
          logger.error({ err: error, projectId }, 'Failed to generate epic ID');
          resolve({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    });
  }

  /**
   * Load counters from file
   */
  private async loadCounters(): Promise<Record<string, number>> {
    try {
      const data = await fs.readFile(this.counterFilePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      // File doesn't exist or is invalid, return empty counters
      return {};
    }
  }

  /**
   * Save counters to file atomically
   */
  private async saveCounters(counters: Record<string, number>): Promise<void> {
    const tempPath = `${this.counterFilePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(counters, null, 2), 'utf-8');
    await fs.rename(tempPath, this.counterFilePath);
  }

  /**
   * Generate unique task ID globally with file-based counter
   * Format: T0001
   * Note: Task IDs are globally unique across all projects to prevent conflicts
   */
  async generateTaskId(): Promise<IdGenerationResult> {
    // Serialize access to prevent race conditions
    return new Promise((resolve) => {
      this.counterLock = this.counterLock.then(async () => {
        try {
          logger.debug('Generating globally unique task ID with counter lock');
          
          // Load current counters
          const counters = await this.loadCounters();
          const currentTaskCounter = counters.tasks || 0;
          
          // Try to find an available ID starting from the last counter
          const storageManager = await getStorageManager();
          
          for (let counter = currentTaskCounter + 1; counter <= currentTaskCounter + this.config.maxRetries; counter++) {
            const taskId = `${this.config.taskPrefix}${counter.toString().padStart(this.config.taskIdLength, '0')}`;
            
            const exists = await storageManager.taskExists(taskId);
            if (!exists) {
              // Update and save the counter
              counters.tasks = counter;
              await this.saveCounters(counters);
              
              logger.debug({ taskId, attempts: counter - currentTaskCounter }, 'Generated globally unique task ID');
              resolve({
                success: true,
                id: taskId,
                attempts: counter - currentTaskCounter
              });
              return;
            }
          }
          
          resolve({
            success: false,
            error: `Failed to generate unique task ID after ${this.config.maxRetries} attempts`,
            attempts: this.config.maxRetries
          });
          
        } catch (error) {
          logger.error({ err: error }, 'Failed to generate task ID');
          resolve({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    });
  }

  /**
   * Generate dependency ID
   * Format: DEP-{fromTaskId}-{toTaskId}-001
   */
  async generateDependencyId(fromTaskId: string, toTaskId: string): Promise<IdGenerationResult> {
    try {
      logger.debug({ fromTaskId, toTaskId }, 'Generating dependency ID');

      // Validate task IDs
      if (!this.isValidTaskId(fromTaskId)) {
        return {
          success: false,
          error: `Invalid from task ID format: ${fromTaskId}`
        };
      }

      if (!this.isValidTaskId(toTaskId)) {
        return {
          success: false,
          error: `Invalid to task ID format: ${toTaskId}`
        };
      }

      const baseId = `DEP-${fromTaskId}-${toTaskId}`;
      const storageManager = await getStorageManager();

      // Find unique dependency ID
      for (let counter = 1; counter <= this.config.maxRetries; counter++) {
        const dependencyId = `${baseId}-${counter.toString().padStart(3, '0')}`;

        const exists = await storageManager.dependencyExists(dependencyId);
        if (!exists) {
          logger.debug({ dependencyId, fromTaskId, toTaskId, attempts: counter }, 'Generated unique dependency ID');
          return {
            success: true,
            id: dependencyId,
            attempts: counter
          };
        }
      }

      return {
        success: false,
        error: `Failed to generate unique dependency ID after ${this.config.maxRetries} attempts`,
        attempts: this.config.maxRetries
      };

    } catch (error) {
      logger.error({ err: error, fromTaskId, toTaskId }, 'Failed to generate dependency ID');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate ID format
   */
  validateId(id: string, type: 'project' | 'epic' | 'task' | 'dependency'): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!id || typeof id !== 'string') {
      errors.push('ID must be a non-empty string');
      return { valid: false, errors };
    }

    switch (type) {
      case 'project':
        if (!this.isValidProjectId(id)) {
          errors.push('Invalid project ID format');
        }
        break;

      case 'epic':
        if (!this.isValidEpicId(id)) {
          errors.push('Invalid epic ID format');
        }
        break;

      case 'task':
        if (!this.isValidTaskId(id)) {
          errors.push('Invalid task ID format');
        }
        break;

      case 'dependency':
        if (!this.isValidDependencyId(id)) {
          errors.push('Invalid dependency ID format');
        }
        break;

      default:
        errors.push(`Unknown ID type: ${type}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Parse hierarchical ID to extract components
   */
  parseId(id: string): { type: string; components: Record<string, string> } | null {
    // Project ID: PID-NAME-001
    const projectMatch = id.match(/^(PID)-([A-Z0-9-]+)-(\d{3})$/);
    if (projectMatch) {
      return {
        type: 'project',
        components: {
          prefix: projectMatch[1],
          name: projectMatch[2],
          counter: projectMatch[3]
        }
      };
    }

    // Epic ID: E001
    const epicMatch = id.match(/^(E)(\d{3})$/);
    if (epicMatch) {
      return {
        type: 'epic',
        components: {
          prefix: epicMatch[1],
          counter: epicMatch[2]
        }
      };
    }

    // Task ID: T0001
    const taskMatch = id.match(/^(T)(\d{4})$/);
    if (taskMatch) {
      return {
        type: 'task',
        components: {
          prefix: taskMatch[1],
          counter: taskMatch[2]
        }
      };
    }

    // Dependency ID: DEP-T0001-T0002-001
    const depMatch = id.match(/^(DEP)-(T\d{4})-(T\d{4})-(\d{3})$/);
    if (depMatch) {
      return {
        type: 'dependency',
        components: {
          prefix: depMatch[1],
          fromTask: depMatch[2],
          toTask: depMatch[3],
          counter: depMatch[4]
        }
      };
    }

    return null;
  }

  /**
   * Create project base ID from name
   */
  private createProjectBaseId(projectName: string): string {
    return `${this.config.projectPrefix}-${projectName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 20)}`;
  }

  /**
   * Suggest a shorter project name by extracting key terms
   */
  private suggestShorterName(projectName: string): string {
    // Remove common words and extract key terms
    const commonWords = ['a', 'an', 'the', 'for', 'with', 'using', 'that', 'this', 'based', 'web', 'app', 'application', 'system', 'platform'];
    const words = projectName
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word))
      .map(word => word.charAt(0).toUpperCase() + word.slice(1));
    
    // Take first 3-4 key words to create a shorter name
    const suggested = words.slice(0, Math.min(4, words.length)).join(' ');
    
    // If still too long, take first 2 words or abbreviate
    if (suggested.length > 35) {
      const abbreviated = words.slice(0, 2).join(' ');
      return abbreviated.length <= 35 ? abbreviated : words[0];
    }
    
    return suggested || projectName.substring(0, 30).trim();
  }

  /**
   * Validate project name
   */
  private validateProjectName(projectName: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!projectName || typeof projectName !== 'string') {
      errors.push('Project name must be a non-empty string');
    } else {
      if (projectName.length < 2) {
        errors.push('Project name must be at least 2 characters long');
      }
      if (projectName.length > 50) {
        errors.push(
          `Project name is too long (${projectName.length} characters). ` +
          `Please use 50 characters or less for optimal file system compatibility. ` +
          `Suggestion: Use a shorter, descriptive name like "${this.suggestShorterName(projectName)}" ` +
          `instead of "${projectName}".`
        );
      }
      if (!/^[a-zA-Z0-9\s\-_]+$/.test(projectName)) {
        errors.push('Project name can only contain letters, numbers, spaces, hyphens, and underscores');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate project ID format
   */
  private isValidProjectId(id: string): boolean {
    return /^PID-[A-Z0-9-]+-\d{3}$/.test(id);
  }

  /**
   * Validate epic ID format
   */
  private isValidEpicId(id: string): boolean {
    return new RegExp(`^${this.config.epicPrefix}\\d{${this.config.epicIdLength}}$`).test(id);
  }

  /**
   * Validate task ID format
   */
  private isValidTaskId(id: string): boolean {
    return new RegExp(`^${this.config.taskPrefix}\\d{${this.config.taskIdLength}}$`).test(id);
  }

  /**
   * Validate dependency ID format
   */
  private isValidDependencyId(id: string): boolean {
    return /^DEP-T\d{4}-T\d{4}-\d{3}$/.test(id);
  }
}

/**
 * Convenience function to get ID generator instance
 */
export function getIdGenerator(config?: Partial<IdGeneratorConfig>): IdGenerator {
  return IdGenerator.getInstance(config);
}
