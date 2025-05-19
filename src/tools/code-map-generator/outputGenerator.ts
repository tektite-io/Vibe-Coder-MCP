/**
 * Output generator for the Code-Map Generator tool.
 * This file contains functions for generating output in different formats.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
import { FileInfo } from './codeMapModel.js';
import { GraphNode, GraphEdge } from './graphBuilder.js';
import { generateMermaidSequenceDiagram } from './diagramGenerator.js';
import { CodeMapGeneratorConfig } from './types.js';
import { writeFileSecure } from './fsUtils.js';
import { generateTimestampFileName, getOutputDirectory } from './directoryUtils.js';

/**
 * Generates a Markdown output for the code map.
 * @param allFilesInfo Array of file information objects
 * @param fileDependencyGraph File dependency graph
 * @param classInheritanceGraph Class inheritance graph
 * @param functionCallGraph Function call graph
 * @param config Code-Map Generator configuration
 * @param jobId Job ID for output file naming
 * @returns A promise that resolves to the output file path
 */
export async function generateMarkdownOutput(
  allFilesInfo: FileInfo[],
  fileDependencyGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  classInheritanceGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  functionCallGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  config: CodeMapGeneratorConfig,
  jobId: string
): Promise<string> {
  // Determine output directory and file name
  const outputDir = config.output?.outputDir || getOutputDirectory(config);
  const filePrefix = config.output?.filePrefix || 'code-map';
  const fileName = generateTimestampFileName(filePrefix, 'md');
  const outputPath = path.join(outputDir, fileName);

  // Check if we should split the output
  const splitOutput = config.output?.splitOutput !== false;

  if (splitOutput) {
    // Generate split output files
    return await generateSplitMarkdownOutput(
      allFilesInfo,
      fileDependencyGraph,
      classInheritanceGraph,
      functionCallGraph,
      config,
      jobId
    );
  } else {
    // Generate a single output file
    return await generateSingleMarkdownOutput(
      allFilesInfo,
      fileDependencyGraph,
      classInheritanceGraph,
      functionCallGraph,
      config,
      outputPath
    );
  }
}

/**
 * Generates a single Markdown output file.
 * @param allFilesInfo Array of file information objects
 * @param fileDependencyGraph File dependency graph
 * @param classInheritanceGraph Class inheritance graph
 * @param functionCallGraph Function call graph
 * @param config Code-Map Generator configuration
 * @param outputPath Output file path
 * @returns A promise that resolves to the output file path
 */
async function generateSingleMarkdownOutput(
  allFilesInfo: FileInfo[],
  fileDependencyGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  classInheritanceGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  functionCallGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  config: CodeMapGeneratorConfig,
  outputPath: string
): Promise<string> {
  // Get the output directory for validation
  const outputDir = config.output?.outputDir || getOutputDirectory(config);
  // Generate the Markdown content
  let markdown = '# Code Map\n\n';

  // Add summary section
  markdown += '## Summary\n\n';
  markdown += `- Total Files: ${allFilesInfo.length}\n`;
  markdown += `- Total Classes: ${allFilesInfo.reduce((sum, file) => sum + file.classes.length, 0)}\n`;
  markdown += `- Total Functions: ${allFilesInfo.reduce((sum, file) => sum + file.functions.length, 0)}\n`;
  markdown += `- Total Methods: ${allFilesInfo.reduce((sum, file) => sum + file.classes.reduce((sum, cls) => sum + cls.methods.length, 0), 0)}\n\n`;

  // Add file structure section
  markdown += '## File Structure\n\n';
  markdown += '```\n';

  // Group files by directory
  const filesByDir = new Map<string, string[]>();
  allFilesInfo.forEach(fileInfo => {
    const dir = path.dirname(fileInfo.relativePath);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir)!.push(path.basename(fileInfo.relativePath));
  });

  // Sort directories and files
  const sortedDirs = Array.from(filesByDir.keys()).sort();
  sortedDirs.forEach(dir => {
    const files = filesByDir.get(dir)!.sort();
    markdown += `${dir}/\n`;
    files.forEach(file => {
      markdown += `  ├── ${file}\n`;
    });
  });

  markdown += '```\n\n';

  // Add file dependency graph section
  markdown += '## File Dependencies\n\n';
  markdown += '```mermaid\ngraph TD;\n';

  // Add nodes
  fileDependencyGraph.nodes.forEach(node => {
    markdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
  });

  // Add edges
  fileDependencyGraph.edges.forEach(edge => {
    markdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
  });

  markdown += '```\n\n';

  // Add class inheritance graph section
  markdown += '## Class Inheritance\n\n';
  markdown += '```mermaid\nclassDiagram;\n';

  // Add classes
  classInheritanceGraph.nodes.forEach(node => {
    markdown += `  class ${node.id.replace(/[^a-zA-Z0-9]/g, '_')} "${node.label}";\n`;
  });

  // Add inheritance relationships
  classInheritanceGraph.edges.forEach(edge => {
    markdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} <|-- ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
  });

  markdown += '```\n\n';

  // Add function call graph section
  markdown += '## Function Calls\n\n';
  markdown += '```mermaid\ngraph TD;\n';

  // Add nodes
  functionCallGraph.nodes.forEach(node => {
    markdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
  });

  // Add edges
  functionCallGraph.edges.forEach(edge => {
    markdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
  });

  markdown += '```\n\n';

  // Add sequence diagram section
  markdown += '## Method Call Sequence\n\n';

  // Generate the sequence diagram
  const sequenceDiagram = generateMermaidSequenceDiagram(
    functionCallGraph.nodes,
    functionCallGraph.edges
  );

  markdown += '```mermaid\n' + sequenceDiagram + '\n```\n\n';

  // Add file details section
  markdown += '## File Details\n\n';

  allFilesInfo.forEach(fileInfo => {
    markdown += `### ${fileInfo.relativePath}\n\n`;

    if (fileInfo.comment) {
      markdown += `${fileInfo.comment}\n\n`;
    }

    if (fileInfo.imports.length > 0) {
      markdown += '#### Imports\n\n';
      fileInfo.imports.forEach(imp => {
        markdown += `- \`${imp.path}\`${imp.comment ? ` - ${imp.comment}` : ''}\n`;
      });
      markdown += '\n';
    }

    if (fileInfo.classes.length > 0) {
      markdown += '#### Classes\n\n';
      fileInfo.classes.forEach(classInfo => {
        markdown += `##### ${classInfo.name}\n\n`;

        if (classInfo.comment) {
          markdown += `${classInfo.comment}\n\n`;
        }

        if (classInfo.parentClass) {
          markdown += `Extends: \`${classInfo.parentClass}\`\n\n`;
        }

        if (classInfo.properties.length > 0) {
          markdown += '**Properties:**\n\n';
          classInfo.properties.forEach(prop => {
            markdown += `- \`${prop.name}\`${prop.comment ? ` - ${prop.comment}` : ''}\n`;
          });
          markdown += '\n';
        }

        if (classInfo.methods.length > 0) {
          markdown += '**Methods:**\n\n';
          classInfo.methods.forEach(method => {
            markdown += `- \`${method.name}()\`${method.comment ? ` - ${method.comment}` : ''}\n`;
          });
          markdown += '\n';
        }
      });
    }

    if (fileInfo.functions.length > 0) {
      markdown += '#### Functions\n\n';
      fileInfo.functions.forEach(funcInfo => {
        markdown += `- \`${funcInfo.name}()\`${funcInfo.comment ? ` - ${funcInfo.comment}` : ''}\n`;
      });
      markdown += '\n';
    }

    markdown += '---\n\n';
  });

  // Write the Markdown content to the output file
  await writeFileSecure(outputPath, markdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  logger.info(`Generated Markdown output: ${outputPath}`);
  return outputPath;
}

/**
 * Generates split Markdown output files.
 * @param allFilesInfo Array of file information objects
 * @param fileDependencyGraph File dependency graph
 * @param classInheritanceGraph Class inheritance graph
 * @param functionCallGraph Function call graph
 * @param config Code-Map Generator configuration
 * @param jobId Job ID for output file naming
 * @returns A promise that resolves to the main output file path
 */
async function generateSplitMarkdownOutput(
  allFilesInfo: FileInfo[],
  fileDependencyGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  classInheritanceGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  functionCallGraph: { nodes: GraphNode[], edges: GraphEdge[] },
  config: CodeMapGeneratorConfig,
  jobId: string
): Promise<string> {
  // Determine output directory and file prefix
  const outputDir = config.output?.outputDir || getOutputDirectory(config);
  const filePrefix = config.output?.filePrefix || 'code-map';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirWithTimestamp = path.join(outputDir, `${filePrefix}-${timestamp}`);

  // Create the output directory
  await fs.mkdir(outputDirWithTimestamp, { recursive: true });

  // Generate the main index file
  const mainFilePath = path.join(outputDirWithTimestamp, 'index.md');
  let mainMarkdown = '# Code Map\n\n';

  // Add summary section
  mainMarkdown += '## Summary\n\n';
  mainMarkdown += `- Total Files: ${allFilesInfo.length}\n`;
  mainMarkdown += `- Total Classes: ${allFilesInfo.reduce((sum, file) => sum + file.classes.length, 0)}\n`;
  mainMarkdown += `- Total Functions: ${allFilesInfo.reduce((sum, file) => sum + file.functions.length, 0)}\n`;
  mainMarkdown += `- Total Methods: ${allFilesInfo.reduce((sum, file) => sum + file.classes.reduce((sum, cls) => sum + cls.methods.length, 0), 0)}\n\n`;

  // Add links to other sections
  mainMarkdown += '## Sections\n\n';
  mainMarkdown += '- [File Structure](file-structure.md)\n';
  mainMarkdown += '- [File Dependencies](file-dependencies.md)\n';
  mainMarkdown += '- [Class Inheritance](class-inheritance.md)\n';
  mainMarkdown += '- [Function Calls](function-calls.md)\n';
  mainMarkdown += '- [Method Call Sequence](method-call-sequence.md)\n';
  mainMarkdown += '- [File Details](file-details.md)\n\n';

  // Write the main index file
  await writeFileSecure(mainFilePath, mainMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate file structure file
  const fileStructurePath = path.join(outputDirWithTimestamp, 'file-structure.md');
  let fileStructureMarkdown = '# File Structure\n\n';
  fileStructureMarkdown += '[Back to Index](index.md)\n\n';
  fileStructureMarkdown += '```\n';

  // Group files by directory
  const filesByDir = new Map<string, string[]>();
  allFilesInfo.forEach(fileInfo => {
    const dir = path.dirname(fileInfo.relativePath);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir)!.push(path.basename(fileInfo.relativePath));
  });

  // Sort directories and files
  const sortedDirs = Array.from(filesByDir.keys()).sort();
  sortedDirs.forEach(dir => {
    const files = filesByDir.get(dir)!.sort();
    fileStructureMarkdown += `${dir}/\n`;
    files.forEach(file => {
      fileStructureMarkdown += `  ├── ${file}\n`;
    });
  });

  fileStructureMarkdown += '```\n';

  // Write the file structure file
  await writeFileSecure(fileStructurePath, fileStructureMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate file dependencies file
  const fileDependenciesPath = path.join(outputDirWithTimestamp, 'file-dependencies.md');
  let fileDependenciesMarkdown = '# File Dependencies\n\n';
  fileDependenciesMarkdown += '[Back to Index](index.md)\n\n';
  fileDependenciesMarkdown += '```mermaid\ngraph TD;\n';

  // Add nodes
  fileDependencyGraph.nodes.forEach(node => {
    fileDependenciesMarkdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
  });

  // Add edges
  fileDependencyGraph.edges.forEach(edge => {
    fileDependenciesMarkdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
  });

  fileDependenciesMarkdown += '```\n';

  // Write the file dependencies file
  await writeFileSecure(fileDependenciesPath, fileDependenciesMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate class inheritance file
  const classInheritancePath = path.join(outputDirWithTimestamp, 'class-inheritance.md');
  let classInheritanceMarkdown = '# Class Inheritance\n\n';
  classInheritanceMarkdown += '[Back to Index](index.md)\n\n';
  classInheritanceMarkdown += '```mermaid\nclassDiagram;\n';

  // Add classes
  classInheritanceGraph.nodes.forEach(node => {
    classInheritanceMarkdown += `  class ${node.id.replace(/[^a-zA-Z0-9]/g, '_')} "${node.label}";\n`;
  });

  // Add inheritance relationships
  classInheritanceGraph.edges.forEach(edge => {
    classInheritanceMarkdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} <|-- ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
  });

  classInheritanceMarkdown += '```\n';

  // Write the class inheritance file
  await writeFileSecure(classInheritancePath, classInheritanceMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate function calls file
  const functionCallsPath = path.join(outputDirWithTimestamp, 'function-calls.md');
  let functionCallsMarkdown = '# Function Calls\n\n';
  functionCallsMarkdown += '[Back to Index](index.md)\n\n';
  functionCallsMarkdown += '```mermaid\ngraph TD;\n';

  // Add nodes
  functionCallGraph.nodes.forEach(node => {
    functionCallsMarkdown += `  ${node.id.replace(/[^a-zA-Z0-9]/g, '_')}["${node.label}"];\n`;
  });

  // Add edges
  functionCallGraph.edges.forEach(edge => {
    functionCallsMarkdown += `  ${edge.from.replace(/[^a-zA-Z0-9]/g, '_')} --> ${edge.to.replace(/[^a-zA-Z0-9]/g, '_')};\n`;
  });

  functionCallsMarkdown += '```\n';

  // Write the function calls file
  await writeFileSecure(functionCallsPath, functionCallsMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate method call sequence file
  const methodCallSequencePath = path.join(outputDirWithTimestamp, 'method-call-sequence.md');
  let methodCallSequenceMarkdown = '# Method Call Sequence\n\n';
  methodCallSequenceMarkdown += '[Back to Index](index.md)\n\n';

  // Generate the sequence diagram
  const sequenceDiagram = generateMermaidSequenceDiagram(
    functionCallGraph.nodes,
    functionCallGraph.edges
  );

  methodCallSequenceMarkdown += '```mermaid\n' + sequenceDiagram + '\n```\n';

  // Write the method call sequence file
  await writeFileSecure(methodCallSequencePath, methodCallSequenceMarkdown, config.allowedMappingDirectory, 'utf-8', outputDir);

  // Generate file details file
  const fileDetailsPath = path.join(outputDirWithTimestamp, 'file-details.md');
  let fileDetailsMarkdown = '# File Details\n\n';
  fileDetailsMarkdown += '[Back to Index](index.md)\n\n';

  // Process files in batches to avoid memory issues
  const batchSize = 10;
  for (let i = 0; i < allFilesInfo.length; i += batchSize) {
    const batch = allFilesInfo.slice(i, i + batchSize);
    let batchMarkdown = '';

    batch.forEach(fileInfo => {
      batchMarkdown += `## ${fileInfo.relativePath}\n\n`;

      if (fileInfo.comment) {
        batchMarkdown += `${fileInfo.comment}\n\n`;
      }

      if (fileInfo.imports.length > 0) {
        batchMarkdown += '### Imports\n\n';
        fileInfo.imports.forEach(imp => {
          batchMarkdown += `- \`${imp.path}\`${imp.comment ? ` - ${imp.comment}` : ''}\n`;
        });
        batchMarkdown += '\n';
      }

      if (fileInfo.classes.length > 0) {
        batchMarkdown += '### Classes\n\n';
        fileInfo.classes.forEach(classInfo => {
          batchMarkdown += `#### ${classInfo.name}\n\n`;

          if (classInfo.comment) {
            batchMarkdown += `${classInfo.comment}\n\n`;
          }

          if (classInfo.parentClass) {
            batchMarkdown += `Extends: \`${classInfo.parentClass}\`\n\n`;
          }

          if (classInfo.properties.length > 0) {
            batchMarkdown += '**Properties:**\n\n';
            classInfo.properties.forEach(prop => {
              batchMarkdown += `- \`${prop.name}\`${prop.comment ? ` - ${prop.comment}` : ''}\n`;
            });
            batchMarkdown += '\n';
          }

          if (classInfo.methods.length > 0) {
            batchMarkdown += '**Methods:**\n\n';
            classInfo.methods.forEach(method => {
              batchMarkdown += `- \`${method.name}()\`${method.comment ? ` - ${method.comment}` : ''}\n`;
            });
            batchMarkdown += '\n';
          }
        });
      }

      if (fileInfo.functions.length > 0) {
        batchMarkdown += '### Functions\n\n';
        fileInfo.functions.forEach(funcInfo => {
          batchMarkdown += `- \`${funcInfo.name}()\`${funcInfo.comment ? ` - ${funcInfo.comment}` : ''}\n`;
        });
        batchMarkdown += '\n';
      }

      batchMarkdown += '---\n\n';
    });

    // Append the batch markdown to the file details file
    await fs.appendFile(fileDetailsPath, batchMarkdown);
  }

  logger.info(`Generated split Markdown output in directory: ${outputDirWithTimestamp}`);
  return mainFilePath;
}
