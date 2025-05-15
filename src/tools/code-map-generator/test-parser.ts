/**
 * Test script for verifying Tree-sitter grammar loading and parsing.
 *
 * This script tests the parser's ability to load and use various language grammars.
 * It can be run with: npx ts-node src/tools/code-map-generator/test-parser.ts
 */

import {
  initializeParser,
  languageConfigurations,
  getParserForFileExtension,
  parseCode
} from './parser.js';
import path from 'path';
import fs from 'fs/promises';

// Sample code snippets for testing different languages
const sampleCode: Record<string, string> = {
  '.js': `
    function hello() {
      console.log("Hello, world!");
      // A simple comment
      return 42;
    }
  `,
  '.py': `
    def hello():
      """This is a docstring."""
      print("Hello, world!")
      # A simple comment
      return 42
  `,
  '.ts': `
    function hello(): number {
      console.log("Hello, world!");
      // A simple comment
      return 42;
    }
  `,
  '.html': `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test</title>
      </head>
      <body>
        <!-- A comment -->
        <h1>Hello, world!</h1>
      </body>
    </html>
  `,
  '.json': `
    {
      "hello": "world",
      "answer": 42
    }
  `,
  '.go': `
    package main

    import "fmt"

    // Main function
    func main() {
      fmt.Println("Hello, world!")
    }
  `,
};

/**
 * Tests parsing a specific language
 */
async function testLanguage(extension: string): Promise<boolean> {
  console.log(`\n=== Testing ${extension} parsing ===`);

  const parser = await getParserForFileExtension(extension);
  if (!parser) {
    console.error(`❌ Failed to get parser for ${extension}`);
    return false;
  }

  const code = sampleCode[extension] || `// Sample code for ${extension}`;
  const tree = await parseCode(code, extension);

  if (!tree) {
    console.error(`❌ Failed to parse ${extension} code`);
    return false;
  }

  console.log(`✅ Successfully parsed ${extension} code`);
  console.log(`   Root node type: ${tree.rootNode.type}`);
  console.log(`   Child count: ${tree.rootNode.childCount}`);

  // Print the first few children to verify structure
  console.log(`   First few children:`);
  tree.rootNode.children.slice(0, 3).forEach((child: any, i: number) => {
    console.log(`     ${i}: ${child.type} - "${child.text.substring(0, 30).replace(/\n/g, '\\n')}${child.text.length > 30 ? '...' : ''}"`);
  });

  return true;
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log("Initializing Tree-sitter parser...");
    await initializeParser();
    console.log("✅ Parser initialized successfully");

    // Test a subset of languages
    const languagesToTest = Object.keys(sampleCode);
    let successCount = 0;

    for (const ext of languagesToTest) {
      const success = await testLanguage(ext);
      if (success) successCount++;
    }

    console.log(`\n=== Test Summary ===`);
    console.log(`Tested ${languagesToTest.length} languages`);
    console.log(`${successCount} succeeded, ${languagesToTest.length - successCount} failed`);

  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Run the tests
runTests().catch(console.error);
