/**
 * Tests for Universal Optimization functionality in Enhanced Code Map Generator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UniversalClassOptimizer } from '../optimization/universalClassOptimizer.js';
import { UniversalDiagramOptimizer } from '../optimization/universalDiagramOptimizer.js';
import { AdaptiveOptimizationEngine } from '../optimization/adaptiveOptimizer.js';
import { EnhancementConfigManager } from '../config/enhancementConfig.js';
import { ClassInfo, FunctionInfo, ClassPropertyInfo, CodeMap } from '../codeMapModel.js';
import { GraphNode, GraphEdge } from '../graphBuilder.js';

describe('Universal Class Optimizer', () => {
  let optimizer: UniversalClassOptimizer;
  let mockClass: ClassInfo;

  beforeEach(() => {
    optimizer = new UniversalClassOptimizer();

    // Create a mock class with various members
    mockClass = {
      name: 'TestClass',
      comment: 'This is a test class that provides functionality for testing the optimization system',
      isExported: true,
      isAbstract: false,
      extends: 'BaseClass',
      implements: ['ITestable', 'IOptimizable'],
      methods: [
        {
          name: 'constructor',
          comment: 'Constructor for the test class',
          parameters: [{ name: 'config', type: 'Config' }],
          returnType: 'void',
          isConstructor: true,
          isExported: false,
          accessModifier: 'public'
        } as FunctionInfo,
        {
          name: 'publicMethod',
          comment: 'A public method',
          parameters: [],
          returnType: 'string',
          isConstructor: false,
          isExported: false,
          accessModifier: 'public'
        } as FunctionInfo,
        {
          name: '_privateMethod',
          comment: 'A private method',
          parameters: [],
          returnType: 'void',
          isConstructor: false,
          isExported: false,
          accessModifier: 'private'
        } as FunctionInfo,
        {
          name: 'getName',
          comment: 'Getter for name',
          parameters: [],
          returnType: 'string',
          isConstructor: false,
          isExported: false,
          accessModifier: 'public'
        } as FunctionInfo,
        {
          name: 'setName',
          comment: 'Setter for name',
          parameters: [{ name: 'value', type: 'string' }],
          returnType: 'void',
          isConstructor: false,
          isExported: false,
          accessModifier: 'public'
        } as FunctionInfo
      ],
      properties: [
        {
          name: 'publicProperty',
          type: 'string',
          accessModifier: 'public',
          isStatic: false
        } as ClassPropertyInfo,
        {
          name: '_privateProperty',
          type: 'number',
          accessModifier: 'private',
          isStatic: false
        } as ClassPropertyInfo
      ]
    };
  });

  describe('isPublicMember', () => {
    it('should identify public members correctly', () => {
      const publicMember = { name: 'publicMethod', accessModifier: 'public' };
      const privateMember = { name: '_privateMethod' };

      expect(optimizer.isPublicMember(publicMember)).toBe(true);
      expect(optimizer.isPublicMember(privateMember)).toBe(false);
    });

    it('should use naming conventions for access detection', () => {
      const underscorePrivate = { name: '_privateMethod' };
      const hashPrivate = { name: '#privateField' };
      const publicMethod = { name: 'publicMethod' };

      expect(optimizer.isPublicMember(underscorePrivate)).toBe(false);
      expect(optimizer.isPublicMember(hashPrivate)).toBe(false);
      expect(optimizer.isPublicMember(publicMethod)).toBe(true);
    });
  });

  describe('isGetterSetter', () => {
    it('should identify getter/setter methods', () => {
      const getter = { name: 'getName' };
      const setter = { name: 'setName' };
      const isMethod = { name: 'isValid' };
      const hasMethod = { name: 'hasProperty' };
      const regularMethod = { name: 'calculate' };

      expect(optimizer.isGetterSetter(getter)).toBe(true);
      expect(optimizer.isGetterSetter(setter)).toBe(true);
      expect(optimizer.isGetterSetter(isMethod)).toBe(true);
      expect(optimizer.isGetterSetter(hasMethod)).toBe(true);
      expect(optimizer.isGetterSetter(regularMethod)).toBe(false);
    });
  });

  describe('optimizeClassInfo', () => {
    it('should generate optimized class information', () => {
      const config = {
        eliminateVerboseDiagrams: true,
        reduceClassDetails: true,
        focusOnPublicInterfaces: true,
        consolidateRepetitiveContent: true,
        adaptiveOptimization: true
      };

      const result = optimizer.optimizeClassInfo(mockClass, config);

      expect(result).toContain('TestClass');
      expect(result).toContain('ext:BaseClass');
      expect(result).toContain('impl:ITestable,IOptimizable');
      expect(result).toContain('Purpose');
      expect(result.length).toBeLessThan(500); // Should be compressed
    });

    it('should compress descriptions to maximum length', () => {
      const config = {
        eliminateVerboseDiagrams: true,
        reduceClassDetails: true,
        focusOnPublicInterfaces: true,
        consolidateRepetitiveContent: true,
        adaptiveOptimization: true
      };

      const result = optimizer.optimizeClassInfo(mockClass, config);

      // Check that description is compressed (should be much shorter than original)
      const purposeMatch = result.match(/Purpose: (.+)/);
      if (purposeMatch) {
        expect(purposeMatch[1].length).toBeLessThanOrEqual(60); // Maximum aggressive compression
      }
    });
  });
});

describe('Universal Diagram Optimizer', () => {
  let optimizer: UniversalDiagramOptimizer;
  let mockNodes: GraphNode[];
  let mockEdges: GraphEdge[];

  beforeEach(() => {
    optimizer = new UniversalDiagramOptimizer();

    mockNodes = [
      { id: 'src/services/userService.ts', label: 'UserService' },
      { id: 'src/models/user.ts', label: 'User' },
      { id: 'src/controllers/userController.ts', label: 'UserController' },
      { id: 'node_modules/express/index.js', label: 'Express' },
      { id: 'src/utils/validator.ts', label: 'Validator' }
    ];

    mockEdges = [
      { from: 'src/controllers/userController.ts', to: 'src/services/userService.ts', label: 'imports' },
      { from: 'src/services/userService.ts', to: 'src/models/user.ts', label: 'imports' },
      { from: 'src/controllers/userController.ts', to: 'node_modules/express/index.js', label: 'imports' }
    ];
  });

  describe('optimizeDependencyDiagram', () => {
    it('should generate architecture summary for complex diagrams', () => {
      const config = {
        eliminateVerboseDiagrams: true,
        reduceClassDetails: true,
        focusOnPublicInterfaces: true,
        consolidateRepetitiveContent: true,
        adaptiveOptimization: true
      };

      const result = optimizer.optimizeDependencyDiagram(mockNodes, mockEdges, config);

      expect(result).toContain('Architecture Overview');
      expect(result).toContain('Core Components');
      expect(result).toContain('External Dependencies');
      expect(result).toContain('Architecture Pattern');
      expect(result.length).toBeLessThan(1000); // Should be much more compact than mermaid
    });

    it('should detect architectural patterns', () => {
      const pattern = optimizer.detectArchitecturePattern(mockNodes, mockEdges);

      expect(pattern).toBeDefined();
      expect(typeof pattern).toBe('string');
      // Should detect architectural pattern from the mock data
      expect(pattern.length).toBeGreaterThan(0);
    });
  });
});

describe('Enhancement Configuration Manager', () => {
  let manager: EnhancementConfigManager;

  beforeEach(() => {
    manager = EnhancementConfigManager.getInstance();
    manager.resetToDefaults(); // Reset to maximum aggressive defaults
  });

  describe('default configuration', () => {
    it('should enable maximum aggressive optimization by default', () => {
      const config = manager.getConfig();

      expect(config.enableOptimizations).toBe(true);
      expect(config.maxOptimizationLevel).toBe('maximum');
      expect(config.universalOptimization.eliminateVerboseDiagrams).toBe(true);
      expect(config.universalOptimization.reduceClassDetails).toBe(true);
      expect(config.universalOptimization.focusOnPublicInterfaces).toBe(true);
      expect(config.contentDensity.maxContentLength).toBe(60); // Maximum compression
    });

    it('should have quality thresholds adjusted for aggressive optimization', () => {
      const config = manager.getConfig();

      expect(config.qualityThresholds.minSemanticCompleteness).toBe(90); // Reduced for aggressive compression
      expect(config.qualityThresholds.minArchitecturalIntegrity).toBe(95);
      expect(config.qualityThresholds.maxInformationLoss).toBe(15); // Increased for aggressive compression
    });
  });

  describe('optimization level presets', () => {
    it('should apply conservative preset correctly', () => {
      manager.setOptimizationLevel('conservative');
      const config = manager.getConfig();

      expect(config.maxOptimizationLevel).toBe('conservative');
      expect(config.qualityThresholds.minSemanticCompleteness).toBe(98);
      expect(config.universalOptimization.eliminateVerboseDiagrams).toBe(false);
    });

    it('should apply maximum preset correctly', () => {
      manager.setOptimizationLevel('maximum');
      const config = manager.getConfig();

      expect(config.maxOptimizationLevel).toBe('maximum');
      expect(config.qualityThresholds.minSemanticCompleteness).toBe(90);
      expect(config.universalOptimization.eliminateVerboseDiagrams).toBe(true);
      expect(config.contentDensity.maxContentLength).toBe(60);
    });
  });

  describe('enableAggressiveOptimizations', () => {
    it('should enable all optimization features', () => {
      manager.disableOptimizations();
      manager.enableAggressiveOptimizations();

      const config = manager.getConfig();

      expect(config.enableOptimizations).toBe(true);
      expect(config.maxOptimizationLevel).toBe('maximum');
      expect(config.pathCompression.enabled).toBe(true);
      expect(config.functionCompression.enabled).toBe(true);
      expect(config.semanticCompression.enabled).toBe(true);
      expect(config.contentDensity.enabled).toBe(true);
      expect(config.contentDensity.maxContentLength).toBe(60);
    });
  });
});

describe('Adaptive Optimization Engine', () => {
  let engine: AdaptiveOptimizationEngine;
  let mockCodeMap: CodeMap;

  beforeEach(() => {
    engine = new AdaptiveOptimizationEngine();

    // Create a mock class for this test
    const testMockClass: ClassInfo = {
      name: 'TestClass',
      comment: 'This is a test class that provides functionality for testing the optimization system',
      isExported: true,
      isAbstract: false,
      extends: 'BaseClass',
      implements: ['ITestable', 'IOptimizable'],
      methods: [
        {
          name: 'constructor',
          comment: 'Constructor for the test class',
          parameters: [{ name: 'config', type: 'Config' }],
          returnType: 'void',
          isConstructor: true,
          isExported: false,
          accessModifier: 'public'
        } as FunctionInfo
      ],
      properties: [
        {
          name: 'publicProperty',
          type: 'string',
          accessModifier: 'public',
          isStatic: false
        } as ClassPropertyInfo
      ]
    };

    mockCodeMap = {
      files: [
        {
          relativePath: 'src/services/userService.ts',
          classes: [testMockClass],
          functions: [],
          imports: [
            { path: '../models/user', isExternal: false },
            { path: 'express', isExternal: true }
          ]
        }
      ]
    } as CodeMap;
  });

  describe('optimizeBasedOnCodebase', () => {
    it('should analyze codebase and apply appropriate optimization', () => {
      const config = {
        eliminateVerboseDiagrams: true,
        reduceClassDetails: true,
        focusOnPublicInterfaces: true,
        consolidateRepetitiveContent: true,
        adaptiveOptimization: true
      };

      const result = engine.optimizeBasedOnCodebase(mockCodeMap, config);

      expect(result.optimizedContent).toBeDefined();
      expect(result.reductionAchieved).toBeGreaterThan(0);
      expect(result.reductionAchieved).toBeLessThanOrEqual(97); // Capped at 97%
      expect(result.strategy).toBeDefined();
      expect(result.qualityMetrics).toBeDefined();
    });

    it('should provide quality metrics', () => {
      const config = {
        eliminateVerboseDiagrams: true,
        reduceClassDetails: true,
        focusOnPublicInterfaces: true,
        consolidateRepetitiveContent: true,
        adaptiveOptimization: true
      };

      const result = engine.optimizeBasedOnCodebase(mockCodeMap, config);

      expect(result.qualityMetrics.semanticCompleteness).toBeGreaterThanOrEqual(90);
      expect(result.qualityMetrics.architecturalIntegrity).toBeGreaterThanOrEqual(95);
      expect(result.qualityMetrics.informationLoss).toBeLessThanOrEqual(15);
      expect(result.qualityMetrics.publicInterfacePreservation).toBeGreaterThanOrEqual(98);
    });
  });
});
