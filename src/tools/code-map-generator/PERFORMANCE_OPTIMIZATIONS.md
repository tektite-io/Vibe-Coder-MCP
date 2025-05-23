# Code-Map Generator Performance Optimizations

This document describes the performance optimizations implemented in the code-map generator to improve its performance with large codebases.

## Overview

The code-map generator has been optimized to handle large codebases more efficiently by:

1. Eliminating in-memory caching in favor of file-based caching
2. Implementing incremental processing to only process files that have changed
3. Making single file output the default
4. Ensuring class properties are properly included in the output

## Configuration Options

The following configuration options have been added or modified:

### Cache Configuration

```typescript
interface CacheConfig {
  enabled: boolean;
  maxEntries?: number;
  maxAge?: number;
  cacheDir?: string;
  useFileBasedAccess?: boolean; // New: Whether to use file-based source code access (default: true)
  maxCachedFiles?: number; // New: Maximum number of files to cache in memory (default: 0 = disabled)
  useFileHashes?: boolean; // New: Whether to use file hashes for change detection (default: true)
}
```

### Processing Configuration

```typescript
interface ProcessingConfig {
  batchSize?: number;
  logMemoryUsage?: boolean;
  maxMemoryUsage?: number;
  incremental?: boolean; // New: Whether to use incremental processing (default: true)
  periodicGC?: boolean; // New: Whether to run periodic garbage collection (default: true)
  gcInterval?: number; // New: Interval for periodic garbage collection (default: 5 minutes)
  incrementalConfig?: IncrementalProcessingConfig; // New: Configuration for incremental processing
}

interface IncrementalProcessingConfig {
  useFileHashes?: boolean; // Whether to use file hashes for change detection (default: true)
  useFileMetadata?: boolean; // Whether to use file metadata for change detection (default: true)
  maxCachedHashes?: number; // Maximum number of file hashes to cache (default: 10000)
  maxHashAge?: number; // Maximum age of cached hashes (default: 24 hours)
  previousFilesListPath?: string; // Path to the file containing the list of previously processed files
  saveProcessedFilesList?: boolean; // Whether to save the list of processed files (default: true)
}
```

### Output Configuration

```typescript
interface OutputConfig {
  outputDir?: string;
  format?: 'markdown' | 'json'; // Default is 'markdown'
  splitOutput?: boolean; // Default is now false (single file output)
  filePrefix?: string;
  maxAge?: number;
  maxOutputDirs?: number;
  cleanupOldOutputs?: boolean;
}
```

## Default Configuration

The default configuration has been updated to:

```typescript
const DEFAULT_CONFIG: Partial<CodeMapGeneratorConfig> = {
  cache: {
    enabled: true,
    maxEntries: 10000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    useFileBasedAccess: true,
    useFileHashes: true,
    maxCachedFiles: 0, // Disable in-memory caching of file content
  },
  processing: {
    batchSize: 100,
    logMemoryUsage: false,
    maxMemoryUsage: 1024, // 1GB
    incremental: true,
    incrementalConfig: {
      useFileHashes: true,
      useFileMetadata: true,
      saveProcessedFilesList: true
    }
  },
  output: {
    format: 'markdown',
    splitOutput: false, // Make single file output the default
  },
};
```

## CLI Options

The following CLI options have been added:

```
-s, --split-output     Split output into multiple files (default: false)
--incremental          Use incremental processing (default: true)
--no-incremental       Disable incremental processing
```

## Incremental Processing

Incremental processing is a new feature that allows the code-map generator to only process files that have changed since the last run. This can significantly improve performance when running the tool multiple times on the same codebase.

### How It Works

1. The incremental processor keeps track of processed files and their metadata (size, modification time, and optionally a hash of the file content).
2. When the code-map generator is run again, it compares the current state of each file with the stored metadata.
3. Only files that have changed (based on size, modification time, or content hash) are processed again.
4. The list of processed files is saved for the next run.

### File Change Detection

Files are considered changed if any of the following conditions are met:

- The file wasn't processed before
- The file size has changed
- The file modification time has changed
- The file content hash has changed (if `useFileHashes` is enabled)

## Testing

A test script (`test-performance.js`) has been provided to measure the performance of the code-map generator with different configurations. This can be used to verify the performance improvements with large codebases.

### Usage

```bash
node test-performance.js [directory] [--incremental] [--no-incremental] [--split-output] [--output-format=markdown|json]
```

### Example

```bash
node test-performance.js ../../ --incremental
```

## Best Practices

For optimal performance with large codebases:

1. **Enable incremental processing**: This is now the default, but can be explicitly enabled with `--incremental`.
2. **Use file-based caching**: This is now the default, with in-memory caching disabled.
3. **Use single file output**: This is now the default, but can be overridden with `--split-output`.
4. **Use markdown output**: This is the default and is more efficient than JSON output.
5. **Run periodic garbage collection**: This is enabled by default and helps manage memory usage.

## Future Optimizations

Additional optimizations that could be implemented in the future:

1. **Parallel processing**: Implement a worker pool to process files in parallel.
2. **Lazy loading of language grammars**: Load language grammars on demand instead of preloading all of them.
3. **Smarter dependency tracking**: Only reprocess files that depend on changed files.
4. **Memory budget system**: Implement a memory budget system that monitors memory usage and releases resources when memory usage exceeds thresholds.
