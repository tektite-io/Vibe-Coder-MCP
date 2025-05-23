/**
 * Factory for creating appropriate import resolvers based on file type.
 */

import * as path from 'path';
import * as fs from 'fs';
import { DependencyCruiserAdapter } from './dependencyCruiserAdapter.js';
import { ExtendedPythonImportResolver } from './extendedPythonImportResolver.js';
import { ClangdAdapter } from './clangdAdapter.js';
import { SemgrepAdapter } from './semgrepAdapter.js';
import { ImportResolver } from './importResolver.js';
import logger from '../../../logger.js';

/**
 * Interface for import resolver options.
 */
export interface ImportResolverOptions {
  allowedDir: string;
  outputDir: string;
  maxDepth?: number;
  tsConfig?: string;
  pythonPath?: string;
  pythonVersion?: string;
  venvPath?: string;
  clangdPath?: string;
  compileFlags?: string[];
  includePaths?: string[];
  semgrepPatterns?: string[];
  semgrepTimeout?: number;
  semgrepMaxMemory?: string;
  disableSemgrepFallback?: boolean;
}

/**
 * Factory class for creating import resolvers.
 */
export class ImportResolverFactory {
  private dependencyCruiserAdapter: DependencyCruiserAdapter | null = null;
  private pythonImportResolver: ExtendedPythonImportResolver | null = null;
  private clangdAdapter: ClangdAdapter | null = null;
  private semgrepAdapter: SemgrepAdapter | null = null;
  private adapterLastUsed: Map<string, number> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly ADAPTER_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(private options: ImportResolverOptions) {
    // Schedule cleanup of unused adapters
    this.scheduleCleanup();
  }

  /**
   * Gets the appropriate import resolver for a file.
   * @param filePath Path to the file
   * @returns The appropriate import resolver
   */
  public getImportResolver(filePath: string): ImportResolver | null {
    const extension = path.extname(filePath).toLowerCase();

    // JavaScript/TypeScript files
    if (['.js', '.jsx', '.ts', '.tsx'].includes(extension)) {
      return this.getDependencyCruiserAdapter();
    }

    // Python files - only create ExtendedPythonImportResolver if we actually have Python files
    // This is a key optimization to avoid unnecessary initialization on startup
    if (['.py', '.pyw'].includes(extension)) {
      // Check if the file exists and is within the allowed directory
      try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.options.allowedDir, filePath);
        const stats = fs.statSync(absolutePath);
        if (stats.isFile()) {
          return this.getPythonImportResolver();
        }
      } catch (error) {
        logger.debug({ filePath, error: (error as Error).message }, 'Error checking Python file');
        return null;
      }
    }

    // C/C++ files
    if (['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx'].includes(extension)) {
      return this.getClangdAdapter();
    }

    // For other file types, use Semgrep if not disabled
    if (!this.options.disableSemgrepFallback) {
      return this.getSemgrepAdapter();
    }

    // If Semgrep is disabled, return null
    logger.debug({ filePath, extension }, 'No enhanced import resolver available for this file type');
    return null;
  }

  /**
   * Gets or creates a DependencyCruiserAdapter instance.
   */
  private getDependencyCruiserAdapter(): DependencyCruiserAdapter {
    // Update last used timestamp
    this.adapterLastUsed.set('dependencyCruiser', Date.now());

    if (!this.dependencyCruiserAdapter) {
      this.dependencyCruiserAdapter = new DependencyCruiserAdapter(
        this.options.allowedDir,
        this.options.outputDir
      );

      // Schedule cleanup if not already scheduled
      this.scheduleCleanup();
    }
    return this.dependencyCruiserAdapter;
  }

  /**
   * Gets or creates an ExtendedPythonImportResolver instance.
   */
  private getPythonImportResolver(): ExtendedPythonImportResolver {
    // Update last used timestamp
    this.adapterLastUsed.set('pythonImportResolver', Date.now());

    if (!this.pythonImportResolver) {
      this.pythonImportResolver = new ExtendedPythonImportResolver(
        this.options.allowedDir,
        this.options.outputDir
      );

      // Schedule cleanup if not already scheduled
      this.scheduleCleanup();
    }
    return this.pythonImportResolver;
  }

  /**
   * Gets or creates a ClangdAdapter instance.
   */
  private getClangdAdapter(): ClangdAdapter {
    // Update last used timestamp
    this.adapterLastUsed.set('clangdAdapter', Date.now());

    if (!this.clangdAdapter) {
      this.clangdAdapter = new ClangdAdapter(
        this.options.allowedDir,
        this.options.outputDir
      );

      // Schedule cleanup if not already scheduled
      this.scheduleCleanup();
    }
    return this.clangdAdapter;
  }

  /**
   * Gets or creates a SemgrepAdapter instance.
   */
  private getSemgrepAdapter(): SemgrepAdapter {
    // Update last used timestamp
    this.adapterLastUsed.set('semgrepAdapter', Date.now());

    if (!this.semgrepAdapter) {
      this.semgrepAdapter = new SemgrepAdapter(
        this.options.allowedDir,
        this.options.outputDir
      );

      // Schedule cleanup if not already scheduled
      this.scheduleCleanup();
    }
    return this.semgrepAdapter;
  }

  /**
   * Schedules cleanup of unused adapters.
   */
  private scheduleCleanup(): void {
    if (!this.cleanupTimer) {
      this.cleanupTimer = setTimeout(() => {
        this.cleanupUnusedAdapters();
        this.cleanupTimer = null;
      }, 5 * 60 * 1000); // Check every 5 minutes
    }
  }

  /**
   * Cleans up unused adapters.
   */
  private cleanupUnusedAdapters(): void {
    const now = Date.now();
    let unloadedCount = 0;

    // Check each adapter
    if (this.dependencyCruiserAdapter &&
        this.adapterLastUsed.has('dependencyCruiser') &&
        now - this.adapterLastUsed.get('dependencyCruiser')! > this.ADAPTER_TTL) {
      this.dependencyCruiserAdapter.dispose();
      this.dependencyCruiserAdapter = null;
      unloadedCount++;
    }

    if (this.pythonImportResolver &&
        this.adapterLastUsed.has('pythonImportResolver') &&
        now - this.adapterLastUsed.get('pythonImportResolver')! > this.ADAPTER_TTL) {
      this.pythonImportResolver.dispose();
      this.pythonImportResolver = null;
      unloadedCount++;
    }

    if (this.clangdAdapter &&
        this.adapterLastUsed.has('clangdAdapter') &&
        now - this.adapterLastUsed.get('clangdAdapter')! > this.ADAPTER_TTL) {
      this.clangdAdapter.dispose();
      this.clangdAdapter = null;
      unloadedCount++;
    }

    if (this.semgrepAdapter &&
        this.adapterLastUsed.has('semgrepAdapter') &&
        now - this.adapterLastUsed.get('semgrepAdapter')! > this.ADAPTER_TTL) {
      this.semgrepAdapter.dispose();
      this.semgrepAdapter = null;
      unloadedCount++;
    }

    if (unloadedCount > 0) {
      logger.info(`Unloaded ${unloadedCount} unused import resolvers`);
    }

    // Reschedule if we still have adapters
    if (this.dependencyCruiserAdapter || this.pythonImportResolver ||
        this.clangdAdapter || this.semgrepAdapter) {
      this.scheduleCleanup();
    }
  }

  /**
   * Disposes of all adapters.
   */
  public dispose(): void {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Dispose all adapters
    if (this.dependencyCruiserAdapter) {
      this.dependencyCruiserAdapter.dispose();
      this.dependencyCruiserAdapter = null;
    }

    if (this.pythonImportResolver) {
      this.pythonImportResolver.dispose();
      this.pythonImportResolver = null;
    }

    if (this.clangdAdapter) {
      this.clangdAdapter.dispose();
      this.clangdAdapter = null;
    }

    if (this.semgrepAdapter) {
      this.semgrepAdapter.dispose();
      this.semgrepAdapter = null;
    }

    logger.debug('ImportResolverFactory disposed');
  }
}
