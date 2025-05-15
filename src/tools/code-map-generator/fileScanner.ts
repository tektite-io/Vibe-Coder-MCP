import fs from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';

/**
 * Recursively collects source file paths from a directory, adhering to supported extensions and ignore patterns.
 * @param rootDir The root directory to scan.
 * @param supportedExtensions An array of file extensions to include (e.g., ['.js', '.ts', '.py']).
 * @param ignoredPatterns An array of RegExp patterns for paths to ignore.
 * @returns A promise that resolves to an array of collected file paths.
 */
export async function collectSourceFiles(
  rootDir: string,
  supportedExtensions: string[], // e.g., ['.js', '.ts', '.py']
  ignoredPatterns: RegExp[] // e.g., [/node_modules/, /\.git/, /dist/]
): Promise<string[]> {
  const collectedFiles: string[] = [];
  const normalizedRootDir = path.resolve(rootDir);

  async function scanDir(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        const relativeEntryPath = path.relative(normalizedRootDir, entryPath); // For consistent ignore pattern testing

        if (ignoredPatterns.some(pattern => pattern.test(relativeEntryPath)) || ignoredPatterns.some(pattern => pattern.test(entry.name))) {
          logger.debug(`Ignoring path: ${entryPath} due to ignore patterns.`);
          continue;
        }

        if (entry.isDirectory()) {
          await scanDir(entryPath);
        } else if (entry.isFile()) {
          const fileExtension = path.extname(entryPath).toLowerCase();
          if (supportedExtensions.includes(fileExtension)) {
            collectedFiles.push(path.resolve(entryPath)); // Store absolute paths
          }
        }
        // Note: Symbolic links are currently followed if they point to a directory or a supported file.
        // Consider adding specific handling for symlinks if needed (e.g., entry.isSymbolicLink()).
      }
    } catch (error) {
      // Log error with more specific details if available
      const errDetails = error instanceof Error ? { message: error.message, stack: error.stack } : { errorInfo: String(error) };
      logger.warn({ err: errDetails, path: currentPath }, `Could not read directory, skipping.`);
    }
  }

  await scanDir(normalizedRootDir);
  logger.info(`Collected ${collectedFiles.length} files from ${normalizedRootDir}.`);
  return collectedFiles;
}
