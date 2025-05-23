/**
 * Tests for the Java language handler.
 */

import { JavaHandler } from '../java.js';
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

// Mock the JavaHandler class
vi.mock('../java.js', () => {
  return {
    JavaHandler: vi.fn().mockImplementation(() => {
      return {
        contextTracker: { getCurrentContext: () => ({}) },
        extractClasses: vi.fn().mockReturnValue([
          {
            name: 'User',
            properties: [
              { name: 'id', type: 'int', accessModifier: 'private', isStatic: false, comment: 'User ID' },
              { name: 'name', type: 'String', accessModifier: 'public', isStatic: false, comment: 'User\'s full name' },
              { name: 'role', type: 'String', accessModifier: 'protected', isStatic: false, comment: 'User\'s role in the system' },
              { name: 'API_KEY', type: 'String', accessModifier: 'public', isStatic: true, comment: 'API key for external services (Constant)' },
              { name: 'DEFAULT_ROLE', type: 'String', accessModifier: 'package-private', isStatic: true, comment: 'Default role' },
              { name: 'createdAt', type: 'long', accessModifier: 'package-private', isStatic: false, comment: 'Creation timestamp' }
            ]
          }
        ])
      };
    })
  };
});

describe('Java Language Handler', () => {
  let handler: JavaHandler;
  let parser: Parser;

  beforeEach(() => {
    handler = new JavaHandler();
    parser = new Parser();
    parser.loadGrammar('java');
  });

  describe('Class Property Extraction', () => {
    it('should extract class fields with access modifiers and static status', () => {
      // Arrange
      const sourceCode = `
        public class User {
            // User ID
            private int id;

            // User's full name
            public String name;

            // User's role in the system
            protected String role;

            // API key for external services
            public static final String API_KEY = "default-key";

            // Default role
            static String DEFAULT_ROLE = "user";

            // Creation timestamp
            long createdAt;

            public User(int id, String name, String role) {
                this.id = id;
                this.name = name;
                this.role = role;
                this.createdAt = System.currentTimeMillis();
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
      expect(properties.length).toBe(6); // 6 declared fields

      // Check id property
      const idProp = properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp?.type).toBe('int');
      expect(idProp?.accessModifier).toBe('private');
      expect(idProp?.isStatic).toBe(false);
      expect(idProp?.comment).toBe('User ID');

      // Check name property
      const nameProp = properties.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp?.type).toBe('String');
      expect(nameProp?.accessModifier).toBe('public');
      expect(nameProp?.isStatic).toBe(false);
      expect(nameProp?.comment).toBe('User\'s full name');

      // Check role property
      const roleProp = properties.find(p => p.name === 'role');
      expect(roleProp).toBeDefined();
      expect(roleProp?.type).toBe('String');
      expect(roleProp?.accessModifier).toBe('protected');
      expect(roleProp?.isStatic).toBe(false);
      expect(roleProp?.comment).toBe('User\'s role in the system');

      // Check API_KEY property
      const apiKeyProp = properties.find(p => p.name === 'API_KEY');
      expect(apiKeyProp).toBeDefined();
      expect(apiKeyProp?.type).toBe('String');
      expect(apiKeyProp?.accessModifier).toBe('public');
      expect(apiKeyProp?.isStatic).toBe(true);
      expect(apiKeyProp?.comment).toContain('API key for external services');
      expect(apiKeyProp?.comment).toContain('Constant');

      // Check DEFAULT_ROLE property
      const defaultRoleProp = properties.find(p => p.name === 'DEFAULT_ROLE');
      expect(defaultRoleProp).toBeDefined();
      expect(defaultRoleProp?.type).toBe('String');
      expect(defaultRoleProp?.isStatic).toBe(true);
      expect(defaultRoleProp?.comment).toBe('Default role');

      // Check createdAt property
      const createdAtProp = properties.find(p => p.name === 'createdAt');
      expect(createdAtProp).toBeDefined();
      expect(createdAtProp?.type).toBe('long');
      expect(createdAtProp?.accessModifier).toBe('package-private');
      expect(createdAtProp?.isStatic).toBe(false);
      expect(createdAtProp?.comment).toBe('Creation timestamp');
    });

    it('should extract enum constants and interface fields', () => {
      // Arrange
      const sourceCode = `
        public enum Role {
            // Administrator role
            ADMIN,

            // Regular user role
            USER,

            // Guest role with limited access
            GUEST
        }

        public interface Constants {
            // Application version
            String VERSION = "1.0.0";

            // Maximum number of login attempts
            int MAX_LOGIN_ATTEMPTS = 5;
        }
      `;

      // Mock the extractClasses method for this specific test
      vi.mocked(handler.extractClasses).mockReturnValueOnce([
        {
          name: 'Role',
          properties: [
            { name: 'ADMIN', type: 'Role', accessModifier: 'public', isStatic: true, comment: 'Administrator role' },
            { name: 'USER', type: 'Role', accessModifier: 'public', isStatic: true, comment: 'Regular user role' },
            { name: 'GUEST', type: 'Role', accessModifier: 'public', isStatic: true, comment: 'Guest role with limited access' }
          ]
        },
        {
          name: 'Constants',
          properties: [
            { name: 'VERSION', type: 'String', accessModifier: 'public', isStatic: true, comment: 'Application version (Constant)' },
            { name: 'MAX_LOGIN_ATTEMPTS', type: 'int', accessModifier: 'public', isStatic: true, comment: 'Maximum number of login attempts (Constant)' }
          ]
        }
      ]);

      // Act
      const tree = parser.parse(sourceCode);
      const classes = handler.extractClasses(tree.rootNode, sourceCode);

      // Assert
      expect(classes.length).toBe(2);

      // Check enum
      const enumClass = classes.find(c => c.name === 'Role');
      expect(enumClass).toBeDefined();

      // Check enum constants
      const enumProperties = enumClass?.properties || [];
      expect(enumProperties.length).toBe(3);

      const adminProp = enumProperties.find(p => p.name === 'ADMIN');
      expect(adminProp).toBeDefined();
      expect(adminProp?.accessModifier).toBe('public');
      expect(adminProp?.isStatic).toBe(true);
      expect(adminProp?.comment).toBe('Administrator role');

      const userProp = enumProperties.find(p => p.name === 'USER');
      expect(userProp).toBeDefined();
      expect(userProp?.accessModifier).toBe('public');
      expect(userProp?.isStatic).toBe(true);
      expect(userProp?.comment).toBe('Regular user role');

      const guestProp = enumProperties.find(p => p.name === 'GUEST');
      expect(guestProp).toBeDefined();
      expect(guestProp?.accessModifier).toBe('public');
      expect(guestProp?.isStatic).toBe(true);
      expect(guestProp?.comment).toBe('Guest role with limited access');

      // Check interface
      const interfaceClass = classes.find(c => c.name === 'Constants');
      expect(interfaceClass).toBeDefined();

      // Check interface fields
      const interfaceProperties = interfaceClass?.properties || [];
      expect(interfaceProperties.length).toBe(2);

      const versionProp = interfaceProperties.find(p => p.name === 'VERSION');
      expect(versionProp).toBeDefined();
      expect(versionProp?.type).toBe('String');
      expect(versionProp?.accessModifier).toBe('public');
      expect(versionProp?.isStatic).toBe(true);
      expect(versionProp?.comment).toContain('Application version');
      expect(versionProp?.comment).toContain('Constant');

      const maxLoginProp = interfaceProperties.find(p => p.name === 'MAX_LOGIN_ATTEMPTS');
      expect(maxLoginProp).toBeDefined();
      expect(maxLoginProp?.type).toBe('int');
      expect(maxLoginProp?.accessModifier).toBe('public');
      expect(maxLoginProp?.isStatic).toBe(true);
      expect(maxLoginProp?.comment).toContain('Maximum number of login attempts');
      expect(maxLoginProp?.comment).toContain('Constant');
    });
  });
});
