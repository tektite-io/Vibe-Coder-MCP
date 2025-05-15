/**
 * Simple test script for verifying Tree-sitter grammar loading and parsing.
 * Run with: node test-tree-sitter.js
 */

import Parser from 'web-tree-sitter';
import path from 'path';
import fs from 'fs';

// Path to the grammar files
const GRAMMARS_DIR = path.resolve('./public/grammars');

// Sample code for testing different languages
const SAMPLE_CODE = {
  javascript: {
    extension: '.js',
    wasmFile: 'tree-sitter-javascript.wasm',
    code: `
function hello() {
  console.log("Hello, world!");
  // A simple comment
  return 42;
}
`
  },
  python: {
    extension: '.py',
    wasmFile: 'tree-sitter-python.wasm',
    code: `
def hello():
  """This is a docstring."""
  print("Hello, world!")
  # A simple comment
  return 42
`
  },
  typescript: {
    extension: '.ts',
    wasmFile: 'tree-sitter-typescript.wasm',
    code: `
function hello(): number {
  console.log("Hello, world!");
  // A simple comment
  return 42;
}
`
  },
  html: {
    extension: '.html',
    wasmFile: 'tree-sitter-html.wasm',
    code: `
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
`
  },
  json: {
    extension: '.json',
    wasmFile: 'tree-sitter-json.wasm',
    code: `
{
  "hello": "world",
  "answer": 42
}
`
  }
};

/**
 * Tests a specific language grammar
 */
async function testLanguage(parser, language, config) {
  console.log(`\n=== Testing ${language} parsing ===`);

  const grammarPath = path.join(GRAMMARS_DIR, config.wasmFile);

  if (!fs.existsSync(grammarPath)) {
    console.error(`❌ Grammar file not found: ${grammarPath}`);
    return false;
  }

  try {
    console.log(`Loading ${language} grammar from: ${grammarPath}`);
    const lang = await Parser.Language.load(grammarPath);
    parser.setLanguage(lang);
    console.log(`✅ ${language} grammar loaded successfully`);

    // Parse code
    console.log(`Parsing ${language} code...`);
    const tree = parser.parse(config.code);
    console.log(`✅ ${language} code parsed successfully`);

    // Print parse tree information
    console.log(`Root node type: ${tree.rootNode.type}`);
    console.log(`Child count: ${tree.rootNode.childCount}`);

    // Print the first few children
    console.log("First few children:");
    for (let i = 0; i < Math.min(tree.rootNode.childCount, 3); i++) {
      const child = tree.rootNode.children[i];
      console.log(`  ${i}: ${child.type} - "${child.text.substring(0, 30).replace(/\n/g, '\\n')}${child.text.length > 30 ? '...' : ''}"`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Error testing ${language}:`, error);
    return false;
  }
}

async function main() {
  try {
    console.log("Initializing Tree-sitter parser...");
    await Parser.init();
    const parser = new Parser();
    console.log("✅ Parser initialized successfully");

    // Test each language
    const languages = Object.entries(SAMPLE_CODE);
    let successCount = 0;

    for (const [language, config] of languages) {
      const success = await testLanguage(parser, language, config);
      if (success) successCount++;
    }

    console.log(`\n=== Test Summary ===`);
    console.log(`Tested ${languages.length} languages`);
    console.log(`${successCount} succeeded, ${languages.length - successCount} failed`);

    if (successCount === languages.length) {
      console.log("\n✅ All tests completed successfully");
    } else {
      console.log("\n⚠️ Some tests failed");
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

main().catch(console.error);
