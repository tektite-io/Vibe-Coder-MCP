import { CodeMap } from './codeMapModel.js';
import path from 'path';
import { generateHeuristicComment } from './astAnalyzer.js'; // For file-level heuristic comments

export function formatCodeMapToMarkdown(codeMap: CodeMap, projectRoot: string): string {
  let markdownOutput = `# Code Map for ${path.basename(projectRoot)}\n\n`;
  markdownOutput += `Processed ${codeMap.files.length} files.\n`;
  const errorFiles = codeMap.files.filter(f => f.comment?.startsWith("Error processing file"));
  if (errorFiles.length > 0) {
    markdownOutput += `${errorFiles.length} file(s) encountered errors during processing.\n`;
  }
  markdownOutput += `\n`;

  for (const fileInfo of codeMap.files) {
    // Use relativePath directly from FileInfo
    markdownOutput += `## File: ${fileInfo.relativePath}\n`;
    if (fileInfo.comment) {
      markdownOutput += `*${fileInfo.comment.split('\n')[0]}*\n\n`; // Take first line of file comment
    } else {
      markdownOutput += `*${generateHeuristicComment(path.basename(fileInfo.relativePath), 'file')}*\n\n`;
    }

    if (fileInfo.imports.length > 0) {
        markdownOutput += `### Imports\n`;
        fileInfo.imports.forEach(imp => {
            // Try to extract a better display path from the node text if available
            let displayPath = imp.path;

            if (imp.path === 'unknown' && imp.nodeText) {
                // Try to match ES6 import patterns
                const es6ImportMatch = imp.nodeText.match(/from\s+['"]([^'"]+)['"]/);
                if (es6ImportMatch && es6ImportMatch[1]) {
                    displayPath = es6ImportMatch[1];
                } else {
                    // Try to match CommonJS require patterns
                    const requireMatch = imp.nodeText.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
                    if (requireMatch && requireMatch[1]) {
                        displayPath = requireMatch[1];
                    } else {
                        // Try to match dynamic import patterns
                        const dynamicImportMatch = imp.nodeText.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
                        if (dynamicImportMatch && dynamicImportMatch[1]) {
                            displayPath = dynamicImportMatch[1];
                        } else {
                            // Default fallback
                            displayPath = imp.importedItems && imp.importedItems.length > 0 ?
                                `${imp.importedItems[0]} (imported)` : 'module import';
                        }
                    }
                }
            }

            let impDetails = imp.importedItems && imp.path !== 'unknown' ?
                `(${imp.importedItems.join(', ')})` : '';

            if (imp.isDefault && imp.importedItems && imp.importedItems.length > 0 && imp.path !== 'unknown') {
                 impDetails = `${imp.importedItems[0]} (default)`;
                 if (imp.importedItems.length > 1) {
                    impDetails += `, { ${imp.importedItems.slice(1).join(', ')} }`;
                 }
            } else if (imp.isDefault && imp.path !== 'unknown') {
                impDetails = `(default)`;
            }

            // Check if the import path is a resolved absolute path
            const isResolved = imp.path !== 'unknown' &&
                (imp.path.startsWith('/') || imp.path.includes(':\\') || imp.path.match(/^[a-zA-Z]:\//));

            // Check if this is an external package
            const isExternalPackage = imp.isExternalPackage ||
                (!imp.path.startsWith('.') && !imp.path.startsWith('/') && imp.path !== 'unknown');

            // Check if this is a project file
            const isProjectFile = imp.isProjectFile ||
                (imp.path.startsWith('./') || imp.path.startsWith('../'));

            if (isResolved) {
                // For resolved paths, show both the original import and the resolved path
                const originalPath = imp.originalPath || imp.path;
                const resolvedPath = imp.path;

                // Get the filename from the resolved path
                const fileName = path.basename(resolvedPath);

                markdownOutput += `- \`${originalPath}\` → \`${fileName}\` ${impDetails}\n`;
                markdownOutput += `  *Resolved to: ${resolvedPath}*\n`;
            } else if (isProjectFile) {
                // For project files, show the original import and the resolved path
                const originalPath = imp.originalPath || imp.path;

                markdownOutput += `- \`${originalPath}\` ${impDetails}\n`;
                if (imp.path !== originalPath) {
                    markdownOutput += `  *Project file: ${imp.path}*\n`;
                }
            } else if (isExternalPackage) {
                // For external packages, show the package name
                const packageName = imp.packageName || (imp.path.startsWith('@') ?
                    imp.path.split('/').slice(0, 2).join('/') :
                    imp.path.split('/')[0]);

                markdownOutput += `- \`${displayPath}\` ${impDetails}\n`;
                if (packageName && packageName !== imp.path) {
                    markdownOutput += `  *Package: ${packageName}*\n`;
                }
            } else if (imp.path === 'unknown') {
                // For unknown imports, provide a more helpful message
                markdownOutput += `- \`${displayPath}\` ${impDetails}\n`;

                // If we have the node text, show a snippet of it
                if (imp.nodeText) {
                    const cleanNodeText = imp.nodeText.replace(/\s+/g, ' ').trim();
                    const snippet = cleanNodeText.length > 50 ?
                        cleanNodeText.substring(0, 47) + '...' :
                        cleanNodeText;
                    markdownOutput += `  *Import snippet: \`${snippet}\`*\n`;
                } else {
                    markdownOutput += `  *Note: This is an unresolved import. It might be a built-in module, an external package, or a local file.*\n`;
                }
            } else {
                markdownOutput += `- \`${displayPath}\` ${impDetails}\n`;
            }
        });
        markdownOutput += `\n`;
    }

    if (fileInfo.classes.length > 0) {
      markdownOutput += `### Classes\n`;
      for (const classInfo of fileInfo.classes) {
        markdownOutput += `- **${classInfo.name}**`;
        if (classInfo.parentClass) markdownOutput += ` (extends ${classInfo.parentClass})`;
        if (classInfo.comment) markdownOutput += ` — *${classInfo.comment.split('\n')[0]}*\n`; else markdownOutput += `\n`;

        if (classInfo.properties && classInfo.properties.length > 0) {
            classInfo.properties.forEach(prop => {
                markdownOutput += `  - \`${prop.name}${prop.type ? `: ${prop.type}` : ''}\``;
                if (prop.comment) markdownOutput += ` — *${prop.comment.split('\n')[0]}*\n`; else markdownOutput += `\n`;
            });
        }
        for (const method of classInfo.methods) {
          markdownOutput += `  - \`${method.signature}\``;
          if (method.comment) markdownOutput += ` — *${method.comment.split('\n')[0]}*\n`; else markdownOutput += `\n`;
        }
      }
      markdownOutput += `\n`;
    }

    if (fileInfo.functions.length > 0) {
      markdownOutput += `### Functions\n`;
      for (const funcInfo of fileInfo.functions) {
        markdownOutput += `- \`${funcInfo.signature}\``;
        if (funcInfo.comment) markdownOutput += ` — *${funcInfo.comment.split('\n')[0]}*\n`; else markdownOutput += `\n`;
      }
      markdownOutput += `\n`;
    }
    markdownOutput += `\n---\n\n`;
  }
  return markdownOutput;
}

export function optimizeMarkdownOutput(markdown: string, maxLength: number = 80000): string { // Increased default max length
  if (markdown.length <= maxLength) {
    return markdown;
  }

  // Try to preserve the beginning (summary, diagrams) and truncate the detailed file list
  const diagramsMarker = "\n## File Dependency Diagram";
  const diagramsStart = markdown.indexOf(diagramsMarker);

  const detailedStructureMarker = "\n## File: "; // Start of detailed file list
  let detailedStructureStart = markdown.indexOf(detailedStructureMarker);

  if (detailedStructureStart === -1) { // Fallback if marker not found
      detailedStructureStart = markdown.length / 2; // Simple fallback: cut from middle
  }

  // Prioritize keeping initial summary and diagrams if possible
  const truncationMessage = "\n\n... (Output truncated due to length constraints. Some file details might be omitted)";
  const availableLengthForDetails = maxLength - (diagramsStart > -1 ? diagramsStart : detailedStructureStart) - truncationMessage.length;

  if (diagramsStart > -1 && diagramsStart < maxLength * 0.75) { // If diagrams section is substantial and fits
    const introAndDiagrams = markdown.substring(0, diagramsStart);
    let detailsToKeep = "";
    if (detailedStructureStart > diagramsStart && availableLengthForDetails > 0) {
        const detailsSection = markdown.substring(diagramsStart);
        const lastNewline = detailsSection.substring(0, availableLengthForDetails).lastIndexOf('\n## File: ');
        detailsToKeep = lastNewline > 0 ? detailsSection.substring(0, lastNewline) : detailsSection.substring(0, availableLengthForDetails);
    } else if (availableLengthForDetails > 0) { // No clear diagram marker, or diagrams are too large
        const detailsSection = markdown.substring(detailedStructureStart);
        const lastNewline = detailsSection.substring(0, availableLengthForDetails).lastIndexOf('\n## File: ');
        detailsToKeep = lastNewline > 0 ? detailsSection.substring(0, lastNewline) : detailsSection.substring(0, availableLengthForDetails);
        return markdown.substring(0, detailedStructureStart) + detailsToKeep + truncationMessage;
    }
    return introAndDiagrams + detailsToKeep + truncationMessage;

  } else { // General truncation if diagrams are too large or not present as expected
      let truncatedMarkdown = markdown.substring(0, maxLength - truncationMessage.length);
      const lastNewline = truncatedMarkdown.lastIndexOf('\n');
      if (lastNewline > 0) {
        truncatedMarkdown = truncatedMarkdown.substring(0, lastNewline);
      }
      return truncatedMarkdown + truncationMessage;
  }
}
