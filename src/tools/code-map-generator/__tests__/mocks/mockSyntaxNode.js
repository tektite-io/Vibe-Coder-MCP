/**
 * Mock implementation of Tree-sitter SyntaxNode for testing.
 */

/**
 * Creates a mock syntax node with the given type and text.
 * @param {string} type The node type
 * @param {string} text The node text
 * @param {Array<MockSyntaxNode>} children Optional child nodes
 * @returns {MockSyntaxNode} A mock syntax node
 */
export function createMockSyntaxNode(type, text, children = []) {
  return new MockSyntaxNode(type, text, children);
}

/**
 * Mock implementation of Tree-sitter SyntaxNode.
 */
export class MockSyntaxNode {
  /**
   * Creates a new MockSyntaxNode.
   * @param {string} type The node type
   * @param {string} text The node text
   * @param {Array<MockSyntaxNode>} children Optional child nodes
   */
  constructor(type, text, children = []) {
    this.type = type;
    this.text = text;
    this.children = children;
    this.parent = null;
    this.fieldName = null;
    this.startPosition = { row: 0, column: 0 };
    this.endPosition = { row: 0, column: text.length };
    this.namedChildren = [];
    this.namedChildCount = 0;

    // Set parent reference for children
    for (const child of children) {
      child.parent = this;
    }
  }

  /**
   * Gets a child node by field name.
   * @param {string} name The field name
   * @returns {MockSyntaxNode|null} The child node or null
   */
  childForFieldName(name) {
    return this.children.find(child => child.fieldName === name) || null;
  }

  /**
   * Gets a named child by index.
   * @param {number} index The index
   * @returns {MockSyntaxNode|null} The child node or null
   */
  namedChild(index) {
    return this.namedChildren[index] || null;
  }

  /**
   * Gets a child by index.
   * @param {number} index The index
   * @returns {MockSyntaxNode|null} The child node or null
   */
  child(index) {
    return this.children[index] || null;
  }

  /**
   * Gets the first child with the given type.
   * @param {string} type The node type
   * @returns {MockSyntaxNode|null} The child node or null
   */
  firstChildOfType(type) {
    return this.children.find(child => child.type === type) || null;
  }

  /**
   * Gets all children with the given type.
   * @param {string} type The node type
   * @returns {Array<MockSyntaxNode>} The child nodes
   */
  childrenOfType(type) {
    return this.children.filter(child => child.type === type);
  }

  /**
   * Gets the first named child with the given type.
   * @param {string} type The node type
   * @returns {MockSyntaxNode|null} The child node or null
   */
  firstNamedChildOfType(type) {
    return this.namedChildren.find(child => child.type === type) || null;
  }

  /**
   * Gets all named children with the given type.
   * @param {string} type The node type
   * @returns {Array<MockSyntaxNode>} The child nodes
   */
  namedChildrenOfType(type) {
    return this.namedChildren.filter(child => child.type === type);
  }

  /**
   * Gets the node text.
   * @returns {string} The node text
   */
  toString() {
    return this.text;
  }
}
