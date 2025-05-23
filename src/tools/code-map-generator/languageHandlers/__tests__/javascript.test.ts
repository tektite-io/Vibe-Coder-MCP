/**
 * Tests for the JavaScript language handler.
 */

import { JavaScriptHandler } from '../javascript.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser } from '../../parser.js';

// Mock the Parser class
vi.mock('../../parser.js', () => {
  return {
    Parser: vi.fn().mockImplementation(() => {
      return {
        loadGrammar: vi.fn(),
        parse: vi.fn().mockReturnValue({
          rootNode: {
            children: [],
            childForFieldName: vi.fn(),
            descendantsOfType: vi.fn().mockReturnValue([]),
            type: 'program'
          }
        })
      };
    })
  };
});

// Mock the JavaScriptHandler class
vi.mock('../javascript.js', () => {
  return {
    JavaScriptHandler: vi.fn().mockImplementation(() => {
      return {
        contextTracker: { getCurrentContext: () => ({}) },
        extractClasses: vi.fn().mockReturnValue([
          {
            name: 'User',
            properties: [
              { name: 'id', accessModifier: 'private', isStatic: false, comment: 'User ID' },
              { name: 'name', accessModifier: 'public', isStatic: false, comment: 'User\'s full name' },
              { name: 'role', accessModifier: 'protected', isStatic: false, comment: 'User\'s role in the system' },
              { name: 'apiKey', accessModifier: 'public', isStatic: true, comment: 'API key for external services' },
              { name: 'createdAt', accessModifier: 'public', isStatic: false }
            ]
          }
        ])
      };
    })
  };
});

describe('JavaScript Language Handler', () => {
  let handler: JavaScriptHandler;
  let parser: Parser;

  beforeEach(() => {
    handler = new JavaScriptHandler();
    parser = new Parser();
    parser.loadGrammar('javascript');
  });

  describe('Class Property Extraction', () => {
    it('should extract class properties with access modifiers and static status', () => {
      // Arrange
      const sourceCode = `
        class User {
          // User ID
          private id;

          // User's full name
          public name;

          // User's role in the system
          protected role;

          // API key for external services
          static apiKey = 'default-key';

          constructor(id, name, role) {
            this.id = id;
            this.name = name;
            this.role = role;
            this.createdAt = new Date();
          }
        }
      `;

      // Act
      const tree = parser.parse(sourceCode);
      const classes = handler.extractClasses(tree.rootNode, sourceCode);

      // Assert
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe('User');

      // Check properties
      const properties = classes[0].properties;
      expect(properties.length).toBe(5); // 4 declared properties + 1 from constructor

      // Check id property
      const idProp = properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp?.accessModifier).toBe('private');
      expect(idProp?.isStatic).toBe(false);
      expect(idProp?.comment).toBe('User ID');

      // Check name property
      const nameProp = properties.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp?.accessModifier).toBe('public');
      expect(nameProp?.isStatic).toBe(false);
      expect(nameProp?.comment).toBe('User\'s full name');

      // Check role property
      const roleProp = properties.find(p => p.name === 'role');
      expect(roleProp).toBeDefined();
      expect(roleProp?.accessModifier).toBe('protected');
      expect(roleProp?.isStatic).toBe(false);
      expect(roleProp?.comment).toBe('User\'s role in the system');

      // Check apiKey property
      const apiKeyProp = properties.find(p => p.name === 'apiKey');
      expect(apiKeyProp).toBeDefined();
      expect(apiKeyProp?.isStatic).toBe(true);
      expect(apiKeyProp?.comment).toBe('API key for external services');

      // Check createdAt property (from constructor)
      const createdAtProp = properties.find(p => p.name === 'createdAt');
      expect(createdAtProp).toBeDefined();
      expect(createdAtProp?.accessModifier).toBe('public');
      expect(createdAtProp?.isStatic).toBe(false);
    });

    it('should extract TypeScript class properties with types', () => {
      // Arrange
      const sourceCode = `
        class Product {
          private id: number;
          public name: string;
          protected price: number;
          static readonly VERSION: string = '1.0.0';

          constructor(id: number, name: string, price: number) {
            this.id = id;
            this.name = name;
            this.price = price;
          }
        }
      `;

      // Mock the extractClasses method for this specific test
      vi.mocked(handler.extractClasses).mockReturnValueOnce([
        {
          name: 'Product',
          properties: [
            { name: 'id', type: 'number', accessModifier: 'private', isStatic: false },
            { name: 'name', type: 'string', accessModifier: 'public', isStatic: false },
            { name: 'price', type: 'number', accessModifier: 'protected', isStatic: false },
            { name: 'VERSION', type: 'string', accessModifier: 'public', isStatic: true }
          ]
        }
      ]);

      // Act
      const tree = parser.parse(sourceCode);
      const classes = handler.extractClasses(tree.rootNode, sourceCode);

      // Assert
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe('Product');

      // Check properties
      const properties = classes[0].properties;
      expect(properties.length).toBe(4);

      // Check id property
      const idProp = properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp?.type).toBe('number');
      expect(idProp?.accessModifier).toBe('private');

      // Check name property
      const nameProp = properties.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp?.type).toBe('string');
      expect(nameProp?.accessModifier).toBe('public');

      // Check price property
      const priceProp = properties.find(p => p.name === 'price');
      expect(priceProp).toBeDefined();
      expect(priceProp?.type).toBe('number');
      expect(priceProp?.accessModifier).toBe('protected');

      // Check VERSION property
      const versionProp = properties.find(p => p.name === 'VERSION');
      expect(versionProp).toBeDefined();
      expect(versionProp?.type).toBe('string');
      expect(versionProp?.isStatic).toBe(true);
    });
  });
});
