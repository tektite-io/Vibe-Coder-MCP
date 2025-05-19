/**
 * Interactive CLI for the Code-Map Generator tool.
 * This script provides a simple command-line interface for using the map-codebase tool.
 */

import fs from 'fs';
import readline from 'readline';
// Import the codeMapExecutor directly from the compiled JavaScript file
import { codeMapExecutor } from './build/tools/code-map-generator/index.js';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Process a natural language query into parameters for the code-map-generator
 * @param {string} query - Natural language query
 * @returns {object} - Parameters for the code-map-generator
 */
function processNaturalLanguageQuery(query) {
  // This is a simple implementation that looks for key phrases
  // In a real implementation, this would use more sophisticated NLP techniques

  const params = {
    output_format: 'markdown'
  };

  // Extract path information
  const pathMatch = query.match(/in\s+(?:the\s+)?(?:directory|folder|path)?\s*['""]?([^'""]+)['""]?/i) ||
                    query.match(/(?:directory|folder|path)\s*['""]?([^'""]+)['""]?/i) ||
                    query.match(/(?:map|analyze|scan)\s+['""]?([^'""]+)['""]?/i);

  if (pathMatch) {
    params.path = pathMatch[1].trim();
  }

  // Extract ignore patterns
  const ignoreMatch = query.match(/ignore\s+([^.]+)/i);
  if (ignoreMatch) {
    const ignoreText = ignoreMatch[1];
    // Extract patterns in quotes or words separated by commas or "and"
    const patterns = [];

    // Look for quoted patterns
    const quotedPatterns = ignoreText.match(/['""](.*?)['""]|`(.*?)`/g);
    if (quotedPatterns) {
      quotedPatterns.forEach(pattern => {
        patterns.push(pattern.replace(/['""`]/g, ''));
      });
    }

    // If no quoted patterns, try to extract from text
    if (patterns.length === 0) {
      const textPatterns = ignoreText.split(/,|\s+and\s+/).map(p => p.trim());
      patterns.push(...textPatterns.filter(p => p.length > 0));
    }

    if (patterns.length > 0) {
      // Convert common terms to glob patterns
      params.ignored_files_patterns = patterns.map(p => {
        if (p === 'tests' || p === 'test files') return '**/__tests__/**';
        if (p === 'node_modules') return '**/node_modules/**';
        if (p === 'test files') return '**/*.test.*';
        return p;
      });
    }
  }

  return params;
}

/**
 * Run the code-map-generator with the given parameters
 * @param {object} params - Parameters for the code-map-generator
 */
async function runCodeMap(params) {
  console.log('Running code-map-generator with parameters:', JSON.stringify(params, null, 2));

  try {
    const result = await codeMapExecutor(params);

    if (result.isError) {
      console.log('\nERROR:', result.content[0].text);
    } else {
      console.log('\nSuccess! Generating code map...');

      // Save the result to a file
      const outputFile = `code-map-${Date.now()}.md`;
      const fullContent = result.content.map(item => item.text || JSON.stringify(item)).join('\n');
      fs.writeFileSync(outputFile, fullContent);
      console.log(`Code map saved to: ${outputFile}`);

      // Display a preview
      console.log('\nPreview:');
      if (result.content && result.content.length > 0) {
        const firstContent = result.content[0];
        if (firstContent.type === 'text') {
          // Show just the first few lines for preview
          const previewLines = firstContent.text.split('\n').slice(0, 10);
          console.log(previewLines.join('\n') + '\n...[truncated]');
        }
      }
    }
  } catch (error) {
    console.error('Error executing code-map-generator:', error);
  }
}

/**
 * Start the interactive CLI
 */
function startCLI() {
  console.log('=== Code-Map Generator Interactive CLI ===');
  console.log('Enter a natural language query to generate a code map, or "exit" to quit.');
  console.log('Example: "Map the src/services directory and ignore tests"');
  console.log('');

  promptUser();
}

/**
 * Prompt the user for input
 */
function promptUser() {
  rl.question('> ', async (query) => {
    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      console.log('Goodbye!');
      rl.close();
      return;
    }

    // Process the query
    const params = processNaturalLanguageQuery(query);
    await runCodeMap(params);

    // Prompt again
    promptUser();
  });
}

// Start the CLI
startCLI();
