/**
 * Performance Monitoring System
 * 
 * Implements comprehensive performance monitoring including:
 * - Real-time performance metrics collection
 * - Performance bottleneck identification
 * - Resource usage tracking
 * - Performance regression detection
 * - Automated performance alerts
 */

import { VibeTaskManagerConfig } from './config-loader.js';
import { TaskManagerMemoryManager } from './memory-manager-integration.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Performance metric types
 */
export type MetricType = 
  | 'response_time' 
  | 'memory_usage' 
  | 'cpu_usage' 
  | 'disk_io' 
  | 'cache_hit_rate'
  | 'task_throughput'
  | 'error_rate'
  | 'agent_performance';

/**
 * Performance metric data point
 */
export interface PerformanceMetric {
  id: string;
  type: MetricType;
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
  threshold?: {
    warning: number;
    critical: number;
  };
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string;
  metricId: string;
  type: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Performance bottleneck information
 */
export interface PerformanceBottleneck {
  id: string;
  component: string;
  type: 'memory' | 'cpu' | 'io' | 'network' | 'cache';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metrics: PerformanceMetric[];
  suggestions: string[];
  detectedAt: Date;
}

/**
 * Performance regression data
 */
export interface PerformanceRegression {
  id: string;
  metricType: MetricType;
  baselineValue: number;
  currentValue: number;
  degradationPercentage: number;
  detectedAt: Date;
  timeWindow: string;
}

/**
 * Performance monitoring configuration
 */
export interface PerformanceMonitorConfig {
  enabled: boolean;
  metricsInterval: number;
  enableAlerts: boolean;
  performanceThresholds: {
    maxResponseTime: number;
    maxMemoryUsage: number;
    maxCpuUsage: number;
  };
  bottleneckDetection: {
    enabled: boolean;
    analysisInterval: number;
    minSampleSize: number;
  };
  regressionDetection: {
    enabled: boolean;
    baselineWindow: number; // hours
    comparisonWindow: number; // hours
    significanceThreshold: number; // percentage
  };
}

/**
 * Performance Monitor implementation
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;
  private config: PerformanceMonitorConfig;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private bottlenecks: Map<string, PerformanceBottleneck> = new Map();
  private regressions: Map<string, PerformanceRegression> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;
  private memoryManager: TaskManagerMemoryManager | null = null;
  private metricCounter = 0;

  private constructor(config: PerformanceMonitorConfig) {
    this.config = config;
    this.memoryManager = TaskManagerMemoryManager.getInstance();

    if (config.enabled) {
      this.startMonitoring();
    }

    if (config.bottleneckDetection.enabled) {
      this.startBottleneckAnalysis();
    }

    logger.info({ config }, 'Performance Monitor initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: PerformanceMonitorConfig): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      if (!config) {
        throw new AppError('Performance monitor configuration required for first initialization');
      }
      PerformanceMonitor.instance = new PerformanceMonitor(config);
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.checkThresholds();
      this.detectRegressions();
    }, this.config.metricsInterval);

    logger.debug('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.debug('Performance monitoring stopped');
    }
  }

  /**
   * Start bottleneck analysis
   */
  private startBottleneckAnalysis(): void {
    if (this.analysisInterval) {
      return;
    }

    this.analysisInterval = setInterval(() => {
      this.analyzeBottlenecks();
    }, this.config.bottleneckDetection.analysisInterval);

    logger.debug('Bottleneck analysis started');
  }

  /**
   * Stop bottleneck analysis
   */
  stopBottleneckAnalysis(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
      logger.debug('Bottleneck analysis stopped');
    }
  }

  /**
   * Collect system performance metrics
   */
  private collectSystemMetrics(): void {
    const timestamp = new Date();

    // Memory metrics
    const memoryUsage = process.memoryUsage();
    this.recordMetric({
      type: 'memory_usage',
      name: 'heap_used',
      value: memoryUsage.heapUsed,
      unit: 'bytes',
      timestamp,
      tags: { component: 'system' },
      threshold: {
        warning: this.config.performanceThresholds.maxMemoryUsage * 0.8 * 1024 * 1024,
        critical: this.config.performanceThresholds.maxMemoryUsage * 1024 * 1024
      }
    });

    // CPU metrics (approximation using event loop delay)
    const startTime = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
      this.recordMetric({
        type: 'cpu_usage',
        name: 'event_loop_delay',
        value: delay,
        unit: 'ms',
        timestamp,
        tags: { component: 'system' },
        threshold: {
          warning: 10,
          critical: 50
        }
      });
    });

    // Task manager specific metrics
    if (this.memoryManager) {
      const memStats = this.memoryManager.getCurrentMemoryStats();
      if (memStats) {
        this.recordMetric({
          type: 'memory_usage',
          name: 'task_manager_memory',
          value: memStats.totalMemoryUsage,
          unit: 'bytes',
          timestamp,
          tags: { component: 'task_manager' }
        });

        this.recordMetric({
          type: 'cache_hit_rate',
          name: 'cache_memory_usage',
          value: memStats.cacheMemoryUsage,
          unit: 'bytes',
          timestamp,
          tags: { component: 'cache' }
        });
      }
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'id'>): void {
    const fullMetric: PerformanceMetric = {
      id: `metric_${++this.metricCounter}_${Date.now()}`,
      ...metric
    };

    const key = `${metric.type}_${metric.name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metricArray = this.metrics.get(key)!;
    metricArray.push(fullMetric);

    // Keep only last 1000 metrics per type
    if (metricArray.length > 1000) {
      metricArray.splice(0, metricArray.length - 1000);
    }

    logger.debug({
      type: metric.type,
      name: metric.name,
      value: metric.value,
      unit: metric.unit
    }, 'Performance metric recorded');
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkThresholds(): void {
    for (const [key, metricArray] of this.metrics) {
      const latestMetric = metricArray[metricArray.length - 1];
      if (!latestMetric?.threshold) continue;

      const { warning, critical } = latestMetric.threshold;

      if (latestMetric.value >= critical) {
        this.generateAlert(latestMetric, 'critical', critical);
      } else if (latestMetric.value >= warning) {
        this.generateAlert(latestMetric, 'warning', warning);
      }
    }
  }

  /**
   * Generate performance alert
   */
  private generateAlert(metric: PerformanceMetric, type: 'warning' | 'critical', threshold: number): void {
    const alertId = `alert_${metric.type}_${metric.name}_${Date.now()}`;
    
    // Check if similar alert already exists and is not resolved
    const existingAlert = Array.from(this.alerts.values()).find(alert => 
      alert.metricId === metric.id && !alert.resolved
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: PerformanceAlert = {
      id: alertId,
      metricId: metric.id,
      type,
      message: `${metric.name} ${type}: ${metric.value}${metric.unit} exceeds threshold of ${threshold}${metric.unit}`,
      value: metric.value,
      threshold,
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.set(alertId, alert);

    logger[type === 'critical' ? 'error' : 'warn']({
      alertId,
      metric: metric.name,
      value: metric.value,
      threshold,
      unit: metric.unit
    }, `Performance ${type} alert`);
  }

  /**
   * Analyze performance bottlenecks
   */
  private analyzeBottlenecks(): void {
    const now = Date.now();
    const analysisWindow = 5 * 60 * 1000; // 5 minutes

    for (const [key, metricArray] of this.metrics) {
      const recentMetrics = metricArray.filter(
        metric => now - metric.timestamp.getTime() < analysisWindow
      );

      if (recentMetrics.length < this.config.bottleneckDetection.minSampleSize) {
        continue;
      }

      const bottleneck = this.detectBottleneck(key, recentMetrics);
      if (bottleneck) {
        this.bottlenecks.set(bottleneck.id, bottleneck);
        logger.warn({ bottleneck }, 'Performance bottleneck detected');
      }
    }
  }

  /**
   * Detect bottleneck from metrics
   */
  private detectBottleneck(key: string, metrics: PerformanceMetric[]): PerformanceBottleneck | null {
    const avgValue = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    const maxValue = Math.max(...metrics.map(m => m.value));
    const latestMetric = metrics[metrics.length - 1];

    // Simple bottleneck detection logic
    if (latestMetric.threshold) {
      const { warning, critical } = latestMetric.threshold;
      
      if (avgValue > critical * 0.9) {
        return {
          id: `bottleneck_${key}_${Date.now()}`,
          component: latestMetric.tags.component || 'unknown',
          type: this.getBottleneckType(latestMetric.type),
          severity: 'critical',
          description: `${latestMetric.name} consistently high: avg ${avgValue.toFixed(2)}${latestMetric.unit}`,
          metrics: metrics.slice(-10), // Last 10 metrics
          suggestions: this.getBottleneckSuggestions(latestMetric.type),
          detectedAt: new Date()
        };
      } else if (avgValue > warning * 0.9) {
        return {
          id: `bottleneck_${key}_${Date.now()}`,
          component: latestMetric.tags.component || 'unknown',
          type: this.getBottleneckType(latestMetric.type),
          severity: 'medium',
          description: `${latestMetric.name} elevated: avg ${avgValue.toFixed(2)}${latestMetric.unit}`,
          metrics: metrics.slice(-10),
          suggestions: this.getBottleneckSuggestions(latestMetric.type),
          detectedAt: new Date()
        };
      }
    }

    return null;
  }

  /**
   * Get bottleneck type from metric type
   */
  private getBottleneckType(metricType: MetricType): PerformanceBottleneck['type'] {
    switch (metricType) {
      case 'memory_usage': return 'memory';
      case 'cpu_usage': return 'cpu';
      case 'disk_io': return 'io';
      case 'cache_hit_rate': return 'cache';
      default: return 'cpu';
    }
  }

  /**
   * Get suggestions for bottleneck type
   */
  private getBottleneckSuggestions(metricType: MetricType): string[] {
    switch (metricType) {
      case 'memory_usage':
        return [
          'Enable aggressive memory cleanup',
          'Reduce cache sizes',
          'Implement lazy loading',
          'Check for memory leaks'
        ];
      case 'cpu_usage':
        return [
          'Reduce concurrent operations',
          'Optimize algorithms',
          'Implement batching',
          'Use worker threads for heavy tasks'
        ];
      case 'cache_hit_rate':
        return [
          'Increase cache size',
          'Optimize cache warming',
          'Review eviction policies',
          'Implement better caching strategies'
        ];
      default:
        return ['Monitor and analyze further'];
    }
  }

  /**
   * Detect performance regressions
   */
  private detectRegressions(): void {
    if (!this.config.regressionDetection.enabled) {
      return;
    }

    const now = Date.now();
    const baselineWindow = this.config.regressionDetection.baselineWindow * 60 * 60 * 1000;
    const comparisonWindow = this.config.regressionDetection.comparisonWindow * 60 * 60 * 1000;

    for (const [key, metricArray] of this.metrics) {
      const baselineMetrics = metricArray.filter(
        metric => now - metric.timestamp.getTime() >= comparisonWindow &&
                 now - metric.timestamp.getTime() < baselineWindow + comparisonWindow
      );

      const recentMetrics = metricArray.filter(
        metric => now - metric.timestamp.getTime() < comparisonWindow
      );

      if (baselineMetrics.length < 10 || recentMetrics.length < 10) {
        continue;
      }

      const baselineAvg = baselineMetrics.reduce((sum, m) => sum + m.value, 0) / baselineMetrics.length;
      const recentAvg = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;

      const degradationPercentage = ((recentAvg - baselineAvg) / baselineAvg) * 100;

      if (degradationPercentage > this.config.regressionDetection.significanceThreshold) {
        const regression: PerformanceRegression = {
          id: `regression_${key}_${Date.now()}`,
          metricType: recentMetrics[0].type,
          baselineValue: baselineAvg,
          currentValue: recentAvg,
          degradationPercentage,
          detectedAt: new Date(),
          timeWindow: `${this.config.regressionDetection.comparisonWindow}h`
        };

        this.regressions.set(regression.id, regression);
        logger.warn({ regression }, 'Performance regression detected');
      }
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    metrics: { [key: string]: PerformanceMetric };
    activeAlerts: PerformanceAlert[];
    bottlenecks: PerformanceBottleneck[];
    regressions: PerformanceRegression[];
    overallHealth: 'good' | 'warning' | 'critical';
  } {
    // Get latest metrics
    const latestMetrics: { [key: string]: PerformanceMetric } = {};
    for (const [key, metricArray] of this.metrics) {
      if (metricArray.length > 0) {
        latestMetrics[key] = metricArray[metricArray.length - 1];
      }
    }

    const activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    const bottlenecks = Array.from(this.bottlenecks.values());
    const regressions = Array.from(this.regressions.values());

    // Determine overall health
    let overallHealth: 'good' | 'warning' | 'critical' = 'good';
    if (activeAlerts.some(alert => alert.type === 'critical') || 
        bottlenecks.some(b => b.severity === 'critical')) {
      overallHealth = 'critical';
    } else if (activeAlerts.length > 0 || bottlenecks.length > 0 || regressions.length > 0) {
      overallHealth = 'warning';
    }

    return {
      metrics: latestMetrics,
      activeAlerts,
      bottlenecks,
      regressions,
      overallHealth
    };
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      logger.info({ alertId }, 'Performance alert resolved');
      return true;
    }
    return false;
  }

  /**
   * Get metrics for specific type and time range
   */
  getMetrics(type: MetricType, name?: string, timeRange?: { start: Date; end: Date }): PerformanceMetric[] {
    const results: PerformanceMetric[] = [];

    for (const [key, metricArray] of this.metrics) {
      const [metricType, metricName] = key.split('_', 2);
      
      if (metricType === type && (!name || metricName === name)) {
        let filteredMetrics = metricArray;
        
        if (timeRange) {
          filteredMetrics = metricArray.filter(
            metric => metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end
          );
        }
        
        results.push(...filteredMetrics);
      }
    }

    return results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Shutdown performance monitor
   */
  shutdown(): void {
    this.stopMonitoring();
    this.stopBottleneckAnalysis();
    
    this.metrics.clear();
    this.alerts.clear();
    this.bottlenecks.clear();
    this.regressions.clear();
    
    logger.info('Performance Monitor shutdown');
  }
}

/**
 * Convenience function to get performance monitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor | null {
  try {
    return PerformanceMonitor.getInstance();
  } catch {
    return null;
  }
}
