// Test script to verify the parser module's path resolution
import { initializeParser, loadLanguageGrammar } from './build/tools/code-map-generator/parser.js';
import path from 'path';
import fs from 'fs';

async function testParser() {
  console.log('Testing parser module...');
  
  try {
    // Initialize the parser
    await initializeParser();
    console.log('Parser initialized successfully');
    
    // Check if the grammar files directory exists
    const grammarDir = path.resolve(process.cwd(), 'public', 'grammars');
    console.log(`Grammar directory: ${grammarDir}`);
    
    if (fs.existsSync(grammarDir)) {
      console.log(`Grammar directory exists: ${grammarDir}`);
      // List files in the directory
      const files = fs.readdirSync(grammarDir);
      console.log(`Files in directory (${files.length}): ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
    } else {
      console.log(`Grammar directory does NOT exist: ${grammarDir}`);
    }
    
    // Test loading a grammar
    const testExtension = '.js';
    const testConfig = { name: 'JavaScript', wasmPath: 'tree-sitter-javascript.wasm' };
    
    console.log(`Attempting to load grammar for ${testConfig.name}...`);
    const loaded = await loadLanguageGrammar(testExtension, testConfig);
    
    if (loaded) {
      console.log(`Successfully loaded grammar for ${testConfig.name}`);
    } else {
      console.log(`Failed to load grammar for ${testConfig.name}`);
    }
    
  } catch (error) {
    console.error('Error testing parser:', error);
  }
}

testParser().catch(console.error);
