/**
 * Dependency Injection Container for Vibe Task Manager
 * 
 * This container replaces the existing singleton pattern with a proper DI system
 * that eliminates circular dependencies and provides better testability.
 */

import logger from '../../../logger.js';
import { AppError } from '../../../utils/errors.js';

/**
 * Service lifecycle types
 */
export type ServiceLifecycle = 'singleton' | 'transient' | 'scoped';

/**
 * Service factory function type
 */
export type ServiceFactory<T = unknown> = (container: DIContainer) => T | Promise<T>;

/**
 * Service registration interface
 */
export interface ServiceRegistration<T = unknown> {
  factory: ServiceFactory<T>;
  lifecycle: ServiceLifecycle;
  instance?: T;
  dependencies?: string[];
}

/**
 * Service token type for type safety
 */
export type ServiceToken<T = unknown> = string & { readonly __serviceType?: T };

/**
 * Dependency injection container
 */
export class DIContainer {
  private services = new Map<string, ServiceRegistration>();
  private resolving = new Set<string>();
  private scopedInstances = new Map<string, unknown>();

  /**
   * Register a service with the container
   */
  register<T>(
    token: ServiceToken<T> | string,
    factory: ServiceFactory<T>,
    lifecycle: ServiceLifecycle = 'singleton',
    dependencies: string[] = []
  ): void {
    const tokenStr = typeof token === 'string' ? token : String(token);
    
    if (this.services.has(tokenStr)) {
      logger.warn(`Service ${tokenStr} is already registered. Overwriting.`);
    }

    this.services.set(tokenStr, {
      factory,
      lifecycle,
      dependencies
    });

    logger.debug(`Registered service: ${tokenStr} with lifecycle: ${lifecycle}`);
  }

  /**
   * Register a singleton service
   */
  singleton<T>(
    token: ServiceToken<T> | string,
    factory: ServiceFactory<T>,
    dependencies: string[] = []
  ): void {
    this.register(token, factory, 'singleton', dependencies);
  }

  /**
   * Register a transient service
   */
  transient<T>(
    token: ServiceToken<T> | string,
    factory: ServiceFactory<T>,
    dependencies: string[] = []
  ): void {
    this.register(token, factory, 'transient', dependencies);
  }

  /**
   * Register a scoped service
   */
  scoped<T>(
    token: ServiceToken<T> | string,
    factory: ServiceFactory<T>,
    dependencies: string[] = []
  ): void {
    this.register(token, factory, 'scoped', dependencies);
  }

  /**
   * Resolve a service from the container
   */
  async resolve<T>(token: ServiceToken<T> | string): Promise<T> {
    const tokenStr = typeof token === 'string' ? token : String(token);
    return this.resolveInternal(tokenStr);
  }

  /**
   * Resolve a service synchronously (for non-async factories)
   */
  resolveSync<T>(token: ServiceToken<T> | string): T {
    const tokenStr = typeof token === 'string' ? token : String(token);
    return this.resolveInternalSync(tokenStr);
  }

  /**
   * Internal sync resolution logic
   */
  private resolveInternalSync<T>(token: string): T {
    // Check for circular dependencies
    if (this.resolving.has(token)) {
      const cycle = Array.from(this.resolving).join(' -> ') + ' -> ' + token;
      throw new AppError(
        `Circular dependency detected: ${cycle}`,
        { cycle, token, errorCode: 'CIRCULAR_DEPENDENCY_ERROR' }
      );
    }

    const registration = this.services.get(token);
    if (!registration) {
      throw new AppError(
        `Service not registered: ${token}`,
        { token, errorCode: 'SERVICE_NOT_FOUND_ERROR' }
      );
    }

    // Handle different lifecycles
    switch (registration.lifecycle) {
      case 'singleton':
        if (registration.instance) {
          return registration.instance as T;
        }
        break;
      
      case 'scoped':
        if (this.scopedInstances.has(token)) {
          return this.scopedInstances.get(token) as T;
        }
        break;
      
      case 'transient':
        // Always create new instance
        break;
    }

    // Mark as resolving to detect circular dependencies
    this.resolving.add(token);

    try {
      // Create the instance synchronously
      const instance = registration.factory(this);
      
      if (instance instanceof Promise) {
        throw new AppError(
          `Service ${token} requires async resolution. Use resolve() instead.`,
          { token, errorCode: 'SYNC_RESOLUTION_ERROR' }
        );
      }

      // Store instance based on lifecycle
      switch (registration.lifecycle) {
        case 'singleton':
          registration.instance = instance;
          break;
        
        case 'scoped':
          this.scopedInstances.set(token, instance);
          break;
        
        case 'transient':
          // Don't store transient instances
          break;
      }

      logger.debug(`Resolved service synchronously: ${token}`);
      return instance as T;
    } finally {
      // Remove from resolving set
      this.resolving.delete(token);
    }
  }

  /**
   * Internal resolution logic
   */
  private async resolveInternal<T>(token: string): Promise<T> {
    // Check for circular dependencies
    if (this.resolving.has(token)) {
      const cycle = Array.from(this.resolving).join(' -> ') + ' -> ' + token;
      throw new AppError(
        `Circular dependency detected: ${cycle}`,
        { cycle, token, errorCode: 'CIRCULAR_DEPENDENCY_ERROR' }
      );
    }

    const registration = this.services.get(token);
    if (!registration) {
      throw new AppError(
        `Service not registered: ${token}`,
        { token, errorCode: 'SERVICE_NOT_FOUND_ERROR' }
      );
    }

    // Handle different lifecycles
    switch (registration.lifecycle) {
      case 'singleton':
        if (registration.instance) {
          return registration.instance as T;
        }
        break;
      
      case 'scoped':
        if (this.scopedInstances.has(token)) {
          return this.scopedInstances.get(token) as T;
        }
        break;
      
      case 'transient':
        // Always create new instance
        break;
    }

    // Mark as resolving to detect circular dependencies
    this.resolving.add(token);

    try {
      // Create the instance
      const instance = await registration.factory(this);

      // Store instance based on lifecycle
      switch (registration.lifecycle) {
        case 'singleton':
          registration.instance = instance;
          break;
        
        case 'scoped':
          this.scopedInstances.set(token, instance);
          break;
        
        case 'transient':
          // Don't store transient instances
          break;
      }

      logger.debug(`Resolved service: ${token}`);
      return instance as T;
    } finally {
      // Remove from resolving set
      this.resolving.delete(token);
    }
  }

  /**
   * Check if a service is registered
   */
  isRegistered(token: ServiceToken<unknown> | string): boolean {
    const tokenStr = typeof token === 'string' ? token : String(token);
    return this.services.has(tokenStr);
  }

  /**
   * Get all registered service tokens
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Clear scoped instances (useful for request/session boundaries)
   */
  clearScoped(): void {
    this.scopedInstances.clear();
    logger.debug('Cleared scoped service instances');
  }

  /**
   * Dispose of all singleton instances (useful for testing)
   */
  dispose(): void {
    // Call dispose method on services that have it
    for (const [token, registration] of this.services) {
      if (registration.instance && typeof (registration.instance as { dispose?: () => void }).dispose === 'function') {
        try {
          (registration.instance as { dispose: () => void }).dispose();
          logger.debug(`Disposed service: ${token}`);
        } catch (error) {
          logger.error(`Error disposing service ${token}:`, error);
        }
      }
    }

    // Clear all instances
    for (const registration of this.services.values()) {
      registration.instance = undefined;
    }
    this.scopedInstances.clear();
    
    logger.debug('Disposed all service instances');
  }

  /**
   * Validate dependency graph for circular dependencies
   */
  validateDependencyGraph(): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (token: string): void => {
      if (visiting.has(token)) {
        const cycle = Array.from(visiting).join(' -> ') + ' -> ' + token;
        throw new AppError(
          `Circular dependency detected in registration: ${cycle}`,
          { cycle, token, errorCode: 'CIRCULAR_DEPENDENCY_ERROR' }
        );
      }

      if (visited.has(token)) {
        return;
      }

      const registration = this.services.get(token);
      if (!registration) {
        return; // Skip unregistered dependencies
      }

      visiting.add(token);

      for (const dependency of registration.dependencies || []) {
        visit(dependency);
      }

      visiting.delete(token);
      visited.add(token);
    };

    for (const token of this.services.keys()) {
      visit(token);
    }

    logger.debug('Dependency graph validation passed');
  }

  /**
   * Get dependency graph as a string for debugging
   */
  getDependencyGraph(): string {
    const lines: string[] = [];
    
    for (const [token, registration] of this.services) {
      const deps = registration.dependencies || [];
      const lifecycle = registration.lifecycle;
      lines.push(`${token} (${lifecycle}): [${deps.join(', ')}]`);
    }

    return lines.join('\n');
  }
}

/**
 * Service token factory for type safety
 */
export function createServiceToken<T>(name: string): ServiceToken<T> {
  return name as ServiceToken<T>;
}

/**
 * Global container instance
 */
let globalContainer: DIContainer | null = null;

/**
 * Get the global container instance
 */
export function getContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = new DIContainer();
  }
  return globalContainer;
}

/**
 * Set the global container instance (useful for testing)
 */
export function setContainer(container: DIContainer): void {
  globalContainer = container;
}

/**
 * Reset the global container (useful for testing)
 */
export function resetContainer(): void {
  if (globalContainer) {
    globalContainer.dispose();
  }
  globalContainer = null;
}

/**
 * Service tokens for existing services
 */
export const ServiceTokens = {
  StorageManager: createServiceToken<unknown>('StorageManager'),
  ConfigLoader: createServiceToken<unknown>('ConfigLoader'),
  IdGenerator: createServiceToken<unknown>('IdGenerator'),
  TaskOperations: createServiceToken<unknown>('TaskOperations'),
  ProjectOperations: createServiceToken<unknown>('ProjectOperations'),
  DependencyOperations: createServiceToken<unknown>('DependencyOperations'),
  DecompositionService: createServiceToken<unknown>('DecompositionService'),
  EpicService: createServiceToken<unknown>('EpicService'),
  AgentOrchestrator: createServiceToken<unknown>('AgentOrchestrator'),
  RDDEngine: createServiceToken<unknown>('RDDEngine'),
  ContextEnrichmentService: createServiceToken<unknown>('ContextEnrichmentService'),
  DependencyValidator: createServiceToken<unknown>('DependencyValidator'),
  FileUtils: createServiceToken<unknown>('FileUtils'),
  TaskFileManager: createServiceToken<unknown>('TaskFileManager'),
  AtomicDetector: createServiceToken<unknown>('AtomicDetector'),
  UnifiedLifecycleManager: createServiceToken<unknown>('UnifiedLifecycleManager'),
  UnifiedTaskExecutionEngine: createServiceToken<unknown>('UnifiedTaskExecutionEngine'),
  UnifiedStorageEngine: createServiceToken<unknown>('UnifiedStorageEngine'),
  UnifiedSecurityEngine: createServiceToken<unknown>('UnifiedSecurityEngine'),
  UnifiedOrchestrationEngine: createServiceToken<unknown>('UnifiedOrchestrationEngine')
} as const;