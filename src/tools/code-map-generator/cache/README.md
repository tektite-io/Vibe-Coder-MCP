# Memory Management System for Code-Map Generator

This directory contains the memory management system for the Code-Map Generator tool. The system is designed to efficiently manage memory usage during code map generation, particularly for large codebases.

## Components

### MemoryManager

The `MemoryManager` class is responsible for coordinating memory usage across different caches and components. It provides:

- Memory usage monitoring and statistics
- Automatic pruning of caches when memory usage exceeds thresholds
- Garbage collection suggestions
- Creation and management of specialized caches

### MemoryCache

The `MemoryCache` class implements an in-memory LRU (Least Recently Used) cache with:

- Configurable maximum entries and size
- TTL (Time To Live) support
- Size-aware eviction policies
- Disposal callbacks for cleanup

### FileCache

The `FileCache` class implements a file-based cache with:

- Persistent storage of cache entries
- Automatic cleanup of expired entries
- Size-based eviction policies
- Serialization and deserialization support

### GrammarManager

The `GrammarManager` class manages Tree-sitter grammar loading with:

- Lazy loading of grammars
- LRU-based grammar eviction
- Preloading of common grammars
- Grammar usage statistics

## Usage

The memory management system is integrated into the Code-Map Generator tool and is used automatically. However, you can also use it directly:

```javascript
// Initialize memory manager
const memoryManager = new MemoryManager({
  maxMemoryPercentage: 0.5, // Use up to 50% of system memory
  monitorInterval: 60000,   // Check memory usage every minute
  autoManage: true          // Enable automatic memory management
});

// Create a memory cache
const cache = memoryManager.createSourceCodeCache();

// Use the cache
cache.set('key', 'value');
const value = cache.get('key');

// Get memory statistics
const stats = memoryManager.getMemoryStats();
console.log(stats);

// Run garbage collection
memoryManager.runGarbageCollection();
```

## Testing

You can test the memory management system using the `test-memory-management.js` script:

```bash
node src/tools/code-map-generator/test-memory-management.js [directory]
```

This script runs the Code-Map Generator on the specified directory (or the current directory if none is specified) and logs memory usage statistics.

## Configuration

The memory management system can be configured through the Code-Map Generator configuration:

```javascript
const config = {
  cache: {
    enabled: true,           // Enable caching
    maxEntries: 1000,        // Maximum number of entries in the cache
    maxAge: 60 * 60 * 1000,  // Maximum age of entries (1 hour)
  }
};
```

## Implementation Details

### Memory Usage Monitoring

The `MemoryManager` monitors memory usage using Node.js's `os` and `v8` modules. It tracks:

- System memory usage
- V8 heap usage
- Cache sizes and entry counts

### Garbage Collection

The `MemoryManager` provides a `runGarbageCollection` method that:

1. Clears all caches
2. Unloads unused grammars
3. Suggests to V8 that now might be a good time for garbage collection

Note that this doesn't force garbage collection, as that's not directly possible in Node.js. It only provides hints to the engine and clears references to allow GC to reclaim memory.

### Cache Eviction

Both `MemoryCache` and `FileCache` use LRU eviction policies. When a cache reaches its maximum size or entry count, the least recently used entries are evicted first.

### Grammar Loading

The `GrammarManager` loads Tree-sitter grammars on demand and unloads them when they're no longer needed. It uses an LRU policy to determine which grammars to unload.

## Future Improvements

- Add more sophisticated memory usage prediction
- Implement adaptive cache sizing based on available memory
- Add support for shared memory caches across multiple processes
- Implement more efficient serialization for Tree-sitter trees
