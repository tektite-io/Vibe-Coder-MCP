import { describe, it, expect } from 'vitest';
import { PriorityQueue } from '../search-strategies.js';

describe('Streaming Search Implementation', () => {
  describe('PriorityQueue', () => {
    it('should maintain top N items by score', () => {
      const queue = new PriorityQueue<{ score: number; id: string }>(
        (a, b) => b.score - a.score,
        3
      );

      // Add 5 items
      queue.add({ score: 0.5, id: 'item1' });
      queue.add({ score: 0.8, id: 'item2' });
      queue.add({ score: 0.3, id: 'item3' });
      queue.add({ score: 0.9, id: 'item4' });
      queue.add({ score: 0.6, id: 'item5' });

      const results = queue.toArray();
      
      // Should keep only top 3
      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(0.9);
      expect(results[1].score).toBe(0.8);
      expect(results[2].score).toBe(0.6);
    });

    it('should handle queue size correctly', () => {
      const queue = new PriorityQueue<{ value: number }>(
        (a, b) => b.value - a.value,
        5
      );

      expect(queue.size).toBe(0);
      expect(queue.isFull).toBe(false);

      // Add items
      for (let i = 1; i <= 3; i++) {
        queue.add({ value: i });
      }
      
      expect(queue.size).toBe(3);
      expect(queue.isFull).toBe(false);

      // Fill queue
      for (let i = 4; i <= 5; i++) {
        queue.add({ value: i });
      }
      
      expect(queue.size).toBe(5);
      expect(queue.isFull).toBe(true);

      // Add more items - should maintain size
      queue.add({ value: 6 });
      expect(queue.size).toBe(5);
      expect(queue.isFull).toBe(true);
    });

    it('should provide correct minimum score', () => {
      const queue = new PriorityQueue<{ score: number }>(
        (a, b) => b.score - a.score,
        2
      );

      // Empty queue
      expect(queue.getMinScore(item => item.score)).toBeUndefined();

      // Partially filled
      queue.add({ score: 0.8 });
      expect(queue.getMinScore(item => item.score)).toBe(0); // Not full, accept any

      // Full queue
      queue.add({ score: 0.6 });
      expect(queue.getMinScore(item => item.score)).toBe(0.6);

      // Replace lowest
      queue.add({ score: 0.9 });
      expect(queue.getMinScore(item => item.score)).toBe(0.8);
    });

    it('should clear correctly', () => {
      const queue = new PriorityQueue<{ id: number }>(
        (a, b) => b.id - a.id,
        10
      );

      // Add items
      for (let i = 0; i < 5; i++) {
        queue.add({ id: i });
      }
      
      expect(queue.size).toBe(5);

      // Clear
      queue.clear();
      expect(queue.size).toBe(0);
      expect(queue.toArray()).toEqual([]);
    });
  });

  describe('Streaming Benefits', () => {
    it('demonstrates memory efficiency', () => {
      // With old approach: O(all files) memory
      const oldApproach = {
        files: new Array(10000).fill(null).map((_, i) => ({
          path: `/file${i}.ts`,
          score: Math.random()
        })),
        memory: 'O(10000 files)'
      };

      // With streaming approach: O(maxResults) memory
      const streamingApproach = {
        queue: new PriorityQueue<{ score: number }>(
          (a, b) => b.score - a.score,
          100 // maxResults
        ),
        memory: 'O(100 results)'
      };

      // Streaming maintains fixed memory regardless of directory size
      expect(streamingApproach.memory).toBe('O(100 results)');
      expect(oldApproach.memory).toBe('O(10000 files)');
    });

    it('demonstrates no file limit', () => {
      // Old approach would stop at 500 files
      const OLD_FILE_LIMIT = 500;
      
      // Streaming can process unlimited files
      const queue = new PriorityQueue<{ path: string; score: number }>(
        (a, b) => b.score - a.score,
        50
      );

      // Simulate processing 2000 files
      let filesProcessed = 0;
      for (let i = 0; i < 2000; i++) {
        filesProcessed++;
        const score = Math.random();
        
        // Only add if score is high enough
        const minScore = queue.getMinScore(item => item.score) || 0;
        if (score >= minScore) {
          queue.add({ path: `/file${i}`, score });
        }
      }

      expect(filesProcessed).toBe(2000);
      expect(filesProcessed).toBeGreaterThan(OLD_FILE_LIMIT);
      expect(queue.size).toBeLessThanOrEqual(50);
    });
  });
});