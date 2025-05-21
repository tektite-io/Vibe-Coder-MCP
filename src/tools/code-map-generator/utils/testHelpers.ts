/**
 * Test helpers for the Code-Map Generator tool.
 * These functions are used for testing the import resolution functionality.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ImportInfo } from '../codeMapModel.js';
import { extractJSImports } from './importExtractor.js';
import { resolveImport, ResolvedImportResult } from './importResolver.no-cache.js';
import { parseSourceCode } from '../parser.js';
import logger from '../../../logger.js';

/**
 * Interface for the result of resolving imports in a file.
 */
export interface ResolvedImport extends Omit<ImportInfo, 'resolvedPath'> {
  resolvedPath?: string | ResolvedImportResult;
}

/**
 * Resolves imports in a file.
 *
 * @param filePath The path to the file to analyze.
 * @param language The language of the file.
 * @param options Additional options for import resolution.
 * @returns An array of resolved imports.
 */
export async function resolveImportsInFile(
  filePath: string,
  language: string,
  options: {
    projectRoot?: string;
    expandSecurityBoundary?: boolean;
  } = {}
): Promise<ResolvedImport[]> {
  try {
    // Read the file
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');

    // Parse the file
    const tree = await parseSourceCode(fileContent, `.${language}`);

    // Extract imports
    const imports: ResolvedImport[] = [];
    const rootNode = tree.ast;

    // For JavaScript/TypeScript, use the specialized extractor
    if (language === 'javascript' || language === 'typescript') {
      const extractedImports = extractJSImports(rootNode, fileContent);
      imports.push(...extractedImports);
    } else {
      // For other languages, traverse the AST and look for import-like nodes
      // This is a simplified version for testing purposes
      const cursor = rootNode.walk();
      let reachedEnd = false;

      while (!reachedEnd) {
        if (cursor.nodeType.includes('import')) {
          const node = cursor.currentNode();
          imports.push({
            path: node.text,
            type: 'unknown',
            isExternalPackage: false,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1
          });
        }

        reachedEnd = !cursor.gotoNextSibling();
        if (reachedEnd && cursor.gotoParent()) {
          reachedEnd = !cursor.gotoNextSibling();
        }
      }
    }

    // Resolve import paths
    const projectRoot = options.projectRoot || path.dirname(filePath);
    const expandSecurityBoundary = options.expandSecurityBoundary !== undefined
      ? options.expandSecurityBoundary
      : true;

    // Resolve each import
    for (const importInfo of imports) {
      try {
        const resolvedPath = resolveImport(importInfo.path, {
          projectRoot,
          fromFile: filePath,
          language,
          expandSecurityBoundary
        });

        if (resolvedPath) {
          importInfo.resolvedPath = resolvedPath;
        }
      } catch (error) {
        logger.debug({
          err: error,
          importPath: importInfo.path,
          fromFile: filePath
        }, 'Error resolving import');
      }
    }

    return imports;
  } catch (error) {
    logger.error({ err: error, filePath }, 'Error resolving imports in file');
    return [];
  }
}
