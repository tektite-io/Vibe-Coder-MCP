/**
 * Simple test script for the Code-Map Generator tool.
 * Run with: node test-code-map-generator.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { collectSourceFiles } from './build/tools/code-map-generator/fileScanner.js';
import { initializeParser, loadLanguageGrammar, getParserForFileExtension, languageConfigurations } from './build/tools/code-map-generator/parser.js';
import fs from 'fs/promises';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testCodeMapGenerator() {
  try {
    console.log('Testing Code-Map Generator...');
    
    // Test directory to scan
    const targetPath = path.join(__dirname, 'src/tools/code-map-generator');
    console.log(`Target path: ${targetPath}`);
    
    // Initialize parser and load grammars
    console.log('Initializing parser...');
    await initializeParser();
    
    // Load JavaScript grammar
    const jsExtension = '.js';
    const jsConfig = languageConfigurations[jsExtension];
    if (jsConfig) {
      const grammarLoaded = await loadLanguageGrammar(jsExtension, jsConfig);
      console.log(`JavaScript grammar loaded: ${grammarLoaded}`);
    }
    
    // Load TypeScript grammar
    const tsExtension = '.ts';
    const tsConfig = languageConfigurations[tsExtension];
    if (tsConfig) {
      const grammarLoaded = await loadLanguageGrammar(tsExtension, tsConfig);
      console.log(`TypeScript grammar loaded: ${grammarLoaded}`);
    }
    
    // Collect source files
    const supportedExtensions = ['.js', '.ts'];
    const ignoredPatterns = [
      /node_modules/i,
      /\.git/i,
      /dist/i,
      /build/i,
    ];
    
    console.log('Collecting source files...');
    const filePaths = await collectSourceFiles(targetPath, supportedExtensions, ignoredPatterns);
    console.log(`Found ${filePaths.length} files.`);
    
    // Parse each file
    console.log('\nParsing files:');
    for (const filePath of filePaths) {
      const relativePath = path.relative(targetPath, filePath);
      console.log(`\nFile: ${relativePath}`);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const extension = path.extname(filePath).toLowerCase();
        
        const parserInstance = await getParserForFileExtension(extension);
        if (!parserInstance) {
          console.error(`  No parser available for ${extension}, skipping.`);
          continue;
        }
        
        console.log(`  Parsing with ${extension} parser...`);
        const ast = parserInstance.parse(fileContent);
        console.log(`  Parse successful. Root node type: ${ast.rootNode.type}`);
        console.log(`  Child count: ${ast.rootNode.childCount}`);
        
        // Print the first few children to verify structure
        console.log(`  First few children:`);
        for (let i = 0; i < Math.min(ast.rootNode.childCount, 3); i++) {
          const child = ast.rootNode.children[i];
          console.log(`    ${i}: ${child.type} - "${child.text.substring(0, 30).replace(/\n/g, '\\n')}${child.text.length > 30 ? '...' : ''}"`);
        }
      } catch (error) {
        console.error(`  Error parsing ${filePath}: ${error.message}`);
      }
    }
    
    console.log('\nTest completed successfully.');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testCodeMapGenerator().catch(console.error);
