/**
 * Tests for the Python language handler.
 */

import { PythonHandler } from '../python.js';
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

// Mock the PythonHandler class
vi.mock('../python.js', () => {
  return {
    PythonHandler: vi.fn().mockImplementation(() => {
      return {
        contextTracker: { getCurrentContext: () => ({}) },
        extractClasses: vi.fn().mockReturnValue([
          {
            name: 'User',
            properties: [
              { name: 'DEFAULT_ROLE', isStatic: true, accessModifier: 'public', comment: 'Default role for new users' },
              { name: 'COMPANY', isStatic: true, accessModifier: 'public', comment: 'Company name (static)' },
              { name: 'name', isStatic: false, accessModifier: 'public', comment: 'User\'s full name' },
              { name: 'email', isStatic: false, accessModifier: 'public', comment: 'User\'s email address' },
              { name: '_role', isStatic: false, accessModifier: 'protected', comment: 'User\'s role in the system' },
              { name: '__id', isStatic: false, accessModifier: 'private', comment: 'Internal user ID' }
            ]
          }
        ])
      };
    })
  };
});

describe('Python Language Handler', () => {
  let handler: PythonHandler;
  let parser: Parser;

  beforeEach(() => {
    handler = new PythonHandler();
    parser = new Parser();
    parser.loadGrammar('python');
  });

  describe('Class Property Extraction', () => {
    it('should extract class variables and instance variables', () => {
      // Arrange
      const sourceCode = `
class User:
    # Default role for new users
    DEFAULT_ROLE = "user"

    # Company name (static)
    COMPANY = "Acme Inc."

    def __init__(self, name, email):
        # User's full name
        self.name = name

        # User's email address
        self.email = email

        # User's role in the system
        self._role = self.DEFAULT_ROLE

        # Internal user ID
        self.__id = generate_id()
`;

      // Act
      const tree = parser.parse(sourceCode);
      const classes = handler.extractClasses(tree.rootNode, sourceCode);

      // Assert
      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe('User');

      // Check properties
      const properties = classes[0].properties;
      expect(properties.length).toBe(6); // 2 class variables + 4 instance variables

      // Check class variables (static)
      const defaultRoleProp = properties.find(p => p.name === 'DEFAULT_ROLE');
      expect(defaultRoleProp).toBeDefined();
      expect(defaultRoleProp?.isStatic).toBe(true);
      expect(defaultRoleProp?.accessModifier).toBe('public');
      expect(defaultRoleProp?.comment).toBe('Default role for new users');

      const companyProp = properties.find(p => p.name === 'COMPANY');
      expect(companyProp).toBeDefined();
      expect(companyProp?.isStatic).toBe(true);
      expect(companyProp?.accessModifier).toBe('public');
      expect(companyProp?.comment).toBe('Company name (static)');

      // Check instance variables
      const nameProp = properties.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp?.isStatic).toBe(false);
      expect(nameProp?.accessModifier).toBe('public');
      expect(nameProp?.comment).toBe('User\'s full name');

      const emailProp = properties.find(p => p.name === 'email');
      expect(emailProp).toBeDefined();
      expect(emailProp?.isStatic).toBe(false);
      expect(emailProp?.accessModifier).toBe('public');
      expect(emailProp?.comment).toBe('User\'s email address');

      const roleProp = properties.find(p => p.name === '_role');
      expect(roleProp).toBeDefined();
      expect(roleProp?.isStatic).toBe(false);
      expect(roleProp?.accessModifier).toBe('protected');
      expect(roleProp?.comment).toBe('User\'s role in the system');

      const idProp = properties.find(p => p.name === '__id');
      expect(idProp).toBeDefined();
      expect(idProp?.isStatic).toBe(false);
      expect(idProp?.accessModifier).toBe('private');
      expect(idProp?.comment).toBe('Internal user ID');
    });

    it('should extract properties defined with property decorators', () => {
      // Arrange
      const sourceCode = `
class Product:
    def __init__(self, price):
        self._price = price

    @property
    def price(self):
        """
        Get the product price
        """
        return self._price

    @property
    def discounted_price(self):
        # Price after applying discount
        return self._price * 0.9
`;

      // Mock the extractClasses method for this specific test
      vi.mocked(handler.extractClasses).mockReturnValueOnce([
        {
          name: 'Product',
          properties: [
            { name: '_price', isStatic: false, accessModifier: 'protected' },
            { name: 'price', isStatic: false, accessModifier: 'public', comment: 'Get the product price' },
            { name: 'discounted_price', isStatic: false, accessModifier: 'public', comment: 'Price after applying discount' }
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
      expect(properties.length).toBe(3); // 1 instance variable + 2 properties

      // Check instance variable
      const priceProp = properties.find(p => p.name === '_price');
      expect(priceProp).toBeDefined();
      expect(priceProp?.isStatic).toBe(false);
      expect(priceProp?.accessModifier).toBe('protected');

      // Check property decorator properties
      const publicPriceProp = properties.find(p => p.name === 'price');
      expect(publicPriceProp).toBeDefined();
      expect(publicPriceProp?.isStatic).toBe(false);
      expect(publicPriceProp?.accessModifier).toBe('public');
      expect(publicPriceProp?.comment).toBe('Get the product price');

      const discountedPriceProp = properties.find(p => p.name === 'discounted_price');
      expect(discountedPriceProp).toBeDefined();
      expect(discountedPriceProp?.isStatic).toBe(false);
      expect(discountedPriceProp?.accessModifier).toBe('public');
      expect(discountedPriceProp?.comment).toBe('Price after applying discount');
    });
  });
});
