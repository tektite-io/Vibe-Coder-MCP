#!/usr/bin/env node

/**
 * CLI tool for managing the code-map-generator file-based cache.
 *
 * Usage:
 *   node cache-cli.js <command> [options]
 *
 * Commands:
 *   stats    - Show cache statistics
 *   clear    - Clear the entire cache
 *   prune    - Remove old cache entries
 *   validate - Validate the cache integrity
 *
 * Options:
 *   --config <path>  - Path to the configuration file
 *   --cache-dir <path> - Path to the cache directory (overrides config)
 *   --verbose        - Show verbose output
 */

import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { program } from 'commander';
import logger from '../../logger.js';
import { CodeMapGeneratorConfig } from './types.js';
import { extractCodeMapConfig } from './configValidator.js';
import { initializeCaches, clearCaches } from './parser.js';
import { createDirectoryStructure } from './directoryUtils.js';

// Configure the CLI
program
  .name('cache-cli')
  .description('CLI tool for managing the code-map-generator file-based cache')
  .version('1.0.0');

// Add commands
program
  .command('stats')
  .description('Show cache statistics')
  .option('-c, --config <path>', 'Path to the configuration file')
  .option('-d, --cache-dir <path>', 'Path to the cache directory (overrides config)')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (options: { config?: string; cacheDir?: string; verbose?: boolean }) => {
    try {
      const config = await loadConfig(options);
      const stats = await getCacheStats(config);
      displayStats(stats, options.verbose || false);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('clear')
  .description('Clear the entire cache')
  .option('-c, --config <path>', 'Path to the configuration file')
  .option('-d, --cache-dir <path>', 'Path to the cache directory (overrides config)')
  .option('-f, --force', 'Force clearing without confirmation')
  .action(async (options: { config?: string; cacheDir?: string; force?: boolean }) => {
    try {
      const config = await loadConfig(options);
      await clearCache(config, options.force || false);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('prune')
  .description('Remove old cache entries')
  .option('-c, --config <path>', 'Path to the configuration file')
  .option('-d, --cache-dir <path>', 'Path to the cache directory (overrides config)')
  .option('-a, --age <days>', 'Maximum age in days (default: 7)', '7')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (options: { config?: string; cacheDir?: string; age?: string; verbose?: boolean }) => {
    try {
      const config = await loadConfig(options);
      const maxAge = parseInt(options.age || '7') * 24 * 60 * 60 * 1000; // Convert days to milliseconds
      await pruneCache(config, maxAge, options.verbose || false);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('validate')
  .description('Validate the cache integrity')
  .option('-c, --config <path>', 'Path to the configuration file')
  .option('-d, --cache-dir <path>', 'Path to the cache directory (overrides config)')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (options: { config?: string; cacheDir?: string; verbose?: boolean }) => {
    try {
      const config = await loadConfig(options);
      await validateCache(config, options.verbose || false);
    } catch (error) {
      handleError(error);
    }
  });

// Helper functions
async function loadConfig(options: { config?: string; cacheDir?: string; [key: string]: any }): Promise<CodeMapGeneratorConfig> {
  let config: CodeMapGeneratorConfig;

  if (options.config) {
    // Load config from file
    try {
      const configFile = await fs.readFile(options.config, 'utf-8');
      const configJson = JSON.parse(configFile);
      config = await extractCodeMapConfig(configJson);
    } catch (error) {
      throw new Error(`Failed to load configuration from ${options.config}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Use default config
    config = {
      allowedMappingDirectory: process.cwd(),
      cache: {
        enabled: true,
        maxEntries: 10000,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      }
    };
  }

  // Override cache directory if specified
  if (options.cacheDir) {
    if (!config.cache) {
      config.cache = { enabled: true };
    }
    config.cache.cacheDir = options.cacheDir;
  }

  return config;
}

async function getCacheStats(config: CodeMapGeneratorConfig): Promise<CacheStats> {
  // Initialize caches to ensure directory structure exists
  await initializeCaches(config);

  // Get directory structure
  const dirStructure = await createDirectoryStructure(config, 'cache-cli');
  const cacheDir = dirStructure.cacheDir;

  // Get stats for each subdirectory
  const stats: CacheStats = {
    totalSize: 0,
    totalFiles: 0,
    directories: {}
  };

  // Check if cache directory exists
  try {
    await fs.access(cacheDir);
  } catch (error) {
    return stats; // Return empty stats if directory doesn't exist
  }

  // Get subdirectories
  const subdirs = await fs.readdir(cacheDir, { withFileTypes: true });

  for (const dirent of subdirs) {
    if (dirent.isDirectory()) {
      const subdirPath = path.join(cacheDir, dirent.name);
      const subdirStats = await getDirectoryStats(subdirPath);
      stats.directories[dirent.name] = subdirStats;
      stats.totalSize += subdirStats.size;
      stats.totalFiles += subdirStats.files;
    }
  }

  return stats;
}

async function getDirectoryStats(dirPath: string): Promise<DirStats> {
  const stats: DirStats = {
    size: 0,
    files: 0
  };

  // Check if directory exists
  try {
    await fs.access(dirPath);
  } catch (error) {
    return stats; // Return empty stats if directory doesn't exist
  }

  // Get files in directory
  const files = await fs.readdir(dirPath, { withFileTypes: true });

  for (const file of files) {
    if (file.isFile()) {
      const filePath = path.join(dirPath, file.name);
      const fileStat = await fs.stat(filePath);

      stats.size += fileStat.size;
      stats.files += 1;

      if (!stats.oldest || fileStat.mtime < stats.oldest.mtime) {
        stats.oldest = {
          file: file.name,
          mtime: fileStat.mtime
        };
      }

      if (!stats.newest || fileStat.mtime > stats.newest.mtime) {
        stats.newest = {
          file: file.name,
          mtime: fileStat.mtime
        };
      }
    } else if (file.isDirectory()) {
      // Recursively get stats for subdirectories
      const subdirStats = await getDirectoryStats(path.join(dirPath, file.name));
      stats.size += subdirStats.size;
      stats.files += subdirStats.files;

      if (subdirStats.oldest && (!stats.oldest || subdirStats.oldest.mtime < stats.oldest.mtime)) {
        stats.oldest = subdirStats.oldest;
      }

      if (subdirStats.newest && (!stats.newest || subdirStats.newest.mtime > stats.newest.mtime)) {
        stats.newest = subdirStats.newest;
      }
    }
  }

  return stats;
}

interface DirStats {
  size: number;
  files: number;
  oldest?: { file: string; mtime: Date };
  newest?: { file: string; mtime: Date };
}

interface CacheStats {
  totalSize: number;
  totalFiles: number;
  directories: Record<string, DirStats>;
}

function displayStats(stats: CacheStats, verbose: boolean): void {
  console.log('Cache Statistics:');
  console.log(`Total Size: ${formatSize(stats.totalSize)}`);
  console.log(`Total Files: ${stats.totalFiles}`);

  if (verbose) {
    console.log('\nDirectory Breakdown:');
    for (const [dir, dirStats] of Object.entries(stats.directories)) {
      console.log(`\n${dir}:`);
      console.log(`  Size: ${formatSize(dirStats.size)}`);
      console.log(`  Files: ${dirStats.files}`);

      if (dirStats.oldest) {
        console.log(`  Oldest File: ${dirStats.oldest.file} (${formatDate(dirStats.oldest.mtime)})`);
      }

      if (dirStats.newest) {
        console.log(`  Newest File: ${dirStats.newest.file} (${formatDate(dirStats.newest.mtime)})`);
      }
    }
  }
}

async function clearCache(config: CodeMapGeneratorConfig, force: boolean): Promise<void> {
  if (!force) {
    console.log('This will clear the entire cache. Are you sure? (y/n)');
    const answer = await new Promise<string>((resolve) => {
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim().toLowerCase());
      });
    });

    if (answer !== 'y' && answer !== 'yes') {
      console.log('Operation cancelled.');
      return;
    }
  }

  await clearCaches();
  console.log('Cache cleared successfully.');
}

async function pruneCache(config: CodeMapGeneratorConfig, maxAge: number, verbose: boolean): Promise<void> {
  // Initialize caches to ensure directory structure exists
  await initializeCaches(config);

  // Get directory structure
  const dirStructure = await createDirectoryStructure(config, 'cache-cli');
  const cacheDir = dirStructure.cacheDir;

  // Check if cache directory exists
  try {
    await fs.access(cacheDir);
  } catch (error) {
    console.log('Cache directory does not exist.');
    return;
  }

  const now = Date.now();
  let prunedFiles = 0;
  let prunedSize = 0;

  // Prune files recursively
  async function pruneDirectory(dirPath: string): Promise<void> {
    const files = await fs.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);

      if (file.isFile()) {
        const fileStat = await fs.stat(filePath);

        if (now - fileStat.mtimeMs > maxAge) {
          if (verbose) {
            console.log(`Pruning: ${filePath}`);
          }

          prunedSize += fileStat.size;
          prunedFiles += 1;

          await fs.unlink(filePath);
        }
      } else if (file.isDirectory()) {
        await pruneDirectory(filePath);

        // Remove empty directories
        const remainingFiles = await fs.readdir(filePath);
        if (remainingFiles.length === 0) {
          if (verbose) {
            console.log(`Removing empty directory: ${filePath}`);
          }

          await fs.rmdir(filePath);
        }
      }
    }
  }

  await pruneDirectory(cacheDir);

  console.log(`Pruned ${prunedFiles} files (${formatSize(prunedSize)}).`);
}

async function validateCache(config: CodeMapGeneratorConfig, verbose: boolean): Promise<void> {
  // Initialize caches to ensure directory structure exists
  await initializeCaches(config);

  // Get directory structure
  const dirStructure = await createDirectoryStructure(config, 'cache-cli');
  const cacheDir = dirStructure.cacheDir;

  // Check if cache directory exists
  try {
    await fs.access(cacheDir);
  } catch (error) {
    console.log('Cache directory does not exist.');
    return;
  }

  let validFiles = 0;
  let invalidFiles = 0;

  // Validate files recursively
  async function validateDirectory(dirPath: string): Promise<void> {
    const files = await fs.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);

      if (file.isFile()) {
        // Check if file is a JSON file
        if (file.name.endsWith('.json')) {
          try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            JSON.parse(fileContent); // Try to parse JSON
            validFiles += 1;

            if (verbose) {
              console.log(`Valid: ${filePath}`);
            }
          } catch (error) {
            invalidFiles += 1;

            console.log(`Invalid: ${filePath} - ${error instanceof Error ? error.message : String(error)}`);

            // Remove invalid file
            await fs.unlink(filePath);
          }
        } else {
          // Non-JSON files are considered valid
          validFiles += 1;
        }
      } else if (file.isDirectory()) {
        await validateDirectory(filePath);
      }
    }
  }

  await validateDirectory(cacheDir);

  console.log(`Validation complete: ${validFiles} valid files, ${invalidFiles} invalid files removed.`);
}

function formatSize(size: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let formattedSize = size;

  while (formattedSize >= 1024 && unitIndex < units.length - 1) {
    formattedSize /= 1024;
    unitIndex += 1;
  }

  return `${formattedSize.toFixed(2)} ${units[unitIndex]}`;
}

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

function handleError(error: unknown): void {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

// Parse command line arguments
program.parse(process.argv);

// If no command is provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
