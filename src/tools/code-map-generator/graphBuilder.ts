import { FileInfo, ClassInfo, FunctionInfo, ImportInfo } from './codeMapModel.js';
import path from 'path';
import logger from '../../logger.js';

export interface GraphNode {
  id: string; // Unique identifier for the node (e.g., file path, class name)
  label: string; // Display label for the node (can include semantic comment)
  type: 'file' | 'class' | 'function' | 'method';
  comment?: string; // Semantic comment associated with the node
  filePath?: string; // For class/function nodes, which file they belong to
}

export interface GraphEdge {
  from: string; // ID of the source node
  to: string;   // ID of the target node
  label?: string; // e.g., "imports", "inherits", "calls"
  comment?: string; // Semantic comment for the edge itself (less common)
}

/**
 * Builds a file dependency graph based on import statements.
 * Nodes are file paths (relative to projectRoot), edges represent imports.
 */
export function buildFileDependencyGraph(allFilesInfo: FileInfo[], projectRoot: string): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const filePaths = new Set<string>(allFilesInfo.map(f => f.relativePath));

  allFilesInfo.forEach(fileInfo => {
    nodes.push({
      id: fileInfo.relativePath,
      label: `${fileInfo.relativePath} — ${fileInfo.comment || generateHeuristicComment(path.basename(fileInfo.relativePath), 'file')}`.substring(0, 80),
      type: 'file',
      comment: fileInfo.comment || generateHeuristicComment(path.basename(fileInfo.relativePath), 'file'),
    });

    fileInfo.imports.forEach(imp => {
      // Try to resolve the import path relative to the current file and project root
      let resolvedPath: string | null = null;
      if (imp.path.startsWith('.')) { // Relative import
        resolvedPath = path.normalize(path.join(path.dirname(fileInfo.relativePath), imp.path));
      } else {
        // Could be a project-local module (e.g. 'src/utils/helpers') or external lib
        // For now, only link if it directly matches another file's relative path (simplified)
        if (filePaths.has(imp.path) || filePaths.has(`${imp.path}.js`) || filePaths.has(`${imp.path}.ts`)) {
           resolvedPath = filePaths.has(imp.path) ? imp.path : (filePaths.has(`${imp.path}.js`) ? `${imp.path}.js` : `${imp.path}.ts`);
        }
      }

      if (resolvedPath && filePaths.has(resolvedPath)) {
        edges.push({
          from: fileInfo.relativePath,
          to: resolvedPath,
          label: 'imports',
        });
      } else if (resolvedPath) {
        logger.debug(`Import from ${fileInfo.relativePath} to ${imp.path} (resolved: ${resolvedPath}) could not be matched to a project file.`);
      }
    });
  });

  return { nodes, edges };
}

/**
 * Builds a class inheritance graph.
 * Nodes are class names, edges represent "inherits from".
 */
export function buildClassInheritanceGraph(allFilesInfo: FileInfo[]): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const classMap = new Map<string, { classInfo: ClassInfo, filePath: string }>();

  allFilesInfo.forEach(fileInfo => {
    fileInfo.classes.forEach(classInfo => {
      const classId = `${fileInfo.relativePath}::${classInfo.name}`; // Qualify class name with file path
      nodes.push({
        id: classId,
        label: `${classInfo.name} — ${classInfo.comment || generateHeuristicComment(classInfo.name, 'class')}`.substring(0,80),
        type: 'class',
        comment: classInfo.comment || generateHeuristicComment(classInfo.name, 'class'),
        filePath: fileInfo.relativePath,
      });
      classMap.set(classInfo.name, { classInfo, filePath: fileInfo.relativePath }); // For simpler lookup by raw name
      classMap.set(classId, { classInfo, filePath: fileInfo.relativePath }); // For qualified lookup
    });
  });

  classMap.forEach(({ classInfo, filePath }, classId) => {
    if (classInfo.parentClass) {
      // Try to find the parent class, first by raw name then by attempting to qualify it if not found
      let parentEntry = classMap.get(classInfo.parentClass);
      let parentClassId = classInfo.parentClass;

      if (parentEntry) {
        parentClassId = `${parentEntry.filePath}::${parentEntry.classInfo.name}`;
      } else {
        // Attempt to find if parentClass is in the same file
        const sameFileParentId = `${filePath}::${classInfo.parentClass}`;
        if (classMap.has(sameFileParentId)) {
            parentClassId = sameFileParentId;
        } else {
            // If not found directly or in the same file, it might be an external class or not mapped
            // For now, we'll create a node for it if it doesn't exist, to show the link
            if (!Array.from(classMap.keys()).some(k => k.endsWith(`::${classInfo.parentClass}`))) {
                 nodes.push({ id: classInfo.parentClass, label: `${classInfo.parentClass} — (External or Unresolved)`, type: 'class', comment: '(External or Unresolved)' });
            }
            parentClassId = classInfo.parentClass; // Use the raw name as ID
        }
      }


      edges.push({
        from: parentClassId, // Parent
        to: classId,       // Child
        label: 'inherits',
      });
    }
  });

  return { nodes, edges };
}


/**
 * Builds a (very) high-level function/method call graph.
 * This is heuristic and based on simple name matching in source code.
 * Nodes are function/method names (qualified with class/file), edges represent potential calls.
 */
export function buildFunctionCallGraph(allFilesInfo: FileInfo[], sourceCodeCache: Map<string, string>): { nodes: GraphNode[], edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allKnownFunctions = new Map<string, { funcInfo: FunctionInfo, filePath: string, className?: string }>();

  // Populate allKnownFunctions and nodes
  allFilesInfo.forEach(fileInfo => {
    fileInfo.functions.forEach(funcInfo => {
      const funcId = `${fileInfo.relativePath}::${funcInfo.name}`;
      nodes.push({
        id: funcId,
        label: `${funcInfo.name} — ${funcInfo.comment || generateHeuristicComment(funcInfo.name, 'function')}`.substring(0,80),
        type: 'function',
        comment: funcInfo.comment,
        filePath: fileInfo.relativePath,
      });
      allKnownFunctions.set(funcInfo.name, { funcInfo, filePath: fileInfo.relativePath }); // Simple name for now
      allKnownFunctions.set(funcId, { funcInfo, filePath: fileInfo.relativePath });
    });
    fileInfo.classes.forEach(classInfo => {
      classInfo.methods.forEach(methodInfo => {
        const methodId = `${fileInfo.relativePath}::${classInfo.name}.${methodInfo.name}`;
        nodes.push({
          id: methodId,
          label: `${classInfo.name}.${methodInfo.name} — ${methodInfo.comment || generateHeuristicComment(methodInfo.name, 'method', undefined, classInfo.name)}`.substring(0,80),
          type: 'method',
          comment: methodInfo.comment,
          filePath: fileInfo.relativePath,
        });
        allKnownFunctions.set(`${classInfo.name}.${methodInfo.name}`, { funcInfo: methodInfo, filePath: fileInfo.relativePath, className: classInfo.name }); // Qualified name
        allKnownFunctions.set(methodId, { funcInfo: methodInfo, filePath: fileInfo.relativePath, className: classInfo.name });
      });
    });
  });

  // Heuristic call detection
  allFilesInfo.forEach(fileInfo => {
    const sourceCode = sourceCodeCache.get(fileInfo.filePath);
    if (!sourceCode) return;

    const processSymbolList = (symbols: FunctionInfo[], currentSymbolType: 'function' | 'method', currentClassName?: string) => {
        symbols.forEach(callerInfo => {
            const callerId = currentClassName
                ? `${fileInfo.relativePath}::${currentClassName}.${callerInfo.name}`
                : `${fileInfo.relativePath}::${callerInfo.name}`;

            const functionBody = sourceCode.substring(
                sourceCode.indexOf('{', callerInfo.startLine > 0 ? sourceCode.indexOf('\n', callerInfo.startLine -1) : 0 ), // Approx start
                sourceCode.lastIndexOf('}', callerInfo.endLine > 0 ? sourceCode.indexOf('\n', callerInfo.endLine) : sourceCode.length) //Approx end
            );


            if (!functionBody) return;

            allKnownFunctions.forEach(({ funcInfo: calleeInfo, filePath: calleeFilePath, className: calleeClassName }, calleeKey) => {
                const calleeName = calleeInfo.name;
                const calleeId = calleeClassName
                    ? `${calleeFilePath}::${calleeClassName}.${calleeName}`
                    : `${calleeFilePath}::${calleeName}`;

                if (callerId === calleeId) return; // Don't link to self

                // Simple regex to find function name possibly followed by ( or .
                // This is very basic and will have false positives/negatives.
                const callRegex = new RegExp(`\\b${escapeRegExp(calleeName)}\\b\\s*(?:\\(|\\.)`);
                if (callRegex.test(functionBody)) {
                    edges.push({
                        from: callerId,
                        to: calleeId,
                        label: 'calls?', // Indicate heuristic nature
                    });
                }
            });
        });
    };

    processSymbolList(fileInfo.functions, 'function');
    fileInfo.classes.forEach(classInfo => {
        processSymbolList(classInfo.methods, 'method', classInfo.name);
    });
  });


  return { nodes: Array.from(new Set(nodes.map(n => n.id))).map(id => nodes.find(n => n.id === id)!), edges };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Helper function from astAnalyzer.ts, duplicated for now or move to a shared util
function generateHeuristicComment(
  name: string,
  type: 'function' | 'class' | 'method' | 'property' | 'import' | 'file',
  signature?: string,
  parentClass?: string
): string {
  const A_AN = ['a', 'e', 'i', 'o', 'u'].includes(name.charAt(0).toLowerCase()) ? 'An' : 'A';
  const nameParts = name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[\s_]+/).filter(Boolean);
  const readableName = nameParts.join(' ');

  switch (type) {
    case 'function':
      return `Performs an action related to ${readableName}.`;
    case 'method':
      return `Method ${readableName} of class ${parentClass || 'N/A'}.`;
    case 'class':
      return `${A_AN} ${readableName} class definition.`;
    case 'property':
      return `Property ${readableName} of class ${parentClass || 'N/A'}.`;
    case 'import':
      return `Imports module or items from '${readableName}'.`;
    case 'file':
      return `File containing code related to ${readableName}.`; // For file-level comments
    default:
      return `Symbol ${readableName}.`;
  }
}