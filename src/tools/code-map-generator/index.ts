import { z } from 'zod';
import { ToolDefinition, ToolExecutor, registerTool, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../logger.js';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';

import {
  initializeParser,
  readAndParseFile,
  clearCaches,
  getMemoryStats,
  languageConfigurations,
  initializeCaches,
  getSourceCodeFromCache,
  getMemoryManager
} from './parser.js';

import { collectSourceFiles } from './fileScanner.js';
import { FileInfo, CodeMap } from './codeMapModel.js';
import { extractFunctions, extractClasses, extractImports, getNodeText, generateHeuristicComment } from './astAnalyzer.js';
import { buildFileDependencyGraph, buildClassInheritanceGraph, buildFunctionCallGraph } from './graphBuilder.js';
import { generateMermaidFileDependencyDiagram, generateMermaidClassDiagram, generateMermaidFunctionCallDiagram, generateMermaidSequenceDiagram } from './diagramGenerator.js';
import { formatCodeMapToMarkdown, optimizeMarkdownOutput } from './outputFormatter.js';
import { CodeMapGeneratorConfig } from './types.js';
import { extractCodeMapConfig } from './configValidator.js';
import { createDirectoryStructure } from './directoryUtils.js';
import { processBatches } from './batchProcessor.js';
import { generateMarkdownOutput } from './outputGenerator.js';

// Cache for source code content, primarily for function call graph generation
const sourceCodeCache = new Map<string, string>();

// Functions for testing and cache management
export function clearCodeMapCaches(): void {
  sourceCodeCache.clear();
  clearCaches();
}

export function getCodeMapCacheSizes(): { sourceCodeCache: number } {
  return {
    sourceCodeCache: sourceCodeCache.size
  };
}

// No longer using user-authorized directories - only CWD is allowed

// Removed unused function: normalizePath

// Removed unused function: isPathWithin



// Removed unused functions: isDirectoryAllowed and findDirectoryByName





// Epic1-Task006: Define the input schema shape for the tool.
const codeMapInputSchemaShape = {
  ignored_files_patterns: z.array(z.string()).optional().describe("Optional array of glob patterns for files/directories to ignore."),
  output_format: z.enum(['markdown', 'json']).optional().default('markdown').describe("Format for the output (json not yet implemented)."),
};

// Epic1-Task007: Define the asynchronous executor function stub for the tool.
export const codeMapExecutor: ToolExecutor = async (params, _config, context) => {
  console.time('CodeMapGenerator_Total'); // Profiling Start: Total

  // Get session ID from context
  const sessionId = context?.sessionId || 'unknown-session';
  const transportType = context?.transportType || 'unknown';
  logger.debug({ toolName: 'map-codebase', params, sessionId, transportType }, 'Code-Map Generator invoked.');

  // Create a job for tracking progress
  const jobId = jobManager.createJob('map-codebase', params);
  logger.info({ jobId, sessionId }, 'Created job for code-map-generator');

  // For long-running operations, return a job initiation response immediately
  // This allows the client to poll for updates using get-job-result
  if (transportType === 'stdio' || sessionId === 'stdio-session') {
    // For stdio transport, return a job initiation response
    const initiationResponse = formatBackgroundJobInitiationResponse(
      jobId,
      'map-codebase',
      'Code map generation started. Use get-job-result to check status and retrieve the final result.',
      { sessionId, transportType }
    );

    // Execute the actual work in the background
    setTimeout(() => {
      executeCodeMapGeneration(params, _config, context, jobId)
        .catch(error => {
          logger.error({ err: error, jobId }, 'Error in background code map generation');
          jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);
          sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);
        });
    }, 0);

    return initiationResponse;
  }

  // For SSE transport, execute synchronously and send progress updates
  return executeCodeMapGeneration(params, _config, context, jobId);
};

// Extract the main logic to a separate function that can be called either synchronously or asynchronously
export async function executeCodeMapGeneration(
params: Record<string, unknown>,
_config: OpenRouterConfig,
context: ToolExecutionContext | undefined,
jobId: string
): Promise<CallToolResult> {
const sessionId = context?.sessionId || 'unknown-session';
console.time('CodeMapGenerator_Total'); // Profiling Start: Total

try {
  try {
    // Send initial progress update
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting code map generation...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting code map generation...');

    // Extract and validate configuration
    let config: CodeMapGeneratorConfig;
    try {
      config = await extractCodeMapConfig(_config);
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract configuration');

      // Update job status to failed
      jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Configuration error: ${error instanceof Error ? error.message : String(error)}`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Configuration error: ${error instanceof Error ? error.message : String(error)}`);

      // Set job result
      const errorResult = {
        content: [{
          type: 'text' as const,
          text: `Configuration error: ${error instanceof Error ? error.message : String(error)}\n\nPlease ensure that 'allowedMappingDirectory' is configured in the tool configuration.`
        }],
        isError: true
      };

      jobManager.setJobResult(jobId, errorResult);
      return errorResult;
    }

    // Parse and validate the input parameters
    const validatedParams = z.object(codeMapInputSchemaShape).parse(params);

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initializing directory structure...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initializing directory structure...', 5);

    // Create directory structure
    const directoryStructure = await createDirectoryStructure(config, jobId);
    logger.debug(`Created directory structure: ${JSON.stringify(directoryStructure)}`);

    // Initialize caches
    if (config.cache?.enabled !== false) {
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initializing caches...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initializing caches...', 10);

      await initializeCaches(config);
      logger.debug('Initialized file-based caches');
    } else {
      logger.debug('File-based caching is disabled');
    }

    // Verify the allowed mapping directory exists and is readable
    try {
      await fs.access(config.allowedMappingDirectory, fsSync.constants.R_OK);
      logger.debug(`Verified allowed mapping directory exists and is readable: ${config.allowedMappingDirectory}`);
    } catch (error) {
      logger.error(`Cannot access allowed mapping directory: ${config.allowedMappingDirectory}. Error: ${error instanceof Error ? error.message : String(error)}`);

      // Update job status to failed
      jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Cannot access allowed mapping directory: ${config.allowedMappingDirectory}`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Cannot access allowed mapping directory: ${config.allowedMappingDirectory}`);

      // Set job result
      const errorResult = {
        content: [{
          type: 'text' as const,
          text: `Cannot access allowed mapping directory: ${config.allowedMappingDirectory}. Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };

      jobManager.setJobResult(jobId, errorResult);
      return errorResult;
    }

    // Use the allowed mapping directory as the project root
    const projectRoot = config.allowedMappingDirectory;

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initializing parser...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initializing parser...');

    console.time('CodeMapGenerator_Initialization'); // Profiling Start: Initialization
    await initializeParser(); // This now includes grammar manager initialization with preloading
    logger.info('Parser and memory management initialized.');

    // Log initial memory usage statistics
    const initialMemoryStats = getMemoryStats();
    logger.info({ initialMemoryStats }, 'Initial memory usage statistics');

    console.timeEnd('CodeMapGenerator_Initialization'); // Profiling End: Initialization

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Preparing file scanning...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Preparing file scanning...');

    const supportedExtensions = Object.keys(languageConfigurations);

    // Enhanced ignoredPatterns
    // Convert glob patterns to valid RegExp patterns
    const userIgnoredPatterns = validatedParams.ignored_files_patterns?.map(pattern => {
      try {
        // Convert glob-like pattern to a valid regex pattern
        // Replace ** with a placeholder, escape regex special chars, then restore ** as .*
        const regexPattern = pattern
          .replace(/\*\*/g, '___DOUBLE_STAR___')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/___DOUBLE_STAR___/g, '.*')
          .replace(/\*/g, '[^/]*');

        logger.debug(`Converted pattern "${pattern}" to regex: "${regexPattern}"`);
        return new RegExp(regexPattern, 'i');
      } catch (error) {
        logger.warn(`Invalid pattern "${pattern}" - skipping. Error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }).filter(Boolean) || [];

    const defaultIgnoredPatterns = [
        /node_modules/i, /\.git/i, /dist/i, /build/i, /out/i, /coverage/i, /vendor/i,
        /\.(log|lock|env|bak|tmp|swp|DS_Store|map)$/i, /.*\/\..*/, /^\..*/,
        /(?:^|[/\\])__(tests|mocks|snapshots)__[/\\]/i, /(?:^|[/\\])(test|tests)[/\\]/i,
        /\.min\.(js|css)$/i, /package-lock\.json/i, /yarn\.lock/i,
        /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp3|mp4|webm|ogg|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz|rar|7z|exe|dll|bin|obj|o|iso|dmg|pdb|bak)$/i,
    ];

    // Ensure all patterns are RegExp objects (TypeScript type safety)
    const combinedIgnoredPatterns: RegExp[] = [...defaultIgnoredPatterns, ...userIgnoredPatterns as RegExp[]];
    logger.debug(`Using ${combinedIgnoredPatterns.length} ignore patterns (${userIgnoredPatterns.length} user-defined, ${defaultIgnoredPatterns.length} default)`);

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Scanning for source files...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Scanning for source files...');

    console.time('CodeMapGenerator_FileScanning'); // Profiling Start: FileScanning
    logger.info(`Scanning for source files in: ${projectRoot}`);
    const filePaths = await collectSourceFiles(projectRoot, supportedExtensions, combinedIgnoredPatterns, config);
    console.timeEnd('CodeMapGenerator_FileScanning'); // Profiling End: FileScanning

    // Log memory usage after file scanning
    const postScanningMemoryStats = getMemoryStats();
    logger.info({ postScanningMemoryStats }, 'Memory usage after file scanning');

    if (filePaths.length === 0) {
      // Update job status to completed (but with no files)
      jobManager.updateJobStatus(jobId, JobStatus.COMPLETED, 'No files found');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'No files found');

      // Set job result
      const noFilesResult = {
        content: [{
          type: 'text' as const,
          text: 'No supported source files found to map in the specified path after applying ignore patterns.'
        }],
        isError: false
      };

      jobManager.setJobResult(jobId, noFilesResult);
      return noFilesResult;
    }

    // Update job status with file count
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Found ${filePaths.length} source files. Parsing files...`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Found ${filePaths.length} source files. Parsing files...`, 30);

    logger.info(`Found ${filePaths.length} source files to process.`);

    // Process files in batches using the new batch processor
    console.time('CodeMapGenerator_ParsingAndSymbolExtraction'); // Profiling Start: ParsingAndSymbolExtraction

    // Define the file processing function
    const processFile = async (filePath: string): Promise<FileInfo> => {
      const relativePath = path.relative(projectRoot, filePath);

      try {
        // Use the new readAndParseFile function
        const { tree, sourceCode } = await readAndParseFile(filePath, path.extname(filePath).toLowerCase(), config);

        // Store source code in cache for function call graph generation
        // Note: sourceCodeCache is now handled internally by the parser

        if (!tree) {
          logger.warn(`No parser or parsing failed for ${filePath}, creating basic FileInfo.`);
          return {
            filePath,
            relativePath,
            classes: [],
            functions: [],
            imports: [],
            comment: `File type ${path.extname(filePath).toLowerCase()} not fully supported for deep AST analysis.`,
          };
        }

        const languageId = path.extname(filePath).toLowerCase();
        const functions = extractFunctions(tree.rootNode, sourceCode, languageId);
        const classes = extractClasses(tree.rootNode, sourceCode, languageId);
        const imports = extractImports(tree.rootNode, sourceCode, languageId);

        let fileLevelComment: string | undefined;
        const firstChildNode = tree.rootNode.firstChild;
        if (firstChildNode?.type === 'comment' && firstChildNode.text.startsWith('/**')) {
          fileLevelComment = getNodeText(firstChildNode, sourceCode).substring(3).split('*/')[0].trim().split('\n')[0];
        } else if (firstChildNode?.type === 'comment' && (firstChildNode.text.startsWith('//') || firstChildNode.text.startsWith('#'))) {
          fileLevelComment = getNodeText(firstChildNode, sourceCode).substring(firstChildNode.text.startsWith('//') ? 2 : 1).trim();
        }

        return {
          filePath,
          relativePath,
          classes,
          functions,
          imports,
          comment: fileLevelComment || generateHeuristicComment(path.basename(relativePath), 'file'),
        };
      } catch (error) {
        logger.error({ err: error, filePath }, `Failed to process file.`);
        return {
          filePath,
          relativePath,
          classes: [],
          functions: [],
          imports: [],
          comment: `Error processing file: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    };

    // Process files in batches
    const allFileInfos = await processBatches(
      filePaths as string[],
      processFile,
      config,
      jobId,
      sessionId,
      'Parsing files',
      30,
      60
    );

    console.timeEnd('CodeMapGenerator_ParsingAndSymbolExtraction'); // Profiling End: ParsingAndSymbolExtraction

    // Log memory usage after parsing and symbol extraction
    const postParsingMemoryStats = getMemoryStats();
    logger.info({ postParsingMemoryStats }, 'Memory usage after parsing and symbol extraction');

    // Sort files by relative path
    allFileInfos.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    // Update job status for graph building
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Building dependency graphs...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Building dependency graphs...', 60);

    // Construct CodeMap object for the formatter
    const codeMapData: CodeMap = { projectPath: projectRoot, files: allFileInfos };

    console.time('CodeMapGenerator_GraphBuilding'); // Profiling Start: GraphBuilding

    // Build graphs with intermediate storage
    const fileDepGraph = await buildFileDependencyGraph(allFileInfos, config, jobId);
    const classInheritanceGraph = await buildClassInheritanceGraph(allFileInfos, config, jobId);

    // Create a temporary Map for sourceCodeCache to maintain compatibility
    const tempSourceCodeCache = new Map<string, string>();

    // Populate the temporary Map with source code from files
    for (const fileInfo of allFileInfos) {
      try {
        // First try to get source code from cache
        const cachedSourceCode = getSourceCodeFromCache(fileInfo.filePath);
        if (cachedSourceCode) {
          tempSourceCodeCache.set(fileInfo.filePath, cachedSourceCode);
        } else {
          // If not in cache, read and parse the file
          const { sourceCode } = await readAndParseFile(fileInfo.filePath, path.extname(fileInfo.filePath).toLowerCase(), config);
          if (sourceCode) {
            tempSourceCodeCache.set(fileInfo.filePath, sourceCode);
          }
        }
      } catch (error) {
        logger.warn(`Could not read source code for ${fileInfo.filePath}: ${error}`);
      }
    }

    const functionCallGraph = await buildFunctionCallGraph(allFileInfos, tempSourceCodeCache, config, jobId);

    const fileDepNodes = fileDepGraph.nodes;
    const fileDepEdges = fileDepGraph.edges;
    const classInheritanceNodes = classInheritanceGraph.nodes;
    const classInheritanceEdges = classInheritanceGraph.edges;
    const funcCallNodes = functionCallGraph.nodes;
    const funcCallEdges = functionCallGraph.edges;

    console.timeEnd('CodeMapGenerator_GraphBuilding'); // Profiling End: GraphBuilding

    // Log memory usage after graph building
    const postGraphBuildingMemoryStats = getMemoryStats();
    logger.info({ postGraphBuildingMemoryStats }, 'Memory usage after graph building');

    // Update job status for diagram generation
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating diagrams...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating diagrams...', 70);

    console.time('CodeMapGenerator_DiagramGeneration'); // Profiling Start: DiagramGeneration

    // Generate file dependency diagram
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating file dependency diagram...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating file dependency diagram...', 70);
    const fileDepDiagramMd = generateMermaidFileDependencyDiagram(fileDepNodes, fileDepEdges);

    // Generate class diagram
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating class inheritance diagram...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating class inheritance diagram...', 75);
    const classDiagramMd = generateMermaidClassDiagram(
        classInheritanceNodes,
        classInheritanceEdges,
        allFileInfos.flatMap(fi => fi.classes) // Pass all ClassInfo objects
    );

    // Generate function call diagram
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating function call diagram...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating function call diagram...', 80);
    const funcCallDiagramMd = generateMermaidFunctionCallDiagram(funcCallNodes, funcCallEdges);

    // Generate sequence diagram
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating sequence diagram...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating sequence diagram...', 85);
    // Use the same function call graph nodes and edges for sequence diagram
    // The sequence diagram generator uses the same nodes and edges as the function call graph
    const sequenceDiagramMd = generateMermaidSequenceDiagram(funcCallNodes, funcCallEdges);

    console.timeEnd('CodeMapGenerator_DiagramGeneration'); // Profiling End: DiagramGeneration

    // Log memory usage after diagram generation
    const postDiagramGenerationMemoryStats = getMemoryStats();
    logger.info({ postDiagramGenerationMemoryStats }, 'Memory usage after diagram generation');

    // Update job status for output generation
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating output...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating output...', 80);

    console.time('CodeMapGenerator_OutputGeneration'); // Profiling Start: OutputGeneration

    // Generate output using the new output generator
    const outputPath = await generateMarkdownOutput(
      allFileInfos,
      fileDepGraph,
      classInheritanceGraph,
      functionCallGraph,
      config,
      jobId
    );

    console.timeEnd('CodeMapGenerator_OutputGeneration'); // Profiling End: OutputGeneration

    // Log memory usage after output generation
    const postOutputGenerationMemoryStats = getMemoryStats();
    logger.info({ postOutputGenerationMemoryStats }, 'Memory usage after output generation');

    // For backward compatibility, also generate the old-style output
    console.time('CodeMapGenerator_OutputFormatting'); // Profiling Start: OutputFormatting

    // Call formatCodeMapToMarkdown
    const textualCodeMapMd = formatCodeMapToMarkdown(codeMapData, projectRoot);

    // Assemble final Markdown output
    const successfullyProcessedCount = allFileInfos.filter(fi => !(fi.comment && fi.comment.startsWith("Error processing file"))).length;
    const filesWithErrorsCount = allFileInfos.length - successfullyProcessedCount;

    let finalMarkdownOutput = `## Codebase Overview for ${path.basename(projectRoot)}\n\n`;
    finalMarkdownOutput += `**Summary:** Processed ${allFileInfos.length} files. Successfully analyzed: ${successfullyProcessedCount}. Files with errors/skipped: ${filesWithErrorsCount}.\n\n`;
    finalMarkdownOutput += `**Output saved to:** ${outputPath}\n\n`;

    if (fileDepEdges.length > 0 || fileDepNodes.length > 0) {
      finalMarkdownOutput += `### File Dependency Graph\n\n\`\`\`mermaid\n${fileDepDiagramMd}\n\`\`\`\n\n`;
    }
    if (classInheritanceEdges.length > 0 || classInheritanceNodes.length > 0) {
      finalMarkdownOutput += `### Class Inheritance Diagram\n\n\`\`\`mermaid\n${classDiagramMd}\n\`\`\`\n\n`;
    }
    if (funcCallEdges.length > 0 || funcCallNodes.length > 0) {
      finalMarkdownOutput += `### Function Call Map (Heuristic)\n\n\`\`\`mermaid\n${funcCallDiagramMd}\n\`\`\`\n\n`;

      // Add sequence diagram (already generated earlier)
      finalMarkdownOutput += `### Method Call Sequence Diagram\n\n\`\`\`mermaid\n${sequenceDiagramMd}\n\`\`\`\n\n`;
    }
    finalMarkdownOutput += `## Detailed Code Structure\n\n${textualCodeMapMd}`;
    console.timeEnd('CodeMapGenerator_OutputFormatting'); // Profiling End: OutputFormatting

    // Log memory usage after output formatting
    const postOutputFormattingMemoryStats = getMemoryStats();
    logger.info({ postOutputFormattingMemoryStats }, 'Memory usage after output formatting');

    // Call optimizeMarkdownOutput
    const optimizedOutput = optimizeMarkdownOutput(finalMarkdownOutput);

    // Update job status to completed
    jobManager.updateJobStatus(jobId, JobStatus.COMPLETED, 'Code map generation complete');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Code map generation complete', 100);

    // Log final memory usage statistics
    const finalMemoryStats = getMemoryStats();
    logger.info({ finalMemoryStats }, 'Final memory usage statistics');

    logger.info({ toolName: 'map-codebase', path: projectRoot, sessionId, successfullyProcessedCount, filesWithErrorsCount }, "Code map generated.");

    // Set job result
    const result = {
      content: [{ type: 'text' as const, text: optimizedOutput }],
      isError: false,
    };

    jobManager.setJobResult(jobId, result);
    return result;
  } catch (error) {
    // Update job status to failed
    jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);

    // Log memory usage statistics on error
    try {
      const errorMemoryStats = getMemoryStats();
      logger.info({ errorMemoryStats }, 'Memory usage statistics at error');
    } catch (memoryError) {
      logger.warn(`Failed to get memory statistics: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}`);
    }

    logger.error({ err: error, toolName: 'map-codebase', params, sessionId, jobId }, 'Error in Code-Map Generator');
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Set job result
    const errorResult = {
      content: [{ type: 'text' as const, text: `Error generating code map: ${errorMessage}` }],
      isError: true,
    };

    jobManager.setJobResult(jobId, errorResult);
    return errorResult;
  }
} finally {
  console.timeEnd('CodeMapGenerator_Total'); // Ensure total time is logged

  // Clean up resources
  try {
    // Log memory usage statistics
    const memoryStats = getMemoryStats();
    logger.info({ memoryStats }, 'Memory usage statistics');

    // Get memory manager for additional cleanup if needed
    const memManager = getMemoryManager();
    if (memManager) {
      logger.debug('Memory manager found, performing additional cleanup');
      // Additional cleanup can be performed here if needed
    }

    // Close all caches
    await clearCaches();
    logger.debug('Closed all file-based caches');
  } catch (error) {
    logger.warn(`Error closing caches: ${error instanceof Error ? error.message : String(error)}`);
  }
}
}

// Epic1-Task008: Define the ToolDefinition object for the "Code-Map Generator".
const codeMapToolDefinition: ToolDefinition = {
  name: "map-codebase", // Chosen name for CLI invocation and semantic routing
  description: "Recursively scans a target codebase, extracts semantic information (classes, functions, doc-strings, comments), and generates a token-efficient, context-dense Markdown index and Mermaid diagrams. For security reasons, the tool only scans directories specified in the 'allowedMappingDirectory' configuration. This directory must be explicitly configured in the tool configuration to ensure secure access boundaries.",
  inputSchema: codeMapInputSchemaShape,
  executor: codeMapExecutor,
};

// Epic1-Task009: Call registerTool to register the tool definition.
registerTool(codeMapToolDefinition);

logger.info('Code-Map Generator tool registered.');