/**
 * Port Allocation Utility
 * 
 * Provides dynamic port allocation functionality to eliminate EADDRINUSE errors
 * and enable reliable port management across all transport services.
 */

import { createServer } from 'net';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import logger from '../logger.js';

// Port range interface
export interface PortRange {
  start: number;
  end: number;
  service: string;
}

// Port allocation result interface
export interface PortAllocationResult {
  port: number;
  service: string;
  attempted: number[];
  success: boolean;
  error?: string;
}

// Port allocation summary for multiple services
export interface AllocationSummary {
  allocations: Map<string, PortAllocationResult>;
  totalAttempted: number[];
  success: boolean;
}

// Instance tracking interface
export interface InstanceInfo {
  pid: number;
  port: number;
  service: string;
  startTime: number;
}

// Instance tracking file location - will be configurable
const DEFAULT_INSTANCE_TRACKING_DIR = path.join(os.tmpdir(), 'vibe-coder-instances');
const INSTANCE_FILE_PREFIX = 'instance-';

// System port exclusion ranges
const EXCLUDED_PORT_RANGES = [
  { start: 1, end: 1024, reason: 'System/privileged ports' },
  { start: 5060, end: 5061, reason: 'SIP' },
  { start: 3306, end: 3306, reason: 'MySQL' },
  { start: 5432, end: 5432, reason: 'PostgreSQL' },
  { start: 6379, end: 6379, reason: 'Redis' },
  { start: 27017, end: 27017, reason: 'MongoDB' }
];

/**
 * Port Allocator Configuration
 */
export interface PortAllocatorConfig {
  instanceTrackingDir?: string;
}

/**
 * Port Allocator Class
 * 
 * Handles dynamic port allocation with system port exclusion,
 * conflict detection, and cleanup functionality.
 */
export class PortAllocator {
  private static config: PortAllocatorConfig = {};

  /**
   * Get the instance tracking directory
   * Uses configured directory or falls back to default
   */
  private static get INSTANCE_TRACKING_DIR(): string {
    return this.config.instanceTrackingDir || DEFAULT_INSTANCE_TRACKING_DIR;
  }

  /**
   * Initialize the PortAllocator with configuration
   * @param config - Configuration options for PortAllocator
   */
  static initialize(config: PortAllocatorConfig): void {
    this.config = config;
    
    if (config.instanceTrackingDir) {
      logger.info({ 
        instanceTrackingDir: config.instanceTrackingDir 
      }, 'PortAllocator initialized with custom instance tracking directory');
    } else {
      logger.debug({ 
        instanceTrackingDir: DEFAULT_INSTANCE_TRACKING_DIR 
      }, 'PortAllocator using default instance tracking directory');
    }
  }

  /**
   * Get current configuration
   * @returns Current PortAllocator configuration
   */
  static getConfig(): PortAllocatorConfig {
    return { ...this.config };
  }

  /**
   * Check if a port is in the excluded ranges
   * @param port - Port number to check
   * @returns boolean - True if port should be excluded
   */
  static isPortExcluded(port: number): boolean {
    for (const range of EXCLUDED_PORT_RANGES) {
      if (port >= range.start && port <= range.end) {
        logger.debug({ port, reason: range.reason }, 'Port excluded from allocation');
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a port is in use by another vibe-coder instance
   * @param port - Port number to check
   * @returns Promise<boolean> - True if port is in use by vibe-coder
   */
  static async isPortUsedByVibeCoderInstance(port: number): Promise<boolean> {
    try {
      // Try to connect to the port
      const net = await import('net');
      return new Promise((resolve) => {
        const client = net.createConnection({ port }, () => {
          // Connected successfully, port is in use
          client.end();
          logger.debug({ port }, 'Port is in use by another process');
          resolve(true);
        });

        client.on('error', () => {
          // Connection failed, port is not in use
          logger.debug({ port }, 'Port is not in use');
          resolve(false);
        });

        // Timeout after 1 second
        client.setTimeout(1000, () => {
          client.destroy();
          resolve(false);
        });
      });
    } catch (error) {
      logger.error({ err: error, port }, 'Error checking port usage');
      return false;
    }
  }

  /**
   * Check if a specific port is available
   * @param port - Port number to check
   * @returns Promise<boolean> - True if port is available
   */
  static async findAvailablePort(port: number): Promise<boolean> {
    const startTime = Date.now();
    logger.debug({ port, operation: 'port_check_start' }, 'Starting port availability check');

    // Validate port range
    if (port < 0 || port > 65535) {
      logger.debug({
        port,
        available: false,
        error: 'Invalid port range',
        operation: 'port_check_complete'
      }, 'Port availability check: invalid port');
      return false;
    }

    return new Promise((resolve) => {
      const server = createServer();

      server.listen(port, () => {
        server.close(() => {
          const duration = Date.now() - startTime;
          logger.debug({
            port,
            available: true,
            duration,
            operation: 'port_check_complete'
          }, 'Port availability check: available');
          resolve(true);
        });
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        const duration = Date.now() - startTime;
        if (err.code === 'EADDRINUSE') {
          logger.debug({
            port,
            available: false,
            error: err.code,
            duration,
            operation: 'port_check_complete'
          }, 'Port availability check: in use');
          resolve(false);
        } else {
          logger.debug({
            port,
            available: false,
            error: err.message,
            duration,
            operation: 'port_check_complete'
          }, 'Port availability check: error');
          resolve(false);
        }
      });
    });
  }

  /**
   * Find the first available port in a range
   * @param range - Port range to search
   * @returns Promise<PortAllocationResult> - Allocation result
   */
  static async findAvailablePortInRange(range: PortRange): Promise<PortAllocationResult> {
    const attempted: number[] = [];
    
    logger.debug({ 
      service: range.service, 
      start: range.start, 
      end: range.end 
    }, 'Starting port allocation for service');

    for (let port = range.start; port <= range.end; port++) {
      // Skip excluded ports (system ports and common services)
      if (this.isPortExcluded(port)) {
        logger.debug({
          port,
          service: range.service,
          reason: 'excluded_port',
          operation: 'port_skip'
        }, 'Skipping excluded port');
        continue;
      }

      attempted.push(port);

      logger.debug({
        port,
        service: range.service,
        attempt: attempted.length,
        remaining: range.end - port,
        operation: 'port_attempt'
      }, 'Attempting port allocation');

      const isAvailable = await this.findAvailablePort(port);

      if (isAvailable) {
        logger.debug({
          service: range.service,
          port,
          attempted: attempted.length,
          efficiency: `${attempted.length}/${range.end - range.start + 1}`,
          operation: 'range_allocation_success'
        }, 'Port allocated successfully');

        return {
          port,
          service: range.service,
          attempted,
          success: true
        };
      } else {
        logger.debug({
          port,
          service: range.service,
          attempt: attempted.length,
          operation: 'port_conflict'
        }, 'Port conflict detected, trying next port');
      }
    }

    // No available port found in range
    const error = `No available ports in range ${range.start}-${range.end} for service ${range.service}`;
    logger.warn({ 
      service: range.service, 
      range: `${range.start}-${range.end}`, 
      attempted 
    }, error);

    return {
      port: -1,
      service: range.service,
      attempted,
      success: false,
      error
    };
  }

  /**
   * Parse port range string into PortRange object
   * @param envVar - Environment variable value (e.g., "8080-8090")
   * @param defaultRange - Default range to use if parsing fails
   * @returns PortRange - Parsed port range
   */
  static parsePortRange(envVar: string, defaultRange: PortRange): PortRange {
    if (!envVar || envVar.trim() === '') {
      logger.debug({ defaultRange }, 'Empty environment variable, using default range');
      return defaultRange;
    }

    // Handle single port (e.g., "8080")
    if (!envVar.includes('-')) {
      const port = parseInt(envVar.trim(), 10);
      if (isNaN(port) || port <= 0 || port > 65535) {
        logger.warn({ envVar, defaultRange }, 'Invalid single port, using default range');
        return defaultRange;
      }

      logger.debug({ port, service: defaultRange.service }, 'Parsed single port as range');
      return {
        start: port,
        end: port,
        service: defaultRange.service
      };
    }

    // Handle port range (e.g., "8080-8090")
    const parts = envVar.split('-');
    if (parts.length !== 2) {
      logger.warn({ envVar, defaultRange }, 'Invalid port range format, using default range');
      return defaultRange;
    }

    const start = parseInt(parts[0].trim(), 10);
    const end = parseInt(parts[1].trim(), 10);

    // Validate parsed values
    if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0 || start > 65535 || end > 65535) {
      logger.warn({ envVar, start, end, defaultRange }, 'Invalid port numbers, using default range');
      return defaultRange;
    }

    if (start > end) {
      logger.warn({ envVar, start, end, defaultRange }, 'Start port greater than end port, using default range');
      return defaultRange;
    }

    logger.debug({ start, end, service: defaultRange.service }, 'Successfully parsed port range');
    return {
      start,
      end,
      service: defaultRange.service
    };
  }

  /**
   * Detect port conflicts with other vibe-coder instances
   * @param ports - Array of ports to check
   * @returns Promise<Map<number, boolean>> - Map of port to conflict status
   */
  static async detectPortConflicts(ports: number[]): Promise<Map<number, boolean>> {
    const conflicts = new Map<number, boolean>();
    
    logger.debug({ ports }, 'Checking for port conflicts with other instances');
    
    for (const port of ports) {
      const inUse = await this.isPortUsedByVibeCoderInstance(port);
      conflicts.set(port, inUse);
      
      if (inUse) {
        logger.warn({ port }, 'Port conflict detected with another instance');
      }
    }
    
    const conflictCount = Array.from(conflicts.values()).filter(v => v).length;
    logger.info({ 
      portsChecked: ports.length, 
      conflictsFound: conflictCount 
    }, 'Port conflict detection complete');
    
    return conflicts;
  }

  /**
   * Allocate ports for multiple services at once
   * @param ranges - Array of port ranges for different services
   * @returns Promise<AllocationSummary> - Summary of all allocations
   */
  static async allocatePortsForServices(ranges: PortRange[]): Promise<AllocationSummary> {
    const allocations = new Map<string, PortAllocationResult>();
    const totalAttempted: number[] = [];
    const successful: number[] = [];
    const conflicts: number[] = [];
    const errors: string[] = [];
    const batchStartTime = Date.now();

    logger.info({
      serviceCount: ranges.length,
      services: ranges.map(r => r.service),
      totalPortsInRanges: ranges.reduce((sum, r) => sum + (r.end - r.start + 1), 0),
      operation: 'batch_allocation_start'
    }, 'Starting batch port allocation for services');

    for (const range of ranges) {
      try {
        const result = await this.findAvailablePortInRange(range);

        allocations.set(range.service, result);
        totalAttempted.push(...result.attempted);

        if (result.success) {
          successful.push(result.port);
          logger.info({
            service: range.service,
            port: result.port
          }, 'Service port allocated successfully');
        } else {
          conflicts.push(...result.attempted);
          if (result.error) {
            errors.push(result.error);
          }
          logger.warn({
            service: range.service,
            attempted: result.attempted.length
          }, 'Service port allocation failed');
        }
      } catch (error) {
        const errorMsg = `Failed to allocate port for service ${range.service}: ${error}`;
        errors.push(errorMsg);
        logger.error({ service: range.service, error }, 'Port allocation error');

        // Add failed allocation result
        allocations.set(range.service, {
          port: -1,
          service: range.service,
          attempted: [],
          success: false,
          error: errorMsg
        });
      }
    }

    const summary: AllocationSummary = {
      allocations,
      totalAttempted: [...new Set(totalAttempted)], // Remove duplicates
      success: successful.length === ranges.length
    };

    const batchDuration = Date.now() - batchStartTime;
    const successRate = ranges.length > 0 ? (successful.length / ranges.length * 100).toFixed(1) : '0';

    logger.info({
      totalServices: ranges.length,
      successfulAllocations: successful.length,
      failedAllocations: errors.length,
      totalPortsAttempted: summary.totalAttempted.length,
      uniquePortsAttempted: [...new Set(summary.totalAttempted)].length,
      successRate: `${successRate}%`,
      duration: batchDuration,
      averageTimePerService: ranges.length > 0 ? Math.round(batchDuration / ranges.length) : 0,
      operation: 'batch_allocation_complete'
    }, 'Batch port allocation completed');

    // Log detailed allocation results for each service
    logger.debug('=== Batch Allocation Results ===');
    for (const [serviceName, result] of allocations) {
      if (result.success) {
        logger.debug({
          service: serviceName,
          port: result.port,
          attempts: result.attempted.length,
          status: 'success',
          operation: 'service_allocation_result'
        }, `Service allocation successful: ${serviceName}`);
      } else {
        logger.debug({
          service: serviceName,
          attempts: result.attempted.length,
          attemptedPorts: result.attempted,
          error: result.error,
          status: 'failed',
          operation: 'service_allocation_result'
        }, `Service allocation failed: ${serviceName}`);
      }
    }
    logger.debug('=== End Batch Allocation Results ===');

    return summary;
  }

  /**
   * Basic port cleanup - releases ports from previous crashed instances
   * @returns Promise<number> - Number of ports cleaned up
   */
  static async cleanupOrphanedPorts(): Promise<number> {
    const cleanupStartTime = Date.now();
    logger.info({ operation: 'cleanup_start' }, 'Starting port cleanup for orphaned processes');

    const cleanedCount = 0;
    let checkedCount = 0;
    let occupiedCount = 0;
    const commonPortRanges = [
      { start: 8080, end: 8090, service: 'websocket' },
      { start: 3001, end: 3020, service: 'http' },
      { start: 3000, end: 3010, service: 'sse' }
    ];

    const occupiedPorts: Array<{ port: number; service: string }> = [];

    try {
      logger.debug({
        ranges: commonPortRanges,
        totalPortsToCheck: commonPortRanges.reduce((sum, r) => sum + (r.end - r.start + 1), 0),
        operation: 'cleanup_scan_start'
      }, 'Starting port cleanup scan');

      for (const range of commonPortRanges) {
        logger.debug({
          service: range.service,
          start: range.start,
          end: range.end,
          operation: 'cleanup_range_start'
        }, `Scanning ${range.service} port range`);

        for (let port = range.start; port <= range.end; port++) {
          // Skip excluded ports
          if (this.isPortExcluded(port)) {
            logger.debug({
              port,
              service: range.service,
              reason: 'excluded',
              operation: 'cleanup_port_skip'
            }, 'Skipping excluded port during cleanup');
            continue;
          }

          checkedCount++;

          // Check if port is available (if not available, it might be orphaned)
          const isAvailable = await this.findAvailablePort(port);

          if (!isAvailable) {
            occupiedCount++;
            occupiedPorts.push({ port, service: range.service });

            logger.debug({
              port,
              service: range.service,
              operation: 'cleanup_port_occupied'
            }, 'Port in use - checking if orphaned');

            // Basic cleanup: just log the occupied port
            // More sophisticated cleanup will be added in later phases
            logger.debug({
              port,
              service: range.service,
              operation: 'cleanup_port_analysis'
            }, 'Port occupied by process');
          } else {
            logger.debug({
              port,
              service: range.service,
              operation: 'cleanup_port_available'
            }, 'Port available during cleanup scan');
          }
        }

        logger.debug({
          service: range.service,
          portsChecked: range.end - range.start + 1,
          operation: 'cleanup_range_complete'
        }, `Completed ${range.service} port range scan`);
      }

      const cleanupDuration = Date.now() - cleanupStartTime;

      logger.info({
        cleanedCount,
        checkedCount,
        occupiedCount,
        occupiedPorts,
        duration: cleanupDuration,
        averageTimePerPort: checkedCount > 0 ? Math.round(cleanupDuration / checkedCount) : 0,
        operation: 'cleanup_complete'
      }, 'Port cleanup completed');

      return cleanedCount;

    } catch (error) {
      const cleanupDuration = Date.now() - cleanupStartTime;
      logger.error({
        error,
        cleanedCount,
        checkedCount,
        occupiedCount,
        duration: cleanupDuration,
        operation: 'cleanup_error'
      }, 'Error during port cleanup');
      return cleanedCount;
    }
  }

  /**
   * Register an instance with its allocated port
   * @param port - Port number allocated to this instance
   * @param service - Service name using the port
   * @returns Promise<void>
   */
  static async registerInstance(port: number, service: string): Promise<void> {
    try {
      // Ensure tracking directory exists
      await fs.mkdir(this.INSTANCE_TRACKING_DIR, { recursive: true });

      const instanceInfo: InstanceInfo = {
        pid: process.pid,
        port,
        service,
        startTime: Date.now()
      };

      const instanceFile = path.join(this.INSTANCE_TRACKING_DIR, `${INSTANCE_FILE_PREFIX}${process.pid}-${port}.json`);
      await fs.writeFile(instanceFile, JSON.stringify(instanceInfo, null, 2));

      logger.info({ pid: process.pid, port, service }, 'Instance registered');
    } catch (error) {
      logger.error({ err: error, port, service }, 'Failed to register instance');
    }
  }

  /**
   * Unregister an instance when shutting down
   * @param port - Port number to unregister
   * @returns Promise<void>
   */
  static async unregisterInstance(port: number): Promise<void> {
    try {
      const instanceFile = path.join(this.INSTANCE_TRACKING_DIR, `${INSTANCE_FILE_PREFIX}${process.pid}-${port}.json`);
      await fs.unlink(instanceFile);
      logger.info({ pid: process.pid, port }, 'Instance unregistered');
    } catch (error) {
      // File might not exist, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error({ err: error, port }, 'Failed to unregister instance');
      }
    }
  }

  /**
   * Get all active instances
   * @returns Promise<InstanceInfo[]> - Array of active instances
   */
  static async getActiveInstances(): Promise<InstanceInfo[]> {
    const instances: InstanceInfo[] = [];
    
    try {
      // Ensure directory exists
      await fs.mkdir(this.INSTANCE_TRACKING_DIR, { recursive: true });
      
      const files = await fs.readdir(this.INSTANCE_TRACKING_DIR);
      
      for (const file of files) {
        if (file.startsWith(INSTANCE_FILE_PREFIX)) {
          try {
            const filePath = path.join(this.INSTANCE_TRACKING_DIR, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const instanceInfo = JSON.parse(content) as InstanceInfo;
            
            // Check if process is still running
            if (this.isProcessRunning(instanceInfo.pid)) {
              instances.push(instanceInfo);
            } else {
              // Clean up stale instance file
              await fs.unlink(filePath);
              logger.debug({ pid: instanceInfo.pid, port: instanceInfo.port }, 'Cleaned up stale instance file');
            }
          } catch (error) {
            logger.error({ err: error, file }, 'Failed to read instance file');
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to get active instances');
    }
    
    return instances;
  }

  /**
   * Check if a process is still running
   * @param pid - Process ID to check
   * @returns boolean - True if process is running
   */
  private static isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without actually sending a signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up all instance tracking for this process
   * @returns Promise<void>
   */
  static async cleanupInstanceTracking(): Promise<void> {
    try {
      // Check if directory exists before attempting to read it
      try {
        await fs.access(this.INSTANCE_TRACKING_DIR);
      } catch {
        // Directory doesn't exist, nothing to clean up
        logger.debug({ dir: this.INSTANCE_TRACKING_DIR }, 'Instance tracking directory does not exist, skipping cleanup');
        return;
      }

      const files = await fs.readdir(this.INSTANCE_TRACKING_DIR);
      const prefix = `${INSTANCE_FILE_PREFIX}${process.pid}-`;
      
      for (const file of files) {
        if (file.startsWith(prefix)) {
          const filePath = path.join(this.INSTANCE_TRACKING_DIR, file);
          await fs.unlink(filePath);
          logger.debug({ file }, 'Cleaned up instance tracking file');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to cleanup instance tracking');
    }
  }
}
