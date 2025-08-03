/**
 * Security Middleware for Vibe Task Manager
 *
 * Provides unified security layer for command handlers including:
 * - Input sanitization
 * - Path validation
 * - Concurrent access management
 * - Performance monitoring
 * - Security violation tracking
 */

import { 
  UnifiedSecurityEngine, 
  createDefaultSecurityConfig, 
  PathValidationResult,
  SanitizationResult,
  LockAcquisitionResult,
  LockId,
  createSessionId
} from '../core/unified-security-engine.js';
import { CommandExecutionContext } from '../nl/command-handlers.js';
import logger from '../../../logger.js';

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  valid: boolean;
  sanitizedData?: unknown;
  pathValidation?: PathValidationResult;
  sanitizationResult?: SanitizationResult<unknown>;
  lockResult?: LockAcquisitionResult;
  violations: SecurityViolation[];
  performanceMetrics: {
    totalTime: number;
    pathValidationTime?: number;
    sanitizationTime?: number;
    lockAcquisitionTime?: number;
  };
}

/**
 * Security violation
 */
export interface SecurityViolation {
  type: 'path' | 'sanitization' | 'access' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  field?: string;
  originalValue?: unknown;
  sanitizedValue?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Security middleware configuration
 */
export interface SecurityMiddlewareConfig {
  enablePathValidation: boolean;
  enableInputSanitization: boolean;
  enableConcurrentAccess: boolean;
  performanceThresholdMs: number;
  strictMode: boolean;
  logViolations: boolean;
  blockOnCriticalViolations: boolean;
}

/**
 * Security operation context
 */
export interface SecurityOperationContext {
  operation: string;
  resource?: string;
  sessionId?: string;
  userId?: string;
  filePaths?: string[];
  requiresLock?: boolean;
  lockTimeout?: number;
}

/**
 * Security Middleware
 */
export class SecurityMiddleware {
  private static instance: SecurityMiddleware | null = null;
  private securityEngine: UnifiedSecurityEngine;
  private config: SecurityMiddlewareConfig;

  private constructor(config?: Partial<SecurityMiddlewareConfig>) {
    this.config = {
      enablePathValidation: true,
      enableInputSanitization: true,
      enableConcurrentAccess: true,
      performanceThresholdMs: 50, // <50ms requirement
      strictMode: true,
      logViolations: true,
      blockOnCriticalViolations: true,
      ...config
    };

    // Initialize unified security engine
    const securityConfig = createDefaultSecurityConfig();
    this.securityEngine = UnifiedSecurityEngine.getInstance(securityConfig);

    logger.info({ config: this.config }, 'Security Middleware initialized with UnifiedSecurityEngine');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<SecurityMiddlewareConfig>): SecurityMiddleware {
    if (!SecurityMiddleware.instance) {
      SecurityMiddleware.instance = new SecurityMiddleware(config);
    }
    return SecurityMiddleware.instance;
  }

  /**
   * Map unified security engine severity to middleware severity
   */
  private mapSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case 'info': return 'low';
      case 'low': return 'low';
      case 'medium': return 'medium';
      case 'high': return 'high';
      case 'critical': return 'critical';
      default: return 'medium';
    }
  }

  /**
   * Validate security for command execution
   */
  async validateCommandSecurity(
    data: unknown,
    context: CommandExecutionContext,
    operationContext: SecurityOperationContext
  ): Promise<SecurityValidationResult> {
    const startTime = Date.now();
    const violations: SecurityViolation[] = [];
    let sanitizedData = data;
    let pathValidation: PathValidationResult | undefined;
    let sanitizationResult: SanitizationResult<unknown> | undefined;
    let lockResult: LockAcquisitionResult | undefined;

    try {
      // 1. Input Sanitization
      if (this.config.enableInputSanitization && data) {
        const sanitizationStart = Date.now();
        const sanitizationResponse = await this.securityEngine.sanitizeData(data);
        const sanitizationTime = Date.now() - sanitizationStart;

        if (!sanitizationResponse.success) {
          violations.push({
            type: 'sanitization',
            severity: 'high',
            description: 'Input sanitization failed',
            context: { error: sanitizationResponse.error?.message }
          });

          if (this.config.blockOnCriticalViolations) {
            return this.createValidationResult(false, violations, {
              totalTime: Date.now() - startTime,
              sanitizationTime
            });
          }
        } else {
          sanitizationResult = sanitizationResponse.data;
          sanitizedData = sanitizationResult?.sanitizedData || data;

          // Add sanitization violations
          if (sanitizationResult?.violations) {
            sanitizationResult.violations.forEach(violation => {
              violations.push({
                type: 'sanitization',
                severity: this.mapSeverity(violation.severity),
                description: violation.message,
                field: violation.field,
                originalValue: violation.originalValue,
                sanitizedValue: violation.sanitizedValue
              });
            });
          }
        }
      }

      // 2. Path Validation
      if (this.config.enablePathValidation && operationContext.filePaths) {
        const pathValidationStart = Date.now();

        for (const filePath of operationContext.filePaths) {
          const pathValidationResponse = await this.securityEngine.validatePath(filePath, 'write');

          if (!pathValidationResponse.success) {
            violations.push({
              type: 'path',
              severity: 'critical',
              description: pathValidationResponse.error?.message || 'Path validation failed',
              field: 'filePath',
              originalValue: filePath,
              context: { error: pathValidationResponse.error?.message }
            });

            if (this.config.blockOnCriticalViolations) {
              return this.createValidationResult(false, violations, {
                totalTime: Date.now() - startTime,
                pathValidationTime: Date.now() - pathValidationStart
              });
            }
          } else {
            pathValidation = pathValidationResponse.data;
            
            if (!pathValidation?.isValid) {
              violations.push({
                type: 'path',
                severity: pathValidation?.violationType ? 'critical' : 'medium',
                description: pathValidation?.error || 'Path validation failed',
                field: 'filePath',
                originalValue: filePath,
                context: { violationType: pathValidation?.violationType }
              });

              if (this.config.blockOnCriticalViolations && pathValidation?.violationType) {
                return this.createValidationResult(false, violations, {
                  totalTime: Date.now() - startTime,
                  pathValidationTime: Date.now() - pathValidationStart
                });
              }
            }
          }
        }
      }

      // 3. Concurrent Access Management
      if (this.config.enableConcurrentAccess && operationContext.requiresLock) {
        const lockStart = Date.now();

        const lockResponse = await this.securityEngine.acquireLock(
          operationContext.resource || operationContext.operation,
          'write',
          createSessionId(context.sessionId),
          operationContext.lockTimeout
        );

        const lockTime = Date.now() - lockStart;

        if (!lockResponse.success) {
          violations.push({
            type: 'access',
            severity: 'medium',
            description: lockResponse.error?.message || 'Failed to acquire resource lock',
            context: {
              resource: operationContext.resource,
              error: lockResponse.error?.message
            }
          });

          if (this.config.strictMode) {
            return this.createValidationResult(false, violations, {
              totalTime: Date.now() - startTime,
              lockAcquisitionTime: lockTime
            });
          }
        } else {
          lockResult = lockResponse.data;
        }
      }

      const totalTime = Date.now() - startTime;

      // 4. Performance Validation
      if (totalTime > this.config.performanceThresholdMs) {
        violations.push({
          type: 'performance',
          severity: 'medium',
          description: `Security validation exceeded performance threshold: ${totalTime}ms > ${this.config.performanceThresholdMs}ms`,
          context: { actualTime: totalTime, threshold: this.config.performanceThresholdMs }
        });
      }

      // Log violations if enabled
      if (this.config.logViolations && violations.length > 0) {
        logger.warn({
          violations: violations.length,
          operation: operationContext.operation,
          sessionId: context.sessionId,
          totalTime
        }, 'Security violations detected');
      }

      return this.createValidationResult(true, violations, {
        totalTime,
        pathValidationTime: pathValidation?.auditInfo.validationTime,
        sanitizationTime: sanitizationResult?.sanitizationTime,
        lockAcquisitionTime: lockResult?.waitTime
      }, sanitizedData, pathValidation, sanitizationResult, lockResult);

    } catch (error) {
      logger.error({ err: error, operation: operationContext.operation }, 'Security validation error');

      violations.push({
        type: 'access',
        severity: 'critical',
        description: `Security validation error: ${error instanceof Error ? error.message : String(error)}`,
        context: { error: error instanceof Error ? error.message : String(error) }
      });

      return this.createValidationResult(false, violations, {
        totalTime: Date.now() - startTime
      });
    }
  }

  /**
   * Release acquired locks
   */
  async releaseLocks(lockIds: (string | LockId)[]): Promise<void> {
    if (!this.config.enableConcurrentAccess) {
      return;
    }

    for (const lockId of lockIds) {
      try {
        // Cast string to LockId if needed
        const typedLockId = typeof lockId === 'string' ? lockId as LockId : lockId;
        await this.securityEngine.releaseLock(typedLockId);
      } catch (error) {
        logger.error({ err: error, lockId }, 'Failed to release lock');
      }
    }
  }

  /**
   * Create validation result
   */
  private createValidationResult(
    valid: boolean,
    violations: SecurityViolation[],
    performanceMetrics: SecurityValidationResult['performanceMetrics'],
    sanitizedData?: unknown,
    pathValidation?: PathValidationResult,
    sanitizationResult?: SanitizationResult<unknown>,
    lockResult?: LockAcquisitionResult
  ): SecurityValidationResult {
    return {
      valid,
      sanitizedData,
      pathValidation,
      sanitizationResult,
      lockResult,
      violations,
      performanceMetrics
    };
  }

  /**
   * Get security configuration
   */
  getConfig(): SecurityMiddlewareConfig {
    return { ...this.config };
  }

  /**
   * Update security configuration
   */
  updateConfig(config: Partial<SecurityMiddlewareConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Security Middleware configuration updated');
  }

  /**
   * Shutdown middleware
   */
  shutdown(): void {
    // Clean up resources if needed
    logger.info('Security Middleware shutdown');
  }
}

/**
 * Convenience function for command security validation
 */
export async function validateCommandSecurity(
  data: unknown,
  context: CommandExecutionContext,
  operationContext: SecurityOperationContext
): Promise<SecurityValidationResult> {
  const middleware = SecurityMiddleware.getInstance();
  return middleware.validateCommandSecurity(data, context, operationContext);
}

/**
 * Convenience function for releasing locks
 */
export async function releaseLocks(lockIds: string[]): Promise<void> {
  const middleware = SecurityMiddleware.getInstance();
  return middleware.releaseLocks(lockIds);
}
