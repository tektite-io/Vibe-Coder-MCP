/**
 * DI Container Tests
 * 
 * Validates the core dependency injection container functionality
 * that replaces the ImportCycleBreaker pattern.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  DIContainer, 
  createServiceToken, 
  getContainer, 
  setContainer, 
  resetContainer 
} from '../di-container.js';

describe('DIContainer', () => {
  let container: DIContainer;

  beforeEach(() => {
    // Create a completely fresh container for each test
    container = new DIContainer();
  });

  afterEach(() => {
    // Clean up the container
    if (container) {
      container.dispose();
    }
    
    // Reset global container to prevent test interference
    resetContainer();
  });

  describe('Service Registration', () => {
    it('should register a singleton service', () => {
      const token = createServiceToken<string>('TestService');
      const factory = () => 'test-instance';

      container.singleton(token, factory);
      expect(container.isRegistered(token)).toBe(true);
    });

    it('should register a transient service', () => {
      const token = createServiceToken<string>('TransientService');
      const factory = () => 'transient-instance';

      container.transient(token, factory);
      expect(container.isRegistered(token)).toBe(true);
    });

    it('should register a scoped service', () => {
      const token = createServiceToken<string>('ScopedService');
      const factory = () => 'scoped-instance';

      container.scoped(token, factory);
      expect(container.isRegistered(token)).toBe(true);
    });
  });

  describe('Service Resolution', () => {
    it('should resolve singleton service and return same instance', async () => {
      const token = createServiceToken<{ id: number }>('SingletonService');
      let counter = 0;
      const factory = () => ({ id: ++counter });

      container.singleton(token, factory);

      const instance1 = await container.resolve(token);
      const instance2 = await container.resolve(token);

      expect(instance1).toBe(instance2);
      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(1);
    });

    it('should resolve transient service and return new instances', async () => {
      // Create a completely isolated container for this test
      const localContainer = new DIContainer();
      const token = createServiceToken<{ id: number }>('TransientService');
      let counter = 0;
      const factory = () => ({ id: ++counter });

      // Register the service
      localContainer.transient(token, factory);

      const instance1 = await localContainer.resolve(token);
      const instance2 = await localContainer.resolve(token);

      expect(instance1).not.toBe(instance2);
      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
    });

    it('should resolve scoped service and return same instance within scope', async () => {
      const token = createServiceToken<{ id: number }>('ScopedService');
      let counter = 0;
      const factory = () => ({ id: ++counter });

      container.scoped(token, factory);

      const instance1 = await container.resolve(token);
      const instance2 = await container.resolve(token);

      expect(instance1).toBe(instance2);
      expect(instance1.id).toBe(1);

      // Clear scope and resolve again
      container.clearScoped();
      const instance3 = await container.resolve(token);

      expect(instance3).not.toBe(instance1);
      expect(instance3.id).toBe(2);
    });

    it('should resolve synchronously for non-async factories', () => {
      const token = createServiceToken<string>('SyncService');
      const factory = () => 'sync-result';

      container.singleton(token, factory);

      const instance = container.resolveSync(token);
      expect(instance).toBe('sync-result');
    });

    it('should throw error for sync resolution of async factory', async () => {
      const token = createServiceToken<string>('AsyncService');
      const factory = async () => 'async-result';

      container.singleton(token, factory);

      expect(() => container.resolveSync(token)).toThrow('requires async resolution');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unregistered service', async () => {
      const token = createServiceToken<string>('UnregisteredService');

      await expect(container.resolve(token)).rejects.toThrow('Service not registered');
    });

    it('should detect circular dependencies', async () => {
      const tokenA = createServiceToken<unknown>('ServiceA');
      const tokenB = createServiceToken<unknown>('ServiceB');

      container.singleton(tokenA, async (c) => c.resolve(tokenB));
      container.singleton(tokenB, async (c) => c.resolve(tokenA));

      await expect(container.resolve(tokenA)).rejects.toThrow('Circular dependency detected');
    });
  });

  describe('Dependency Graph Validation', () => {
    it('should validate dependency graph without circular dependencies', () => {
      const tokenA = createServiceToken<string>('ServiceA');
      const tokenB = createServiceToken<string>('ServiceB');

      container.register(tokenA, () => 'A', 'singleton', []);
      container.register(tokenB, () => 'B', 'singleton', [String(tokenA)]);

      expect(() => container.validateDependencyGraph()).not.toThrow();
    });

    it('should detect circular dependencies in registration', () => {
      const tokenA = createServiceToken<string>('ServiceA');
      const tokenB = createServiceToken<string>('ServiceB');

      container.register(tokenA, () => 'A', 'singleton', [String(tokenB)]);
      container.register(tokenB, () => 'B', 'singleton', [String(tokenA)]);

      expect(() => container.validateDependencyGraph()).toThrow('Circular dependency detected');
    });
  });

  describe('Service Lifecycle', () => {
    it('should dispose services with dispose method', () => {
      const token = createServiceToken<{ disposed: boolean; dispose: () => void }>('DisposableService');
      const factory = () => {
        const service = { disposed: false, dispose: () => { service.disposed = true; } };
        return service;
      };

      container.singleton(token, factory);
      const instance = container.resolveSync(token);

      expect(instance.disposed).toBe(false);

      container.dispose();

      expect(instance.disposed).toBe(true);
    });

    it('should clear all instances on dispose', async () => {
      // Create a completely isolated container for this test
      const localContainer = new DIContainer();
      const token = createServiceToken<{ id: number }>('TestService');
      let counter = 0;
      const factory = () => ({ id: ++counter });

      localContainer.singleton(token, factory);

      const instance1 = await localContainer.resolve(token);
      expect(instance1.id).toBe(1);

      localContainer.dispose();

      // After dispose, the registration still exists but instance is cleared
      // So resolving again should create a new instance
      const instance2 = await localContainer.resolve(token);
      expect(instance2.id).toBe(2); // New instance created
    });
  });

  describe('Global Container', () => {
    it('should provide global container instance', () => {
      const globalContainer = getContainer();
      expect(globalContainer).toBeInstanceOf(DIContainer);
    });

    it('should allow setting custom container', () => {
      const customContainer = new DIContainer();
      setContainer(customContainer);

      const retrievedContainer = getContainer();
      expect(retrievedContainer).toBe(customContainer);
    });

    it('should reset global container', () => {
      const originalContainer = getContainer();
      const customContainer = new DIContainer();
      setContainer(customContainer);

      resetContainer();

      const newContainer = getContainer();
      expect(newContainer).not.toBe(customContainer);
      expect(newContainer).not.toBe(originalContainer);
    });
  });

  describe('Service Tokens', () => {
    it('should create typed service tokens', () => {
      const stringToken = createServiceToken<string>('StringService');
      const numberToken = createServiceToken<number>('NumberService');

      expect(typeof stringToken).toBe('string');
      expect(typeof numberToken).toBe('string');
      expect(stringToken).toBe('StringService');
      expect(numberToken).toBe('NumberService');
    });

    it('should work with string tokens', async () => {
      const token = 'StringTokenService';
      const factory = () => 'string-token-result';

      container.singleton(token, factory);

      const instance = await container.resolve(token);
      expect(instance).toBe('string-token-result');
    });
  });

  describe('Utility Methods', () => {
    it('should return registered service tokens', () => {
      const token1 = createServiceToken<string>('Service1');
      const token2 = createServiceToken<string>('Service2');

      container.singleton(token1, () => 'service1');
      container.singleton(token2, () => 'service2');

      const registeredServices = container.getRegisteredServices();
      expect(registeredServices).toContain(String(token1));
      expect(registeredServices).toContain(String(token2));
    });

    it('should generate dependency graph string', () => {
      const tokenA = createServiceToken<string>('ServiceA');
      const tokenB = createServiceToken<string>('ServiceB');

      container.register(tokenA, () => 'A', 'singleton', []);
      container.register(tokenB, () => 'B', 'singleton', [String(tokenA)]);

      const graph = container.getDependencyGraph();
      expect(graph).toContain('ServiceA (singleton): []');
      expect(graph).toContain('ServiceB (singleton): [ServiceA]');
    });
  });
});