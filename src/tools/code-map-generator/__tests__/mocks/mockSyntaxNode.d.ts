/**
 * Type declarations for the mock syntax node module
 */

export interface Position {
  row: number;
  column: number;
}

export class MockSyntaxNode {
  type: string;
  text: string;
  startPosition: Position;
  endPosition: Position;
  parent: MockSyntaxNode | null;
  children: MockSyntaxNode[];
  childCount: number;
  namedChildCount: number;
  nextSibling: MockSyntaxNode | null;
  previousSibling: MockSyntaxNode | null;
  firstChild: MockSyntaxNode | null;
  lastChild: MockSyntaxNode | null;
  firstNamedChild: MockSyntaxNode | null;
  lastNamedChild: MockSyntaxNode | null;
  startIndex: number;
  endIndex: number;
  fieldName?: string;
  namedChildren?: MockSyntaxNode[];

  constructor(options?: {
    type?: string;
    text?: string;
    startPosition?: Position;
    endPosition?: Position;
    parent?: MockSyntaxNode | null;
    children?: MockSyntaxNode[];
    nextSibling?: MockSyntaxNode | null;
    previousSibling?: MockSyntaxNode | null;
  });

  child(index: number): MockSyntaxNode | null;
  namedChild(index: number): MockSyntaxNode | null;
  childForFieldName(fieldName: string): MockSyntaxNode | null;
  descendantsOfType(types: string | string[], startPosition?: Position, endPosition?: Position): MockSyntaxNode[];
  toString(): string;
}

export function createMockSyntaxNode(type: string, text: string, children?: MockSyntaxNode[]): MockSyntaxNode;
