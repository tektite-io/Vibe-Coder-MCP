// Defines the in-memory representation for the code map.

export interface FunctionInfo {
  name: string;
  signature: string; // e.g., "myFunction(param1: string, param2: number): boolean"
  comment?: string; // Heuristic or docstring
  startLine: number;
  endLine: number;
  isAsync?: boolean; // Optional metadata
  isExported?: boolean; // Optional metadata
  // Future: parameters, returnType, etc.
}

export interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties?: Array<{ name: string; type?: string; comment?: string; startLine: number; endLine: number }>;
  parentClass?: string; // Name of parent class
  implementedInterfaces?: string[];
  comment?: string;
  startLine: number;
  endLine: number;
  isExported?: boolean; // Optional metadata
  // Future: decorators, generics, etc.
}

export interface ImportInfo {
  path: string; // The path string from the import statement
  importedItems?: string[]; // Specific items imported, e.g., { parse } from 'url' -> ['parse']
  isDefault?: boolean; // If it's a default import
  alias?: string; // If the import is aliased
  startLine: number;
  endLine: number;
}

export interface FileInfo {
  filePath: string; // Relative to project root for display, absolute for processing
  relativePath: string; // Path relative to the scanned project's root
  classes: ClassInfo[];
  functions: FunctionInfo[]; // Top-level functions in the file
  imports: ImportInfo[];
  comment?: string; // File-level comment/docstring (e.g., from top of file)
  // exports?: string[]; // Optional: list of exported symbols (can be complex to determine accurately for all langs)
  // Future: globalVariables, enums, typeAliases, etc.
}

export interface CodeMap {
  projectPath: string; // Absolute path to the root of the scanned project
  files: FileInfo[];
  // Summary statistics can be added here later
  // totalFiles: number;
  // totalClasses: number;
  // totalFunctions: number;
  // generationDate: string;
}
