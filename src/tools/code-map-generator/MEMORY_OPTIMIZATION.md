# Memory Optimization Features

The Code Map Generator includes several memory optimization features to handle large codebases efficiently. This document provides an overview of these features and how to configure them.

## Memory Optimization Strategies

### 1. Memory-Aware Grammar Loading

The tool dynamically loads and unloads language grammars based on usage patterns:

- Only loads grammars when needed for parsing specific file types
- Unloads unused grammars when memory pressure is high
- Prioritizes recently used grammars for retention

**Configuration:**
```json
{
  "memory": {
    "unloadGrammarsThreshold": 0.7,  // Threshold for unloading unused grammars (0.0-1.0)
    "maxLoadedGrammars": 5           // Maximum number of grammars to keep loaded
  }
}
```

### 2. Tiered Caching System

Combines in-memory and file-based caching for optimal performance:

- Fast in-memory cache for frequently accessed items
- Persistent file-based cache for long-term storage
- Automatic eviction of least recently used items
- Memory-sensitive cache sizing

**Configuration:**
```json
{
  "cache": {
    "enabled": true,
    "useMemoryCache": true,
    "maxEntries": 10000,
    "maxAge": 3600000,
    "memoryThreshold": 0.5
  }
}
```

### 3. Batch Processing

Processes files in batches to limit memory usage:

- Configurable batch size based on available memory
- Garbage collection between batches
- Progress tracking for each batch

**Configuration:**
```json
{
  "processing": {
    "batchSize": 100,
    "forcedGcBetweenBatches": true
  }
}
```

### 4. Language-Based Batching

Groups files by language to minimize grammar switching:

- Processes files of the same language together
- Reduces the need to load/unload grammars
- Optimizes memory usage for large, multi-language codebases

**Configuration:**
```json
{
  "processing": {
    "useLanguageBasedBatching": true
  }
}
```

### 5. Metadata-Focused Caching

Stores lightweight metadata instead of full ASTs:

- Reduces memory footprint for cached items
- Preserves essential information for dependency analysis
- Enables faster serialization/deserialization

**Configuration:**
```json
{
  "cache": {
    "useMetadataCache": true
  }
}
```

### 6. Memory Monitoring

Tracks memory usage and detects potential memory leaks:

- Real-time memory usage statistics
- Automatic detection of memory leaks
- Configurable thresholds for memory pressure
- Detailed memory usage reports

**Configuration:**
```json
{
  "memory": {
    "monitoringEnabled": true,
    "maxHeapPercentage": 0.8,
    "samplingInterval": 5000,
    "leakDetectionEnabled": true
  }
}
```

## Memory Usage Metrics

The tool provides the following memory usage metrics:

- **Heap Used**: Amount of JavaScript heap memory currently in use
- **Heap Total**: Total available JavaScript heap memory
- **RSS (Resident Set Size)**: Total memory allocated for the process
- **External Memory**: Memory used by C++ objects bound to JavaScript objects
- **Array Buffers**: Memory used by ArrayBuffer and SharedArrayBuffer objects
- **Memory Usage Percentage**: Percentage of system memory in use

## Troubleshooting Memory Issues

If you encounter memory issues:

1. **Reduce Batch Size**: Lower the `batchSize` setting to process fewer files at once
2. **Increase Unloading Frequency**: Lower the `unloadGrammarsThreshold` to unload grammars more aggressively
3. **Limit Memory Cache**: Reduce `memoryThreshold` or disable memory cache for very large codebases
4. **Enable Forced GC**: Set `forcedGcBetweenBatches` to true to force garbage collection between batches
5. **Monitor Memory Usage**: Enable memory monitoring to identify memory usage patterns
6. **Use Language-Based Batching**: Enable language-based batching to reduce grammar switching
7. **Disable Import Resolution**: For very large codebases, consider disabling import resolution

## Performance Testing

To evaluate memory optimization effectiveness:

```bash
node dist/test-performance.js --dir /path/to/codebase
```

This will generate a performance report with memory usage statistics, including:

- Peak memory usage
- Memory usage over time
- Garbage collection frequency
- Cache hit/miss ratios
- Grammar loading/unloading statistics

## Best Practices

- Start with default settings for most codebases
- For large codebases (>10,000 files), enable language-based batching
- For memory-constrained environments, reduce `maxHeapPercentage` to 0.6 or lower
- Monitor memory usage during processing to identify optimization opportunities
- Use file-based caching for repeated analysis of the same codebase
