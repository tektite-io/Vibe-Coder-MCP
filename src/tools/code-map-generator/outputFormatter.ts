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
            let impDetails = imp.importedItems ? `(${imp.importedItems.join(', ')})` : '';
            if (imp.isDefault && imp.importedItems && imp.importedItems.length > 0) {
                 impDetails = `${imp.importedItems[0]} (default)`;
                 if (imp.importedItems.length > 1) {
                    impDetails += `, { ${imp.importedItems.slice(1).join(', ')} }`;
                 }
            } else if (imp.isDefault) {
                impDetails = `(default)`;
            }
            markdownOutput += `- \`${imp.path}\` ${impDetails}\n`;
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
