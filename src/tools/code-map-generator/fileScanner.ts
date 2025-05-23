import fs from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
import { validatePathSecurity, createSecurePath, isPathWithin } from './pathUtils.js';
import { readDirSecure, statSecure } from './fsUtils.js';
import { CodeMapGeneratorConfig } from './types.js';
import { splitIntoBatches } from './batchProcessor.js';
import { createIncrementalProcessor, IncrementalProcessor } from './incrementalProcessor.js';

const MAX_SCAN_DEPTH = 25; // Define a maximum recursion depth

/**
 * Recursively collects source file paths from a directory, adhering to supported extensions and ignore patterns.
 * Uses secure path validation to ensure all accessed paths are within the allowed directory.
 *
 * @param rootDir The root directory to scan.
 * @param supportedExtensions An array of file extensions to include (e.g., ['.js', '.ts', '.py']).
 * @param ignoredPatterns An array of RegExp patterns for paths to ignore.
 * @param config The Code-Map Generator configuration.
 * @param returnBatches Whether to return files in batches (default: false).
 * @returns A promise that resolves to an array of collected file paths or batches of file paths.
 */
export async function collectSourceFiles(
  rootDir: string,
  supportedExtensions: string[], // e.g., ['.js', '.ts', '.py']
  ignoredPatterns: RegExp[], // e.g., [/node_modules/, /\.git/, /dist/]
  config: CodeMapGeneratorConfig,
  returnBatches: boolean = false
): Promise<string[] | string[][]> {
  const collectedFiles: string[] = [];

  // Validate the root directory against the allowed mapping directory
  const validationResult = validatePathSecurity(rootDir, config.allowedMappingDirectory);
  if (!validationResult.isValid) {
    logger.error(`Security violation: ${validationResult.error}`);
    return []; // Return empty array if directory is outside allowed boundary
  }

  // Get the secure path
  const securePath = createSecurePath(rootDir, config.allowedMappingDirectory);

  // Ensure rootDir exists and is accessible
  try {
    await statSecure(securePath, config.allowedMappingDirectory);
    logger.debug(`Directory exists and is readable: ${securePath}`);
  } catch (error) {
    logger.error(`Cannot access directory: ${securePath}. Error: ${error instanceof Error ? error.message : String(error)}`);
    return []; // Return empty array if directory doesn't exist or can't be accessed
  }

  logger.debug(`Normalized root directory: ${securePath}`);
  logger.debug(`Looking for files with extensions: ${supportedExtensions.join(', ')}`);

  // Initialize incremental processor if enabled
  let incrementalProcessor: IncrementalProcessor | null = null;
  if (config.processing?.incremental) {
    incrementalProcessor = await createIncrementalProcessor(config);
    logger.info(`Incremental processing ${incrementalProcessor ? 'enabled' : 'disabled'}`);
  }

  const visitedSymlinks = new Set<string>(); // To prevent symlink loops

  async function scanDir(currentPath: string, currentDepth: number) {
    if (currentDepth > MAX_SCAN_DEPTH) {
      logger.warn(`Reached maximum scan depth of ${MAX_SCAN_DEPTH} at ${currentPath}. Skipping further recursion in this branch.`);
      return;
    }

    // Validate the current path against the allowed mapping directory
    if (!isPathWithin(currentPath, config.allowedMappingDirectory)) {
      logger.warn(`Security boundary violation: ${currentPath} is outside of allowed directory ${config.allowedMappingDirectory}. Skipping.`);
      return;
    }

    try {
      // Use secure directory reading
      const entries = await readDirSecure(currentPath, config.allowedMappingDirectory);

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);

        // Validate the entry path
        if (!isPathWithin(entryPath, config.allowedMappingDirectory)) {
          logger.warn(`Security boundary violation: ${entryPath} is outside of allowed directory ${config.allowedMappingDirectory}. Skipping.`);
          continue;
        }

        const relativeEntryPath = path.relative(securePath, entryPath); // For consistent ignore pattern testing

        if (ignoredPatterns.some(pattern => pattern.test(relativeEntryPath)) || ignoredPatterns.some(pattern => pattern.test(entry.name))) {
          logger.debug(`Ignoring path: ${entryPath} due to ignore patterns.`);
          continue;
        }

        if (entry.isSymbolicLink()) {
          try {
            // Resolve the symlink securely
            const realPath = await fs.realpath(entryPath);

            // Validate the resolved path
            if (!isPathWithin(realPath, config.allowedMappingDirectory)) {
              logger.warn(`Security boundary violation: Symlink ${entryPath} resolves to ${realPath} which is outside of allowed directory ${config.allowedMappingDirectory}. Skipping.`);
              continue;
            }

            if (visitedSymlinks.has(realPath)) {
              logger.warn(`Detected symlink loop or already visited symlink: ${entryPath} -> ${realPath}. Skipping.`);
              continue;
            }

            visitedSymlinks.add(realPath);

            // After resolving symlink, get its stats to determine if it's a directory or file
            const targetStats = await statSecure(entryPath, config.allowedMappingDirectory); // stat follows the link

            if (targetStats.isDirectory()) {
              await scanDir(entryPath, currentDepth + 1); // Scan the directory the symlink points to
            } else if (targetStats.isFile()) {
              const fileExtension = path.extname(entryPath).toLowerCase();
              if (supportedExtensions.includes(fileExtension)) {
                collectedFiles.push(entryPath);
              }
            }
          } catch (error) {
            logger.warn(`Error processing symlink ${entryPath}: ${error instanceof Error ? error.message : String(error)}. Skipping.`);
          }
          continue; // Done with symlink
        }

        if (entry.isDirectory()) {
          await scanDir(entryPath, currentDepth + 1);
        } else if (entry.isFile()) {
          const fileExtension = path.extname(entryPath).toLowerCase();
          if (supportedExtensions.includes(fileExtension)) {
            collectedFiles.push(entryPath); // Store absolute paths
          }
        }
      }
    } catch (error) {
      const errDetails = error instanceof Error ? { message: error.message, stack: error.stack } : { errorInfo: String(error) };
      logger.warn({ err: errDetails, path: currentPath }, `Could not read directory, skipping.`);
    }
  }

  await scanDir(securePath, 0); // Start scanning with depth 0

  // Clear the visitedSymlinks set to prevent memory leaks
  const symlinksCount = visitedSymlinks.size;
  visitedSymlinks.clear();

  logger.info(`Collected ${collectedFiles.length} files from ${securePath}. Cleared ${symlinksCount} symlink entries.`);

  // Filter files using incremental processor if enabled
  let filesToProcess = collectedFiles;
  if (incrementalProcessor && collectedFiles.length > 0) {
    logger.info('Filtering files using incremental processor...');
    filesToProcess = await incrementalProcessor.filterChangedFiles(collectedFiles);

    // Update metadata for files that will be processed
    for (const filePath of filesToProcess) {
      await incrementalProcessor.updateFileMetadata(filePath);
    }

    logger.info(`Incremental processing: ${filesToProcess.length} of ${collectedFiles.length} files need processing`);
  }

  // Return files in batches if requested
  if (returnBatches && filesToProcess.length > 0) {
    const batchSize = config.processing?.batchSize || 100;
    const batches = splitIntoBatches(filesToProcess, batchSize);
    logger.info(`Split ${filesToProcess.length} files into ${batches.length} batches (batch size: ${batchSize})`);
    return batches;
  }

  return filesToProcess;
}
