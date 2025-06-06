/**
 * Output package type definitions for the Context Curator tool.
 * This file contains interfaces and schemas for the final output structure and XML serialization.
 */

import { z } from 'zod';
import { taskTypeSchema } from './context-curator.js';

/**
 * Schema for package metadata
 */
export const packageMetadataSchema = z.object({
  /** Timestamp when the package was generated */
  generationTimestamp: z.date(),
  /** Target directory that was analyzed */
  targetDirectory: z.string().min(1, 'Target directory cannot be empty'),
  /** Original user prompt */
  originalPrompt: z.string().min(1, 'Original prompt cannot be empty'),
  /** Refined prompt after enhancement */
  refinedPrompt: z.string().min(1, 'Refined prompt cannot be empty'),
  /** Total estimated token count for the package */
  totalTokenEstimate: z.number().min(0),
  /** Processing time in milliseconds */
  processingTimeMs: z.number().min(0),
  /** Detected task type */
  taskType: taskTypeSchema,
  /** Package version */
  version: z.string().min(1),
  /** Format version for compatibility */
  formatVersion: z.string().min(1),
  /** Tool version that generated this package */
  toolVersion: z.string().min(1),
  /** Whether codemap cache was used */
  codemapCacheUsed: z.boolean(),
  /** Total number of files analyzed */
  filesAnalyzed: z.number().min(0),
  /** Number of files included in the package */
  filesIncluded: z.number().min(0)
});

export type PackageMetadata = z.infer<typeof packageMetadataSchema>;

/**
 * Schema for content sections within files
 */
export const contentSectionSchema = z.object({
  /** Type of content section */
  type: z.enum(['full', 'optimized']),
  /** Starting line number (1-based) */
  startLine: z.number().min(1),
  /** Ending line number (1-based) */
  endLine: z.number().min(1),
  /** Content of this section */
  content: z.string(),
  /** Token count for this section */
  tokenCount: z.number().min(0),
  /** Description of this section */
  description: z.string(),
  /** Original token count before optimization (for optimized sections) */
  originalTokenCount: z.number().min(0).optional()
}).refine(data => data.startLine <= data.endLine, {
  message: 'Start line must be less than or equal to end line',
  path: ['startLine']
});

export type ContentSection = z.infer<typeof contentSectionSchema>;

/**
 * Schema for function relevance scores
 */
export const functionRelevanceScoreSchema = z.object({
  /** Function name */
  functionName: z.string().min(1, 'Function name cannot be empty'),
  /** Relevance score (0.0 to 1.0) */
  relevanceScore: z.number().min(0).max(1),
  /** Confidence in the score */
  confidence: z.number().min(0).max(1),
  /** Reasoning for the score */
  reasoning: z.string().min(1),
  /** Likelihood of modification */
  modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low']),
  /** Line numbers where function is defined */
  lineNumbers: z.object({
    start: z.number().min(1),
    end: z.number().min(1)
  }),
  /** Function complexity assessment */
  complexity: z.enum(['low', 'medium', 'high', 'very_high']),
  /** Function dependencies */
  dependencies: z.array(z.string())
});

export type FunctionRelevanceScore = z.infer<typeof functionRelevanceScoreSchema>;

/**
 * Schema for class relevance scores
 */
export const classRelevanceScoreSchema = z.object({
  /** Class name */
  className: z.string().min(1, 'Class name cannot be empty'),
  /** Relevance score (0.0 to 1.0) */
  relevanceScore: z.number().min(0).max(1),
  /** Confidence in the score */
  confidence: z.number().min(0).max(1),
  /** Reasoning for the score */
  reasoning: z.string().min(1),
  /** Likelihood of modification */
  modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low']),
  /** Line numbers where class is defined */
  lineNumbers: z.object({
    start: z.number().min(1),
    end: z.number().min(1)
  }),
  /** Class complexity assessment */
  complexity: z.enum(['low', 'medium', 'high', 'very_high']),
  /** Method relevance scores */
  methods: z.array(z.object({
    methodName: z.string().min(1),
    relevanceScore: z.number().min(0).max(1),
    modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low']),
    lineNumbers: z.object({
      start: z.number().min(1),
      end: z.number().min(1)
    })
  })),
  /** Property relevance scores */
  properties: z.array(z.object({
    propertyName: z.string().min(1),
    relevanceScore: z.number().min(0).max(1),
    modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low']),
    lineNumber: z.number().min(1)
  })),
  /** Inheritance information */
  inheritance: z.object({
    extends: z.string().nullable(),
    implements: z.array(z.string())
  })
});

export type ClassRelevanceScore = z.infer<typeof classRelevanceScoreSchema>;

/**
 * Schema for file relevance scores
 */
export const fileRelevanceScoreSchema = z.object({
  /** Overall relevance score */
  overall: z.number().min(0).max(1),
  /** Confidence in the overall score */
  confidence: z.number().min(0).max(1),
  /** Likelihood of modification */
  modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low']),
  /** Reasoning for the score */
  reasoning: z.array(z.string()).min(1, 'At least one reasoning item is required'),
  /** Categories this file belongs to */
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  /** Function-level relevance scores */
  functions: z.array(functionRelevanceScoreSchema).optional(),
  /** Class-level relevance scores */
  classes: z.array(classRelevanceScoreSchema).optional(),
  /** Imported modules/packages */
  imports: z.array(z.string()),
  /** Exported symbols */
  exports: z.array(z.string())
});

export type FileRelevanceScore = z.infer<typeof fileRelevanceScoreSchema>;

/**
 * Schema for processed files with full content
 */
export const processedFileSchema = z.object({
  /** File path relative to project root */
  path: z.string().min(1, 'File path cannot be empty'),
  /** File content (may be optimized) */
  content: z.string(),
  /** Whether content has been optimized */
  isOptimized: z.boolean(),
  /** Total lines in the original file */
  totalLines: z.number().min(0),
  /** Lines with full content (for optimized files) */
  fullContentLines: z.number().min(0).optional(),
  /** Lines with optimized content (for optimized files) */
  optimizedLines: z.number().min(0).optional(),
  /** Estimated token count */
  tokenEstimate: z.number().min(0),
  /** Content sections breakdown */
  contentSections: z.array(contentSectionSchema),
  /** File relevance score */
  relevanceScore: fileRelevanceScoreSchema,
  /** Brief reasoning for file inclusion */
  reasoning: z.string().min(1),
  /** Programming language */
  language: z.string(),
  /** Last modification date */
  lastModified: z.date(),
  /** File size in bytes */
  size: z.number().min(0)
});

export type ProcessedFile = z.infer<typeof processedFileSchema>;

/**
 * Schema for file references (low priority files)
 */
export const fileReferenceSchema = z.object({
  /** File path relative to project root */
  path: z.string().min(1, 'File path cannot be empty'),
  /** Relevance score */
  relevanceScore: z.number().min(0).max(1),
  /** Brief reasoning for inclusion */
  reasoning: z.string().min(1),
  /** Estimated token count */
  tokenEstimate: z.number().min(0),
  /** Last modification date */
  lastModified: z.date(),
  /** File size in bytes */
  size: z.number().min(0),
  /** Programming language */
  language: z.string()
});

export type FileReference = z.infer<typeof fileReferenceSchema>;

/**
 * Schema for XML serializable objects
 */
export const xmlSerializableSchema = z.object({
  /** Method to convert object to XML string */
  toXML: z.function().returns(z.string()),
  /** XML version */
  xmlVersion: z.string().optional(),
  /** XML encoding */
  xmlEncoding: z.string().optional()
});

export type XMLSerializable = z.infer<typeof xmlSerializableSchema>;

/**
 * Schema for the complete context package
 */
export const contextPackageSchema = z.object({
  /** Package metadata */
  metadata: packageMetadataSchema,
  /** Refined prompt after enhancement */
  refinedPrompt: z.string().min(1),
  /** Path to the generated codemap */
  codemapPath: z.string().min(1),
  /** High priority files with full content */
  highPriorityFiles: z.array(processedFileSchema),
  /** Medium priority files with full content */
  mediumPriorityFiles: z.array(processedFileSchema),
  /** Low priority files (references only) */
  lowPriorityFiles: z.array(fileReferenceSchema),
  /** Generated meta-prompt for downstream AI agents */
  metaPrompt: z.string().optional()
});

export type ContextPackage = z.infer<typeof contextPackageSchema>;

/**
 * Validation helper functions
 */
export const validatePackageMetadata = (metadata: unknown): metadata is PackageMetadata => {
  try {
    packageMetadataSchema.parse(metadata);
    return true;
  } catch {
    return false;
  }
};

export const validateProcessedFile = (file: unknown): file is ProcessedFile => {
  try {
    processedFileSchema.parse(file);
    return true;
  } catch {
    return false;
  }
};

export const validateFileReference = (reference: unknown): reference is FileReference => {
  try {
    fileReferenceSchema.parse(reference);
    return true;
  } catch {
    return false;
  }
};

export const validateFileRelevanceScore = (score: unknown): score is FileRelevanceScore => {
  try {
    fileRelevanceScoreSchema.parse(score);
    return true;
  } catch {
    return false;
  }
};

export const validateContextPackage = (pkg: unknown): pkg is ContextPackage => {
  try {
    contextPackageSchema.parse(pkg);
    return true;
  } catch {
    return false;
  }
};

/**
 * Helper function to create empty context package
 */
export const createEmptyContextPackage = (
  targetDirectory: string,
  originalPrompt: string,
  taskType: 'refactoring' | 'feature_addition' | 'bug_fix' | 'general' = 'general'
): ContextPackage => {
  return {
    metadata: {
      generationTimestamp: new Date(),
      targetDirectory,
      originalPrompt,
      refinedPrompt: originalPrompt,
      totalTokenEstimate: 0,
      processingTimeMs: 0,
      taskType,
      version: '1.0.0',
      formatVersion: '1.0.0',
      toolVersion: '1.0.0',
      codemapCacheUsed: false,
      filesAnalyzed: 0,
      filesIncluded: 0
    },
    refinedPrompt: originalPrompt,
    codemapPath: '',
    highPriorityFiles: [],
    mediumPriorityFiles: [],
    lowPriorityFiles: []
  };
};
