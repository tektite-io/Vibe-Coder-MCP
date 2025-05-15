import { z } from 'zod';
import { ToolDefinition, ToolExecutor, registerTool, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import logger from '../../logger.js';
import path from 'path';
import fs from 'fs/promises'; // Added for readFile

// Updated imports including AST analysis, graph building, and diagram generation functions and types
import {
  initializeParser,
  languageConfigurations,
  loadLanguageGrammar,
  getParserForFileExtension,
  Tree,
  SyntaxNode, // Make sure SyntaxNode is exported from parser.ts or imported from web-tree-sitter
} from './parser.js';

// Import new helpers
import { collectSourceFiles } from './fileScanner.js';
import { FileInfo, ClassInfo, FunctionInfo as CodeMapFunctionInfo, ImportInfo as CodeMapImportInfo, CodeMap } from './codeMapModel.js'; // Renamed to avoid conflict
import { extractFunctions, extractClasses, extractImports, getNodeText } from './astAnalyzer.js';
import { buildFileDependencyGraph, buildClassInheritanceGraph, buildFunctionCallGraph, GraphEdge, GraphNode } from './graphBuilder.js';
import { generateMermaidFileDependencyDiagram, generateMermaidClassDiagram, generateMermaidFunctionCallDiagram } from './diagramGenerator.js';

// Epic1-Task006: Define the input schema shape for the tool.
const codeMapInputSchemaShape = {
  path: z.string().optional().describe("Optional path to the target directory to map. Defaults to the current project root."),
  // Example for future extension:
  // ignored_files_patterns: z.array(z.string()).optional().describe("Optional array of glob patterns for files/directories to ignore."),
  // output_format: z.enum(['markdown', 'json']).optional().default('markdown').describe("Format for the output."),
};

// Epic1-Task007: Define the asynchronous executor function stub for the tool.
const codeMapExecutor: ToolExecutor = async (params, config, context) => {
  logger.debug({ toolName: 'map-codebase', params, sessionId: context?.sessionId }, 'Code-Map Generator invoked.');
  try {
    const validatedParams = z.object(codeMapInputSchemaShape).parse(params);
    const targetPath = validatedParams.path || process.cwd();
    const projectRoot = path.resolve(targetPath);

    await initializeParser();
    const grammarPromises = [];
    for (const ext in languageConfigurations) {
      const langConfig = languageConfigurations[ext];
      grammarPromises.push(loadLanguageGrammar(ext, langConfig));
    }
    await Promise.all(grammarPromises);
    logger.info('All configured grammars loaded (or attempted).');

    const supportedExtensions = Object.keys(languageConfigurations);
    const ignoredPatterns = [
        /node_modules/i, /\.git/i, /dist/i, /build/i, /out/i, /coverage/i,
        /\.(log|lock|env|bak|tmp|swp|DS_Store)$/i, /.*\/\..*/, /^\..*/,
        // Common test directories
        /__tests__/i, /tests/i, /test/i, /__mocks__/i,
        // Specific config files or large data files that are not source code
        /\.json$/i, /\.md$/i, /\.yaml$/i, /\.yml$/i, /\.xml$/i, /\.csv$/i,
        // Image/binary files
        /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp4|webm|ogg|pdf)$/i,
    ];

    logger.info(`Scanning for source files in: ${projectRoot}`);
    const filePaths = await collectSourceFiles(projectRoot, supportedExtensions, ignoredPatterns);

    if (filePaths.length === 0) {
      return { content: [{ type: 'text', text: 'No source files found to map...' }], isError: false };
    }
    logger.info(`Found ${filePaths.length} source files to process.`);

    const allFileInfos: FileInfo[] = [];
    const sourceCodeCache = new Map<string, string>(); // For CMI-17 (function call graph)

    for (const filePath of filePaths) {
      const relativePath = path.relative(projectRoot, filePath);
      let ast: Tree | undefined;
      let fileContent = '';
      try {
        logger.debug(`Reading file: ${filePath}`);
        fileContent = await fs.readFile(filePath, 'utf-8');
        sourceCodeCache.set(filePath, fileContent); // Cache for call graph

        const extension = path.extname(filePath).toLowerCase();
        const parserInstance = await getParserForFileExtension(extension);

        if (!parserInstance) {
          logger.warn(`No parser for ${filePath}, skipping symbol extraction.`);
          // Create a basic FileInfo for files that can't be parsed
          allFileInfos.push({
            filePath,
            relativePath,
            classes: [],
            functions: [],
            imports: [],
            comment: `File type ${extension} not fully supported for deep analysis.`,
          });
          continue;
        }

        logger.debug(`Parsing file: ${filePath}`);
        ast = parserInstance.parse(fileContent);

        // Epic 4: Symbol Extraction
        const languageId = extension; // Use extension as languageId
        const functions = ast ? extractFunctions(ast.rootNode, fileContent, languageId) : [];
        const classes = ast ? extractClasses(ast.rootNode, fileContent, languageId) : [];
        const imports = ast ? extractImports(ast.rootNode, fileContent, languageId) : [];

        // Attempt to find a file-level comment (e.g. first block comment)
        let fileLevelComment: string | undefined;
        if (ast && ast.rootNode.firstChild?.type === 'comment' && ast.rootNode.firstChild.text.startsWith('/**')) {
            fileLevelComment = getNodeText(ast.rootNode.firstChild, fileContent).substring(3).split('*/')[0].trim().split('\n')[0];
        }

        allFileInfos.push({
          filePath,
          relativePath,
          classes,
          functions,
          imports,
          comment: fileLevelComment || `File: ${relativePath}`, // Add file-level comment or default
        });
        logger.debug(`Extracted symbols from ${filePath}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, filePath }, `Failed to read, parse, or extract symbols from file.`);
        allFileInfos.push({
          filePath,
          relativePath,
          classes: [],
          functions: [],
          imports: [],
          comment: `Error processing file: ${errorMessage}`,
        });
      }
    }

    // CMI-14: Refine/Sort (simple sort by path for now)
    allFileInfos.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    // Epic 5: Graph Building
    const { nodes: fileDepNodes, edges: fileDepEdges } = buildFileDependencyGraph(allFileInfos, projectRoot);
    const { nodes: classInheritanceNodes, edges: classInheritanceEdges } = buildClassInheritanceGraph(allFileInfos);
    // CMI-17 (Optional Function Call Graph) - pass sourceCodeCache
    const { nodes: funcCallNodes, edges: funcCallEdges } = buildFunctionCallGraph(allFileInfos, sourceCodeCache);

    // Epic 5: Diagram Generation (CMI-18)
    const fileDepDiagramMd = generateMermaidFileDependencyDiagram(fileDepNodes, fileDepEdges);
    const classDiagramMd = generateMermaidClassDiagram(classInheritanceNodes, classInheritanceEdges, allFileInfos.flatMap(fi => fi.classes));
    const funcCallDiagramMd = generateMermaidFunctionCallDiagram(funcCallNodes, funcCallEdges);

    const successfullyProcessedCount = allFileInfos.filter(fi => !(fi.comment && fi.comment.startsWith("Error processing file"))).length;
    const filesWithErrorsCount = allFileInfos.length - successfullyProcessedCount;

    let markdownOutput = `# Code Map for ${projectRoot}\n\n`;
    markdownOutput += `Processed ${allFileInfos.length} files. Successfully analyzed: ${successfullyProcessedCount}. Files with errors: ${filesWithErrorsCount}.\n\n`;

    allFileInfos.forEach(fi => {
        markdownOutput += `## ${fi.relativePath}\n`;
        if (fi.comment) markdownOutput += `*${fi.comment}*\n\n`;
        if (fi.imports.length > 0) {
            markdownOutput += `### Imports\n`;
            fi.imports.forEach(imp => markdownOutput += `- ${imp.path} ${imp.importedItems ? `(${imp.importedItems.join(', ')})` : ''}\n`);
            markdownOutput += `\n`;
        }
        if (fi.functions.length > 0) {
            markdownOutput += `### Functions\n`;
            fi.functions.forEach(fn => markdownOutput += `- **${fn.name}** (${fn.signature}) — *${fn.comment}*\n`);
            markdownOutput += `\n`;
        }
        if (fi.classes.length > 0) {
            markdownOutput += `### Classes\n`;
            fi.classes.forEach(cls => {
                markdownOutput += `- **${cls.name}** ${cls.parentClass ? `extends ${cls.parentClass}` : ''} — *${cls.comment}*\n`;
                cls.methods.forEach(m => markdownOutput += `  - ${m.name}(${m.signature.substring(m.name.length)}) — *${m.comment}*\n`);
            });
            markdownOutput += `\n`;
        }
    });

    markdownOutput += `\n## File Dependency Diagram\n\`\`\`mermaid\n${fileDepDiagramMd}\n\`\`\`\n`;
    markdownOutput += `\n## Class Inheritance Diagram\n\`\`\`mermaid\n${classDiagramMd}\n\`\`\`\n`;
    if (funcCallEdges.length > 0) {
        markdownOutput += `\n## Function Call Diagram (Heuristic)\n\`\`\`mermaid\n${funcCallDiagramMd}\n\`\`\`\n`;
    }

    logger.info({ toolName: 'map-codebase', path: projectRoot, sessionId: context?.sessionId, successfullyProcessedCount, filesWithErrorsCount }, "Code map data extracted and diagrams generated.");

    return {
      content: [{ type: 'text', text: markdownOutput }],
      isError: false,
    };
  } catch (error) {
    logger.error({ err: error, toolName: 'map-codebase', params, sessionId: context?.sessionId }, 'Error in Code-Map Generator');
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error generating code map: ${errorMessage}` }],
      isError: true,
    };
  }
};

// Epic1-Task008: Define the ToolDefinition object for the "Code-Map Generator".
const codeMapToolDefinition: ToolDefinition = {
  name: "map-codebase", // Chosen name for CLI invocation and semantic routing
  description: "Recursively scans a target codebase, extracts semantic information (classes, functions, doc-strings, comments), and generates a token-efficient, context-dense Markdown index and Mermaid diagrams.",
  inputSchema: codeMapInputSchemaShape,
  executor: codeMapExecutor,
};

// Epic1-Task009: Call registerTool to register the tool definition.
registerTool(codeMapToolDefinition);

logger.info('Code-Map Generator tool registered.');