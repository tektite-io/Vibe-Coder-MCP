/**
 * Service Registry for Vibe Task Manager
 * 
 * This module configures and registers all services with the DI container,
 * replacing the need for ImportCycleBreaker by properly managing dependencies.
 */

import { DIContainer, ServiceTokens, getContainer } from './di-container.js';
import logger from '../../../logger.js';

/**
 * Service registration configuration
 */
export class ServiceRegistry {
  private static initialized = false;
  private static container: DIContainer;

  /**
   * Initialize and configure all services
   */
  static async initialize(): Promise<DIContainer> {
    if (this.initialized) {
      return this.container;
    }

    this.container = getContainer();
    
    try {
      await this.registerCoreServices();
      await this.registerStorageServices();
      await this.registerBusinessServices();
      await this.registerUtilityServices();
      
      // Validate dependency graph
      this.container.validateDependencyGraph();
      
      this.initialized = true;
      logger.info('Service registry initialized successfully');
      
      return this.container;
    } catch (error) {
      logger.error('Failed to initialize service registry:', error);
      throw error;
    }
  }

  /**
   * Register core infrastructure services
   */
  private static async registerCoreServices(): Promise<void> {
    // Configuration services
    this.container.singleton(
      ServiceTokens.ConfigLoader,
      async () => {
        const { getVibeTaskManagerConfig } = await import('../utils/config-loader.js');
        return { getVibeTaskManagerConfig };
      }
    );

    // File utilities
    this.container.singleton(
      ServiceTokens.FileUtils,
      async () => {
        const { FileUtils } = await import('../utils/file-utils.js');
        return FileUtils;
      }
    );

    // ID generation
    this.container.singleton(
      ServiceTokens.IdGenerator,
      async (_container) => {
        const { IdGenerator } = await import('../utils/id-generator.js');
        return IdGenerator.getInstance();
      }
    );
  }

  /**
   * Register storage layer services
   */
  private static async registerStorageServices(): Promise<void> {
    // Unified Storage Engine (new consolidated storage)
    this.container.singleton(
      ServiceTokens.UnifiedStorageEngine,
      async (_container) => {
        const { UnifiedStorageEngine, createDefaultStorageConfig } = await import('./unified-storage-engine.js');
        const config = createDefaultStorageConfig();
        const engine = UnifiedStorageEngine.getInstance(config);
        await engine.initialize();
        return engine;
      }
    );

    // Storage manager (legacy - will be deprecated)
    this.container.singleton(
      ServiceTokens.StorageManager,
      async (_container) => {
        const { StorageManager } = await import('../core/storage/storage-manager.js');
        return StorageManager.getInstance();
      }
    );

    // Task file manager (legacy - will be deprecated)
    this.container.singleton(
      ServiceTokens.TaskFileManager,
      async (_container) => {
        const { TaskFileManager } = await import('../core/task-file-manager.js');
        return TaskFileManager.getInstance();
      }
    );
  }

  /**
   * Register business logic services
   */
  private static async registerBusinessServices(): Promise<void> {
    // Operations services (using getInstance pattern)
    this.container.singleton(
      ServiceTokens.TaskOperations,
      async () => {
        const { getTaskOperations } = await import('../core/operations/task-operations.js');
        return getTaskOperations();
      }
    );

    this.container.singleton(
      ServiceTokens.ProjectOperations,
      async () => {
        const { getProjectOperations } = await import('../core/operations/project-operations.js');
        return getProjectOperations();
      }
    );

    this.container.singleton(
      ServiceTokens.DependencyOperations,
      async () => {
        const { getDependencyOperations } = await import('../core/operations/dependency-operations.js');
        return getDependencyOperations();
      }
    );

    // RDD Engine - placeholder for now
    this.container.singleton(
      ServiceTokens.RDDEngine,
      async () => {
        // Return a mock implementation for now
        return {
          decomposeTask: async () => ({ tasks: [], dependencies: [] })
        };
      }
    );

    // Epic service
    this.container.singleton(
      ServiceTokens.EpicService,
      async () => {
        const { EpicService } = await import('../services/epic-service.js');
        return EpicService.getInstance();
      }
    );

    // Decomposition service
    this.container.singleton(
      ServiceTokens.DecompositionService,
      async () => {
        const { DecompositionService } = await import('../services/decomposition-service.js');
        return DecompositionService.getInstance();
      }
    );

    // Context enrichment service
    this.container.singleton(
      ServiceTokens.ContextEnrichmentService,
      async () => {
        const { ContextEnrichmentService } = await import('../services/context-enrichment-service.js');
        return ContextEnrichmentService.getInstance();
      }
    );

    // Agent orchestrator (without circular dependencies)
    this.container.singleton(
      ServiceTokens.AgentOrchestrator,
      async () => {
        const { AgentOrchestrator } = await import('../services/agent-orchestrator.js');
        return AgentOrchestrator.getInstance();
      }
    );

    // Unified lifecycle manager (replaces 4 lifecycle services)
    this.container.singleton(
      ServiceTokens.UnifiedLifecycleManager,
      async () => {
        const { UnifiedLifecycleManager } = await import('./unified-lifecycle-manager.js');
        return UnifiedLifecycleManager.getInstance();
      }
    );

    // Unified task execution engine (replaces 5 execution services)
    this.container.singleton(
      ServiceTokens.UnifiedTaskExecutionEngine,
      async () => {
        const { UnifiedTaskExecutionEngine, createDefaultConfig } = await import('./unified-task-execution-engine.js');
        return UnifiedTaskExecutionEngine.getInstance(createDefaultConfig());
      }
    );

    // Unified orchestration engine (replaces 8 agent/workflow services)
    this.container.singleton(
      ServiceTokens.UnifiedOrchestrationEngine,
      async () => {
        const { UnifiedOrchestrationEngine, createDefaultOrchestrationConfig } = await import('./unified-orchestration-engine.js');
        const config = createDefaultOrchestrationConfig();
        const engine = UnifiedOrchestrationEngine.getInstance(config);
        await engine.initialize();
        return engine;
      }
    );
  }

  /**
   * Register utility and security services
   */
  private static async registerUtilityServices(): Promise<void> {
    // Unified Security Engine (new consolidated security)
    this.container.singleton(
      ServiceTokens.UnifiedSecurityEngine,
      async () => {
        const { UnifiedSecurityEngine, createDefaultSecurityConfig } = await import('./unified-security-engine.js');
        const config = createDefaultSecurityConfig();
        const engine = UnifiedSecurityEngine.getInstance(config);
        await engine.initialize();
        return engine;
      }
    );

    // Legacy security services have been removed - now using UnifiedSecurityEngine

    // Dependency validator - placeholder
    this.container.singleton(
      ServiceTokens.DependencyValidator,
      async () => {
        return {
          validateDependency: async () => ({ isValid: true, errors: [] })
        };
      }
    );

    // Atomic detector - placeholder
    this.container.singleton(
      ServiceTokens.AtomicDetector,
      async () => {
        return {
          isAtomic: async () => true,
          analyze: async () => ({ isAtomic: true, reasons: [] })
        };
      }
    );
  }

  /**
   * Get a service instance
   */
  static async getService<T>(token: string): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.container.resolve<T>(token);
  }

  /**
   * Check if services are initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset the registry (useful for testing)
   */
  static reset(): void {
    if (this.container) {
      this.container.dispose();
    }
    this.initialized = false;
  }

  /**
   * Get dependency graph for debugging
   */
  static getDependencyGraph(): string {
    if (!this.container) {
      return 'Container not initialized';
    }
    return this.container.getDependencyGraph();
  }

  /**
   * Get registered services list
   */
  static getRegisteredServices(): string[] {
    if (!this.container) {
      return [];
    }
    return this.container.getRegisteredServices();
  }
}

/**
 * Convenience function to get a service instance
 */
export async function getService<T>(token: string): Promise<T> {
  return ServiceRegistry.getService<T>(token);
}

/**
 * Convenience function to initialize services
 */
export async function initializeServices(): Promise<DIContainer> {
  return ServiceRegistry.initialize();
}