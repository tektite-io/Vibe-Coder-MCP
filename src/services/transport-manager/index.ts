/**
 * Transport Manager - Unified Transport Service Orchestrator
 *
 * Manages all transport services for the unified communication protocol
 * Handles startup, shutdown, and coordination of stdio, SSE, WebSocket, and HTTP transports
 */

import logger from '../../logger.js';
import { sseNotifier } from '../sse-notifier/index.js';
import { websocketServer } from '../websocket-server/index.js';
import { httpAgentAPI } from '../http-agent-api/index.js';

// Transport configuration interface
export interface TransportConfig {
  sse: {
    enabled: boolean;
    // SSE is integrated with MCP server, no separate port needed
  };
  websocket: {
    enabled: boolean;
    port: number;
    path: string;
  };
  http: {
    enabled: boolean;
    port: number;
    cors: boolean;
  };
  stdio: {
    enabled: boolean;
    // stdio is handled by MCP server directly
  };
}

// Default transport configuration
const DEFAULT_CONFIG: TransportConfig = {
  sse: {
    enabled: true
  },
  websocket: {
    enabled: true,
    port: 8080,
    path: '/agent-ws'
  },
  http: {
    enabled: true,
    port: 3001,
    cors: true
  },
  stdio: {
    enabled: true
  }
};

// Transport manager singleton
class TransportManager {
  private static instance: TransportManager;
  private config: TransportConfig;
  private isStarted = false;
  private startedServices: string[] = [];

  static getInstance(): TransportManager {
    if (!TransportManager.instance) {
      TransportManager.instance = new TransportManager();
    }
    return TransportManager.instance;
  }

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Configure transport settings
   */
  configure(config: Partial<TransportConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      sse: { ...this.config.sse, ...config.sse },
      websocket: { ...this.config.websocket, ...config.websocket },
      http: { ...this.config.http, ...config.http },
      stdio: { ...this.config.stdio, ...config.stdio }
    };

    logger.info({ config: this.config }, 'Transport manager configured');
  }

  /**
   * Start all enabled transport services
   */
  async startAll(): Promise<void> {
    if (this.isStarted) {
      logger.warn('Transport manager already started');
      return;
    }

    try {
      logger.info('Starting unified communication protocol transport services...');

      // Start stdio transport (handled by MCP server - just log)
      if (this.config.stdio.enabled) {
        logger.info('stdio transport: Enabled (handled by MCP server)');
        this.startedServices.push('stdio');
      }

      // Start SSE transport (integrated with MCP server - just log)
      if (this.config.sse.enabled) {
        logger.info('SSE transport: Enabled (integrated with MCP server)');
        this.startedServices.push('sse');
      }

      // Start WebSocket transport
      if (this.config.websocket.enabled) {
        await websocketServer.start(this.config.websocket.port);
        logger.info({
          port: this.config.websocket.port,
          path: this.config.websocket.path
        }, 'WebSocket transport: Started');
        this.startedServices.push('websocket');
      }

      // Start HTTP transport
      if (this.config.http.enabled) {
        await httpAgentAPI.start(this.config.http.port);
        logger.info({
          port: this.config.http.port,
          cors: this.config.http.cors
        }, 'HTTP transport: Started');
        this.startedServices.push('http');
      }

      this.isStarted = true;

      logger.info({
        startedServices: this.startedServices,
        totalServices: this.startedServices.length
      }, 'All transport services started successfully');

    } catch (error) {
      logger.error({ err: error }, 'Failed to start transport services');

      // Attempt to stop any services that were started
      await this.stopAll().catch(stopError => {
        logger.error({ err: stopError }, 'Failed to cleanup after startup failure');
      });

      throw error;
    }
  }

  /**
   * Stop all transport services
   */
  async stopAll(): Promise<void> {
    if (!this.isStarted) {
      logger.warn('Transport manager not started');
      return;
    }

    try {
      logger.info('Stopping unified communication protocol transport services...');

      // Stop WebSocket transport
      if (this.startedServices.includes('websocket')) {
        await websocketServer.stop();
        logger.info('WebSocket transport: Stopped');
      }

      // Stop HTTP transport
      if (this.startedServices.includes('http')) {
        await httpAgentAPI.stop();
        logger.info('HTTP transport: Stopped');
      }

      // SSE and stdio are handled by MCP server lifecycle
      if (this.startedServices.includes('sse')) {
        logger.info('SSE transport: Stopped (handled by MCP server)');
      }

      if (this.startedServices.includes('stdio')) {
        logger.info('stdio transport: Stopped (handled by MCP server)');
      }

      this.isStarted = false;
      this.startedServices = [];

      logger.info('All transport services stopped successfully');

    } catch (error) {
      logger.error({ err: error }, 'Failed to stop transport services');
      throw error;
    }
  }

  /**
   * Restart all transport services
   */
  async restart(): Promise<void> {
    logger.info('Restarting transport services...');
    await this.stopAll();
    await this.startAll();
    logger.info('Transport services restarted successfully');
  }

  /**
   * Get transport service status
   */
  getStatus(): {
    isStarted: boolean;
    startedServices: string[];
    config: TransportConfig;
    serviceDetails: Record<string, any>;
  } {
    const serviceDetails: Record<string, any> = {};

    if (this.startedServices.includes('websocket')) {
      serviceDetails.websocket = {
        port: this.config.websocket.port,
        path: this.config.websocket.path,
        connections: websocketServer.getConnectionCount(),
        connectedAgents: websocketServer.getConnectedAgents()
      };
    }

    if (this.startedServices.includes('http')) {
      serviceDetails.http = {
        port: this.config.http.port,
        cors: this.config.http.cors
      };
    }

    if (this.startedServices.includes('sse')) {
      serviceDetails.sse = {
        connections: sseNotifier.getConnectionCount(),
        enabled: true
      };
    }

    if (this.startedServices.includes('stdio')) {
      serviceDetails.stdio = {
        enabled: true,
        note: 'Handled by MCP server'
      };
    }

    return {
      isStarted: this.isStarted,
      startedServices: this.startedServices,
      config: this.config,
      serviceDetails
    };
  }

  /**
   * Check if a specific transport is enabled and running
   */
  isTransportRunning(transport: 'stdio' | 'sse' | 'websocket' | 'http'): boolean {
    return this.isStarted && this.startedServices.includes(transport);
  }

  /**
   * Get configuration for a specific transport
   */
  getTransportConfig(transport: keyof TransportConfig): any {
    return this.config[transport];
  }

  /**
   * Enable or disable a specific transport
   */
  setTransportEnabled(transport: keyof TransportConfig, enabled: boolean): void {
    this.config[transport].enabled = enabled;
    logger.info({ transport, enabled }, 'Transport enabled status updated');
  }

  /**
   * Get health status of all transports
   */
  async getHealthStatus(): Promise<Record<string, { status: 'healthy' | 'unhealthy' | 'disabled'; details?: any }>> {
    const health: Record<string, { status: 'healthy' | 'unhealthy' | 'disabled'; details?: any }> = {};

    // Check stdio transport
    health.stdio = {
      status: this.config.stdio.enabled ? 'healthy' : 'disabled',
      details: { note: 'Handled by MCP server' }
    };

    // Check SSE transport
    health.sse = {
      status: this.config.sse.enabled ? 'healthy' : 'disabled',
      details: {
        connections: this.isTransportRunning('sse') ? sseNotifier.getConnectionCount() : 0
      }
    };

    // Check WebSocket transport
    if (this.config.websocket.enabled) {
      try {
        const connectionCount = websocketServer.getConnectionCount();
        health.websocket = {
          status: this.isTransportRunning('websocket') ? 'healthy' : 'unhealthy',
          details: {
            port: this.config.websocket.port,
            connections: connectionCount,
            connectedAgents: websocketServer.getConnectedAgents().length
          }
        };
      } catch (error) {
        health.websocket = {
          status: 'unhealthy',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        };
      }
    } else {
      health.websocket = { status: 'disabled' };
    }

    // Check HTTP transport
    if (this.config.http.enabled) {
      try {
        health.http = {
          status: this.isTransportRunning('http') ? 'healthy' : 'unhealthy',
          details: {
            port: this.config.http.port,
            cors: this.config.http.cors
          }
        };
      } catch (error) {
        health.http = {
          status: 'unhealthy',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        };
      }
    } else {
      health.http = { status: 'disabled' };
    }

    return health;
  }
}

// Export singleton instance
export const transportManager = TransportManager.getInstance();
export { TransportManager };
