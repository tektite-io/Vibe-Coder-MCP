/**
 * Security boundary validator for the Code-Map Generator tool.
 * This file contains utilities for validating file paths against security boundaries.
 */

import * as path from 'path';
import logger from '../../../logger.js';

/**
 * Class for validating file paths against security boundaries.
 */
export class SecurityBoundaryValidator {
  private normalizedAllowedDir: string;
  private normalizedOutputDir: string;

  /**
   * Creates a new security boundary validator.
   * @param allowedDir The allowed directory for reading files
   * @param outputDir The allowed directory for writing files
   */
  constructor(private allowedDir: string, private outputDir: string) {
    this.normalizedAllowedDir = path.resolve(allowedDir);
    this.normalizedOutputDir = path.resolve(outputDir);
  }

  /**
   * Checks if a path is within the allowed directory.
   * @param filePath The path to check
   * @returns Whether the path is within the allowed directory
   */
  public isPathWithinAllowedDirectory(filePath: string): boolean {
    try {
      const normalizedPath = path.resolve(filePath);
      return this.isPathWithin(normalizedPath, this.normalizedAllowedDir);
    } catch (error) {
      logger.error({ err: error, filePath }, 'Error checking if path is within allowed directory');
      return false;
    }
  }

  /**
   * Checks if a path is within the output directory.
   * @param filePath The path to check
   * @returns Whether the path is within the output directory
   */
  public isPathWithinOutputDirectory(filePath: string): boolean {
    try {
      const normalizedPath = path.resolve(filePath);
      return this.isPathWithin(normalizedPath, this.normalizedOutputDir);
    } catch (error) {
      logger.error({ err: error, filePath }, 'Error checking if path is within output directory');
      return false;
    }
  }

  /**
   * Creates a secure path within the allowed directory.
   * @param filePath The path to secure
   * @returns The secure path if valid, throws an error otherwise
   */
  public createSecureReadPath(filePath: string): string {
    if (!this.isPathWithinAllowedDirectory(filePath)) {
      const error = `Security violation: Path '${filePath}' is outside the allowed directory '${this.allowedDir}'`;
      logger.error({ filePath, allowedDir: this.allowedDir }, error);
      throw new Error(error);
    }
    return path.resolve(filePath);
  }

  /**
   * Creates a secure path within the output directory.
   * @param filePath The path to secure
   * @returns The secure path if valid, throws an error otherwise
   */
  public createSecureWritePath(filePath: string): string {
    if (!this.isPathWithinOutputDirectory(filePath)) {
      const error = `Security violation: Path '${filePath}' is outside the output directory '${this.outputDir}'`;
      logger.error({ filePath, outputDir: this.outputDir }, error);
      throw new Error(error);
    }
    return path.resolve(filePath);
  }

  /**
   * Checks if a path is within another path.
   * @param childPath The child path
   * @param parentPath The parent path
   * @returns Whether the child path is within the parent path
   */
  private isPathWithin(childPath: string, parentPath: string): boolean {
    // Normalize paths to ensure consistent comparison
    const normalizedChild = path.normalize(childPath);
    const normalizedParent = path.normalize(parentPath);

    // Check if the child path starts with the parent path
    // and ensure it's a proper subdirectory by checking for path separator
    return normalizedChild === normalizedParent || 
           (normalizedChild.startsWith(normalizedParent) && 
            normalizedChild.substring(normalizedParent.length, normalizedParent.length + 1) === path.sep);
  }
}
