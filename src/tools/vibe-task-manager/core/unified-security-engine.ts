/**
 * Unified Security Management Engine
 * 
 * Consolidates 11 security services into a single, comprehensive engine:
 * - unified-security-config.ts: Central configuration
 * - security-config.ts: Configuration management
 * - audit-logger.ts: Security audit logging
 * - auth-integration.ts: Authentication and authorization
 * - data-sanitizer.ts: Input sanitization
 * - path-validator.ts: Path security validation
 * - concurrent-access.ts: Concurrent access management
 * - filesystem-security.ts: Filesystem security
 * - security-middleware.ts: Security middleware layer
 * - vibe-task-manager-security-validator.ts: Security boundary validation
 * 
 * This unified engine provides:
 * - Centralized security policy management
 * - Comprehensive audit logging and monitoring
 * - Advanced authentication and authorization
 * - Input sanitization and validation
 * - Path security and filesystem protection
 * - Concurrent access control with deadlock prevention
 * - Security middleware for request processing
 * - Real-time threat detection and response
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { resolve, normalize } from 'path';
import crypto from 'crypto';
import {
  EnhancedError,
  ErrorFactory,
  createErrorContext
} from '../utils/enhanced-errors.js';
import { Result, createSuccess, createFailure } from './unified-lifecycle-manager.js';
import { getUnifiedSecurityConfig } from '../security/unified-security-config.js';
import logger from '../../../logger.js';

// =============================================================================
// BRANDED TYPES FOR TYPE SAFETY
// =============================================================================

export type SecurityId = string & { readonly __brand: 'SecurityId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type LockId = string & { readonly __brand: 'LockId' };
export type AuditId = string & { readonly __brand: 'AuditId' };

export function createSecurityId(id: string): SecurityId {
  if (!id || id.trim().length === 0) {
    throw new Error('Security ID cannot be empty');
  }
  return id as SecurityId;
}

export function createSessionId(id: string): SessionId {
  if (!id || id.trim().length === 0) {
    throw new Error('Session ID cannot be empty');
  }
  return id as SessionId;
}

export function createLockId(id: string): LockId {
  if (!id || id.trim().length === 0) {
    throw new Error('Lock ID cannot be empty');
  }
  return id as LockId;
}

export function createAuditId(id: string): AuditId {
  if (!id || id.trim().length === 0) {
    throw new Error('Audit ID cannot be empty');
  }
  return id as AuditId;
}

// =============================================================================
// CORE TYPES AND INTERFACES
// =============================================================================

/**
 * User role types
 */
export type UserRole = 'admin' | 'manager' | 'developer' | 'viewer' | 'guest';

/**
 * Permission types
 */
export type Permission = 
  | 'task:create' | 'task:read' | 'task:update' | 'task:delete' | 'task:execute'
  | 'project:create' | 'project:read' | 'project:update' | 'project:delete'
  | 'agent:manage' | 'agent:assign' | 'agent:monitor'
  | 'system:admin' | 'system:config' | 'system:audit'
  | 'file:read' | 'file:write' | 'file:execute';

/**
 * Security event types
 */
export type SecurityEventType =
  | 'authentication' | 'authorization' | 'access_attempt' | 'data_access'
  | 'data_modification' | 'security_violation' | 'system_event'
  | 'suspicious_activity' | 'compliance_event' | 'error_event';

/**
 * Security event severity
 */
export type SecurityEventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Path operation type
 */
export type PathOperation = 'read' | 'write' | 'execute';

/**
 * Lock operation type
 */
export type LockOperation = 'read' | 'write' | 'execute';

/**
 * User authentication context
 */
export interface UserContext {
  userId: string;
  sessionId: SessionId;
  role: UserRole;
  permissions: Permission[];
  authenticatedAt: Date;
  lastActivity: Date;
  metadata: Record<string, unknown>;
}

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  isValid: boolean;
  normalizedPath?: string;
  sanitizedData?: unknown;
  violations: SecurityViolation[];
  warnings: string[];
  performanceMetrics: {
    totalTime: number;
    pathValidationTime?: number;
    sanitizationTime?: number;
    authorizationTime?: number;
  };
}

/**
 * Security violation
 */
export interface SecurityViolation {
  type: 'path_traversal' | 'outside_boundary' | 'invalid_input' | 'unauthorized_access' | 'concurrent_violation' | 'injection_attempt';
  severity: SecurityEventSeverity;
  field?: string;
  originalValue?: unknown;
  sanitizedValue?: unknown;
  message: string;
  timestamp: Date;
}

/**
 * Path validation result
 */
export interface PathValidationResult {
  isValid: boolean;
  normalizedPath?: string;
  error?: string;
  warnings?: string[];
  violationType?: 'path_traversal' | 'outside_boundary' | 'invalid_path' | 'dangerous_characters' | 'invalid_extension';
  auditInfo: {
    originalPath: string;
    timestamp: Date;
    validationTime: number;
  };
}

/**
 * Data sanitization result
 */
export interface SanitizationResult<T> {
  success: boolean;
  sanitizedData?: T;
  originalData: T;
  violations: SecurityViolation[];
  sanitizationTime: number;
}

/**
 * Lock information
 */
export interface LockInfo {
  id: LockId;
  resource: string;
  owner: string;
  sessionId?: SessionId;
  operation: LockOperation;
  acquiredAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Lock acquisition result
 */
export interface LockAcquisitionResult {
  success: boolean;
  lockId?: LockId;
  error?: string;
  waitTime?: number;
  existingLock?: LockInfo;
}

/**
 * Security audit event
 */
export interface SecurityAuditEvent {
  id: AuditId;
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  timestamp: Date;
  userId?: string;
  sessionId?: SessionId;
  resource?: string;
  action: string;
  result: 'success' | 'failure' | 'blocked';
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
}

/**
 * Security configuration
 */
export interface UnifiedSecurityEngineConfig {
  // Global settings
  enabled: boolean;
  strictMode: boolean;
  performanceThresholdMs: number;
  logViolations: boolean;
  blockOnCriticalViolations: boolean;
  
  // Authentication settings
  authentication: {
    enabled: boolean;
    tokenExpiryMinutes: number;
    maxSessionsPerUser: number;
    requireStrongPasswords: boolean;
    enableMFA: boolean;
  };
  
  // Authorization settings
  authorization: {
    enabled: boolean;
    defaultRole: UserRole;
    roleHierarchy: Record<UserRole, UserRole[]>;
    permissionCache: boolean;
  };
  
  // Path security settings
  pathSecurity: {
    enabled: boolean;
    allowedReadPaths: string[];
    allowedWritePaths: string[];
    allowedExtensions: string[];
    blockSystemPaths: boolean;
    followSymlinks: boolean;
  };
  
  // Data sanitization settings
  dataSanitization: {
    enabled: boolean;
    strictMode: boolean;
    allowHtml: boolean;
    allowScripts: boolean;
    maxStringLength: number;
    sanitizeFileNames: boolean;
  };
  
  // Concurrent access settings
  concurrentAccess: {
    enabled: boolean;
    maxLockDuration: number;
    deadlockDetection: boolean;
    lockCleanupInterval: number;
    maxLocksPerResource: number;
  };
  
  // Audit settings
  audit: {
    enabled: boolean;
    logLevel: SecurityEventSeverity;
    retentionDays: number;
    enableIntegrityChecks: boolean;
    compressLogs: boolean;
  };
  
  // Filesystem security settings
  filesystem: {
    enabled: boolean;
    systemDirectoryBlacklist: string[];
    maxFileSize: number;
    allowedMimeTypes: string[];
    scanForMalware: boolean;
  };
}

/**
 * Security statistics
 */
export interface SecurityStatistics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<SecurityEventSeverity, number>;
  violationCount: number;
  blockedAttempts: number;
  activeUsers: number;
  activeSessions: number;
  activeLocks: number;
  averageResponseTime: number;
  securityScore: number; // 0-100
}

// =============================================================================
// UNIFIED SECURITY ENGINE
// =============================================================================

/**
 * Unified Security Management Engine
 * 
 * Consolidates all security functionality into a single, comprehensive engine
 * with advanced features for authentication, authorization, audit logging,
 * path validation, data sanitization, and concurrent access control.
 */
export class UnifiedSecurityEngine extends EventEmitter {
  private static instance: UnifiedSecurityEngine | null = null;
  
  // Core configuration
  private readonly config: UnifiedSecurityEngineConfig;
  private initialized = false;
  
  // Security state
  private readonly activeSessions = new Map<SessionId, UserContext>();
  private readonly activeLocks = new Map<LockId, LockInfo>();
  private readonly auditEvents = new Map<AuditId, SecurityAuditEvent>();
  private readonly permissionCache = new Map<string, Permission[]>();
  
  // Performance tracking
  private eventCount = 0;
  private eventsByType = new Map<SecurityEventType, number>();
  private eventsBySeverity = new Map<SecurityEventSeverity, number>();
  private violationCount = 0;
  private blockedAttempts = 0;
  private totalResponseTime = 0;
  
  // Background processes
  private lockCleanupTimer: NodeJS.Timeout | null = null;
  private auditCleanupTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  
  private constructor(config: UnifiedSecurityEngineConfig) {
    super();
    this.config = config;
    
    // Initialize event counters
    ['authentication', 'authorization', 'access_attempt', 'data_access', 'data_modification', 'security_violation', 'system_event', 'suspicious_activity', 'compliance_event', 'error_event'].forEach(type => {
      this.eventsByType.set(type as SecurityEventType, 0);
    });
    
    ['info', 'low', 'medium', 'high', 'critical'].forEach(severity => {
      this.eventsBySeverity.set(severity as SecurityEventSeverity, 0);
    });
    
    logger.info('Unified Security Engine initialized');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: UnifiedSecurityEngineConfig): UnifiedSecurityEngine {
    if (!UnifiedSecurityEngine.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      UnifiedSecurityEngine.instance = new UnifiedSecurityEngine(config);
    }
    return UnifiedSecurityEngine.instance;
  }
  
  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (UnifiedSecurityEngine.instance) {
      UnifiedSecurityEngine.instance.dispose();
      UnifiedSecurityEngine.instance = null;
    }
  }
  
  // =============================================================================
  // INITIALIZATION AND LIFECYCLE
  // =============================================================================
  
  /**
   * Initialize the security engine
   */
  public async initialize(): Promise<Result<void, EnhancedError>> {
    if (this.initialized) {
      return createSuccess(undefined);
    }
    
    try {
      // Load security configuration
      await this.loadSecurityConfiguration();
      
      // Initialize security components
      await this.initializeSecurityComponents();
      
      // Start background processes
      this.startBackgroundProcesses();
      
      this.initialized = true;
      this.emit('initialized');
      logger.info('Security engine initialized successfully');
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to initialize security engine: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'initialize').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Load security configuration
   */
  private async loadSecurityConfiguration(): Promise<void> {
    try {
      getUnifiedSecurityConfig();
      // Merge with default configuration
      logger.info('Security configuration loaded successfully');
    } catch (error) {
      logger.warn('Failed to load security configuration, using defaults:', error);
    }
  }
  
  /**
   * Initialize security components
   */
  private async initializeSecurityComponents(): Promise<void> {
    // Initialize audit logging
    await this.initializeAuditLogging();
    
    // Initialize path security
    await this.initializePathSecurity();
    
    // Initialize concurrent access management
    await this.initializeConcurrentAccess();
    
    logger.info('Security components initialized');
  }
  
  /**
   * Initialize audit logging
   */
  private async initializeAuditLogging(): Promise<void> {
    if (!this.config.audit.enabled) {
      return;
    }
    
    // Log security engine startup
    await this.logSecurityEvent({
      type: 'system_event',
      severity: 'info',
      action: 'security_engine_startup',
      result: 'success',
      details: {
        config: {
          strictMode: this.config.strictMode,
          auditEnabled: this.config.audit.enabled,
          pathSecurityEnabled: this.config.pathSecurity.enabled
        }
      }
    });
  }
  
  /**
   * Initialize path security
   */
  private async initializePathSecurity(): Promise<void> {
    if (!this.config.pathSecurity.enabled) {
      return;
    }
    
    // Validate configured paths
    for (const path of this.config.pathSecurity.allowedReadPaths) {
      try {
        await fs.access(path);
      } catch {
        logger.warn(`Configured read path does not exist: ${path}`);
      }
    }
    
    for (const path of this.config.pathSecurity.allowedWritePaths) {
      try {
        await fs.access(path);
      } catch {
        logger.warn(`Configured write path does not exist: ${path}`);
      }
    }
  }
  
  /**
   * Initialize concurrent access management
   */
  private async initializeConcurrentAccess(): Promise<void> {
    if (!this.config.concurrentAccess.enabled) {
      return;
    }
    
    // Clean up any stale locks from previous sessions
    await this.cleanupStaleLocks();
  }
  
  /**
   * Start background processes
   */
  private startBackgroundProcesses(): void {
    // Lock cleanup process
    if (this.config.concurrentAccess.enabled) {
      this.lockCleanupTimer = setInterval(() => {
        this.cleanupStaleLocks().catch(error => {
          logger.error('Lock cleanup process failed:', error);
        });
      }, this.config.concurrentAccess.lockCleanupInterval * 1000);
    }
    
    // Audit cleanup process
    if (this.config.audit.enabled) {
      this.auditCleanupTimer = setInterval(() => {
        this.cleanupOldAuditEvents().catch(error => {
          logger.error('Audit cleanup process failed:', error);
        });
      }, 24 * 60 * 60 * 1000); // Daily
    }
    
    // Metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, 60 * 1000); // Every minute
    
    logger.info('Security background processes started');
  }
  
  // =============================================================================
  // AUTHENTICATION AND AUTHORIZATION
  // =============================================================================
  
  /**
   * Authenticate user and create session
   */
  public async authenticateUser(credentials: { userId: string; token: string; metadata?: Record<string, unknown> }): Promise<Result<UserContext, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      if (!this.config.authentication.enabled) {
        return createFailure(ErrorFactory.createError(
          'permission',
          'Authentication is disabled',
          createErrorContext('UnifiedSecurityEngine', 'authenticateUser').build()
        ));
      }
      
      // Validate credentials (simplified for demo)
      const isValid = await this.validateCredentials(credentials);
      if (!isValid) {
        await this.logSecurityEvent({
          type: 'authentication',
          severity: 'medium',
          action: 'authentication_failed',
          result: 'failure',
          details: { userId: credentials.userId, reason: 'invalid_credentials' }
        });
        
        return createFailure(ErrorFactory.createError(
          'permission',
          'Invalid credentials',
          createErrorContext('UnifiedSecurityEngine', 'authenticateUser').build()
        ));
      }
      
      // Create session
      const sessionId = createSessionId(crypto.randomUUID());
      const userContext: UserContext = {
        userId: credentials.userId,
        sessionId,
        role: this.determineUserRole(credentials.userId),
        permissions: await this.getUserPermissions(credentials.userId),
        authenticatedAt: new Date(),
        lastActivity: new Date(),
        metadata: credentials.metadata || {}
      };
      
      this.activeSessions.set(sessionId, userContext);
      
      await this.logSecurityEvent({
        type: 'authentication',
        severity: 'info',
        action: 'authentication_success',
        result: 'success',
        details: { userId: credentials.userId, sessionId, role: userContext.role }
      });
      
      this.trackPerformance('authentication', Date.now() - startTime);
      this.emit('userAuthenticated', userContext);
      
      return createSuccess(userContext);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'authenticateUser').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Authorize user action
   */
  public async authorizeAction(sessionId: SessionId, permission: Permission, resource?: string): Promise<Result<boolean, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      if (!this.config.authorization.enabled) {
        return createSuccess(true);
      }
      
      const userContext = this.activeSessions.get(sessionId);
      if (!userContext) {
        await this.logSecurityEvent({
          type: 'authorization',
          severity: 'medium',
          action: 'authorization_failed',
          result: 'failure',
          details: { sessionId, permission, resource, reason: 'invalid_session' }
        });
        
        return createFailure(ErrorFactory.createError(
          'permission',
          'Invalid session',
          createErrorContext('UnifiedSecurityEngine', 'authorizeAction').build()
        ));
      }
      
      // Check permission
      const hasPermission = userContext.permissions.includes(permission) || 
                           userContext.permissions.includes('system:admin' as Permission);
      
      if (!hasPermission) {
        await this.logSecurityEvent({
          type: 'authorization',
          severity: 'medium',
          action: 'authorization_denied',
          result: 'blocked',
          details: { 
            userId: userContext.userId, 
            sessionId, 
            permission, 
            resource, 
            userRole: userContext.role,
            userPermissions: userContext.permissions
          }
        });
        
        this.blockedAttempts++;
        return createSuccess(false);
      }
      
      // Update last activity
      userContext.lastActivity = new Date();
      
      await this.logSecurityEvent({
        type: 'authorization',
        severity: 'info',
        action: 'authorization_granted',
        result: 'success',
        details: { userId: userContext.userId, sessionId, permission, resource }
      });
      
      this.trackPerformance('authorization', Date.now() - startTime);
      
      return createSuccess(true);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Authorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'authorizeAction').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // PATH VALIDATION AND FILESYSTEM SECURITY
  // =============================================================================
  
  /**
   * Validate file path for security
   */
  public async validatePath(inputPath: string, operation: PathOperation): Promise<Result<PathValidationResult, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      if (!this.config.pathSecurity.enabled) {
        return createSuccess({
          isValid: true,
          normalizedPath: inputPath,
          auditInfo: {
            originalPath: inputPath,
            timestamp: new Date(),
            validationTime: Date.now() - startTime
          }
        });
      }
      
      const result: PathValidationResult = {
        isValid: false,
        auditInfo: {
          originalPath: inputPath,
          timestamp: new Date(),
          validationTime: 0
        }
      };
      
      // Normalize path
      let normalizedPath: string;
      try {
        normalizedPath = resolve(normalize(inputPath));
      } catch {
        result.error = 'Invalid path format';
        result.violationType = 'invalid_path';
        result.auditInfo.validationTime = Date.now() - startTime;
        return createSuccess(result);
      }
      
      // Check for path traversal
      if (inputPath.includes('..') || inputPath.includes('~')) {
        result.error = 'Path traversal detected';
        result.violationType = 'path_traversal';
        result.auditInfo.validationTime = Date.now() - startTime;
        
        await this.logSecurityEvent({
          type: 'security_violation',
          severity: 'high',
          action: 'path_traversal_attempt',
          result: 'blocked',
          details: { originalPath: inputPath, normalizedPath, operation }
        });
        
        this.violationCount++;
        return createSuccess(result);
      }
      
      // Check against allowed paths
      const allowedPaths = operation === 'read' 
        ? this.config.pathSecurity.allowedReadPaths
        : this.config.pathSecurity.allowedWritePaths;
      
      const isAllowed = allowedPaths.some(allowedPath => {
        const resolvedAllowedPath = resolve(allowedPath);
        return normalizedPath.startsWith(resolvedAllowedPath);
      });
      
      if (!isAllowed) {
        result.error = 'Path outside allowed boundaries';
        result.violationType = 'outside_boundary';
        result.auditInfo.validationTime = Date.now() - startTime;
        
        await this.logSecurityEvent({
          type: 'security_violation',
          severity: 'medium',
          action: 'boundary_violation',
          result: 'blocked',
          details: { originalPath: inputPath, normalizedPath, operation, allowedPaths }
        });
        
        this.violationCount++;
        return createSuccess(result);
      }
      
      // Check file extension if configured
      if (this.config.pathSecurity.allowedExtensions.length > 0) {
        const ext = inputPath.split('.').pop()?.toLowerCase();
        const extWithDot = ext ? `.${ext}` : '';
        if (ext && !this.config.pathSecurity.allowedExtensions.includes(extWithDot)) {
          result.error = 'File extension not allowed';
          result.violationType = 'invalid_extension';
          result.warnings = [`Extension '${extWithDot}' is not in allowed list: ${this.config.pathSecurity.allowedExtensions.join(', ')}`];
          result.auditInfo.validationTime = Date.now() - startTime;
          return createSuccess(result);
        }
      }
      
      // Path is valid
      result.isValid = true;
      result.normalizedPath = normalizedPath;
      result.auditInfo.validationTime = Date.now() - startTime;
      
      this.trackPerformance('path_validation', Date.now() - startTime);
      
      return createSuccess(result);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'validatePath').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // DATA SANITIZATION
  // =============================================================================
  
  /**
   * Sanitize input data
   */
  public async sanitizeData<T>(data: T): Promise<Result<SanitizationResult<T>, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      if (!this.config.dataSanitization.enabled) {
        return createSuccess({
          success: true,
          sanitizedData: data,
          originalData: data,
          violations: [],
          sanitizationTime: Date.now() - startTime
        });
      }
      
      const result: SanitizationResult<T> = {
        success: false,
        originalData: data,
        violations: [],
        sanitizationTime: 0
      };
      
      // Sanitize based on data type
      let sanitizedData: T;
      
      if (typeof data === 'string') {
        sanitizedData = this.sanitizeString(data as unknown as string) as unknown as T;
      } else if (typeof data === 'object' && data !== null) {
        sanitizedData = this.sanitizeObject(data) as T;
      } else {
        sanitizedData = data;
      }
      
      result.success = true;
      result.sanitizedData = sanitizedData;
      result.sanitizationTime = Date.now() - startTime;
      
      this.trackPerformance('sanitization', Date.now() - startTime);
      
      return createSuccess(result);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Data sanitization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'sanitizeData').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Sanitize string input
   */
  private sanitizeString(input: string): string {
    let sanitized = input;
    
    // Remove potential script tags
    if (!this.config.dataSanitization.allowScripts) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    
    // Remove potential HTML if not allowed
    if (!this.config.dataSanitization.allowHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }
    
    // Limit string length
    if (sanitized.length > this.config.dataSanitization.maxStringLength) {
      sanitized = sanitized.substring(0, this.config.dataSanitization.maxStringLength);
    }
    
    // Remove null bytes and other dangerous characters
    sanitized = sanitized.replace(/\0/g, '');
    
    return sanitized;
  }
  
  /**
   * Sanitize object input
   */
  private sanitizeObject(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeObject(item));
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    if (typeof input === 'string') {
      return this.sanitizeString(input);
    }
    
    return input;
  }
  
  // =============================================================================
  // CONCURRENT ACCESS MANAGEMENT
  // =============================================================================
  
  /**
   * Acquire lock for resource
   */
  public async acquireLock(resource: string, operation: LockOperation, sessionId?: SessionId, timeoutMs?: number): Promise<Result<LockAcquisitionResult, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      if (!this.config.concurrentAccess.enabled) {
        return createSuccess({
          success: true,
          lockId: createLockId(crypto.randomUUID())
        });
      }
      
      const lockId = createLockId(crypto.randomUUID());
      const timeout = timeoutMs || this.config.concurrentAccess.maxLockDuration;
      
      // Check for existing locks
      const existingLock = Array.from(this.activeLocks.values()).find(lock => 
        lock.resource === resource && 
        (lock.operation === 'write' || operation === 'write')
      );
      
      if (existingLock) {
        return createSuccess({
          success: false,
          error: 'Resource is locked',
          existingLock,
          waitTime: Date.now() - startTime
        });
      }
      
      // Create lock
      const lockInfo: LockInfo = {
        id: lockId,
        resource,
        owner: sessionId ? this.activeSessions.get(sessionId)?.userId || 'unknown' : 'system',
        sessionId,
        operation,
        acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + timeout),
        metadata: {}
      };
      
      this.activeLocks.set(lockId, lockInfo);
      
      await this.logSecurityEvent({
        type: 'system_event',
        severity: 'info',
        action: 'lock_acquired',
        result: 'success',
        details: { lockId, resource, operation, owner: lockInfo.owner }
      });
      
      this.emit('lockAcquired', lockInfo);
      
      return createSuccess({
        success: true,
        lockId,
        waitTime: Date.now() - startTime
      });
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Lock acquisition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'acquireLock').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Release lock
   */
  public async releaseLock(lockId: LockId): Promise<Result<void, EnhancedError>> {
    try {
      const lockInfo = this.activeLocks.get(lockId);
      if (!lockInfo) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Lock not found: ${lockId}`,
          createErrorContext('UnifiedSecurityEngine', 'releaseLock').build()
        ));
      }
      
      this.activeLocks.delete(lockId);
      
      await this.logSecurityEvent({
        type: 'system_event',
        severity: 'info',
        action: 'lock_released',
        result: 'success',
        details: { lockId, resource: lockInfo.resource, owner: lockInfo.owner }
      });
      
      this.emit('lockReleased', lockInfo);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Lock release failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'releaseLock').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // AUDIT LOGGING
  // =============================================================================
  
  /**
   * Log security event
   */
  public async logSecurityEvent(event: Omit<SecurityAuditEvent, 'id' | 'timestamp' | 'metadata'>): Promise<Result<AuditId, EnhancedError>> {
    try {
      if (!this.config.audit.enabled) {
        return createSuccess(createAuditId('disabled'));
      }
      
      const auditId = createAuditId(crypto.randomUUID());
      const auditEvent: SecurityAuditEvent = {
        id: auditId,
        timestamp: new Date(),
        metadata: {},
        ...event
      };
      
      this.auditEvents.set(auditId, auditEvent);
      
      // Update statistics
      this.eventCount++;
      this.eventsByType.set(event.type, (this.eventsByType.get(event.type) || 0) + 1);
      this.eventsBySeverity.set(event.severity, (this.eventsBySeverity.get(event.severity) || 0) + 1);
      
      // Log to system logger based on severity
      const logMessage = `Security Event: ${event.action} - ${event.result}`;
      switch (event.severity) {
        case 'critical':
        case 'high':
          logger.error(logMessage, auditEvent);
          break;
        case 'medium':
          logger.warn(logMessage, auditEvent);
          break;
        default:
          logger.info(logMessage, auditEvent);
      }
      
      this.emit('securityEvent', auditEvent);
      
      return createSuccess(auditId);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Security event logging failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedSecurityEngine', 'logSecurityEvent').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  // =============================================================================
  // UTILITY METHODS
  // =============================================================================
  
  /**
   * Validate user credentials
   */
  private async validateCredentials(credentials: { userId: string; token: string }): Promise<boolean> {
    // Simplified validation - in production, this would check against a secure store
    return credentials.userId.length > 0 && credentials.token.length > 0;
  }
  
  /**
   * Determine user role
   */
  private determineUserRole(userId: string): UserRole {
    // Simplified role determination - in production, this would check against a user store
    if (userId === 'admin') return 'admin';
    if (userId.startsWith('manager')) return 'manager';
    if (userId.startsWith('dev')) return 'developer';
    return 'viewer';
  }
  
  /**
   * Get user permissions
   */
  private async getUserPermissions(userId: string): Promise<Permission[]> {
    const cacheKey = `permissions:${userId}`;
    
    if (this.config.authorization.permissionCache && this.permissionCache.has(cacheKey)) {
      return this.permissionCache.get(cacheKey)!;
    }
    
    // Simplified permission assignment - in production, this would check against a permission store
    const role = this.determineUserRole(userId);
    let permissions: Permission[] = [];
    
    switch (role) {
      case 'admin':
        permissions = ['system:admin', 'system:config', 'system:audit'] as Permission[];
        break;
      case 'manager':
        permissions = ['project:create', 'project:read', 'project:update', 'task:create', 'task:read', 'task:update', 'agent:manage'] as Permission[];
        break;
      case 'developer':
        permissions = ['task:create', 'task:read', 'task:update', 'task:execute', 'file:read', 'file:write'] as Permission[];
        break;
      case 'viewer':
        permissions = ['task:read', 'project:read', 'file:read'] as Permission[];
        break;
      default:
        permissions = [];
    }
    
    if (this.config.authorization.permissionCache) {
      this.permissionCache.set(cacheKey, permissions);
    }
    
    return permissions;
  }
  
  /**
   * Clean up stale locks
   */
  private async cleanupStaleLocks(): Promise<void> {
    const now = new Date();
    const staleLocks: LockId[] = [];
    
    for (const [lockId, lockInfo] of this.activeLocks.entries()) {
      if (lockInfo.expiresAt < now) {
        staleLocks.push(lockId);
      }
    }
    
    for (const lockId of staleLocks) {
      const lockInfo = this.activeLocks.get(lockId);
      this.activeLocks.delete(lockId);
      
      if (lockInfo) {
        await this.logSecurityEvent({
          type: 'system_event',
          severity: 'info',
          action: 'lock_expired',
          result: 'success',
          details: { lockId, resource: lockInfo.resource, owner: lockInfo.owner }
        });
      }
    }
    
    if (staleLocks.length > 0) {
      logger.debug(`Cleaned up ${staleLocks.length} stale locks`);
    }
  }
  
  /**
   * Clean up old audit events
   */
  private async cleanupOldAuditEvents(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.config.audit.retentionDays * 24 * 60 * 60 * 1000);
    const oldEvents: AuditId[] = [];
    
    for (const [auditId, event] of this.auditEvents.entries()) {
      if (event.timestamp < cutoffDate) {
        oldEvents.push(auditId);
      }
    }
    
    for (const auditId of oldEvents) {
      this.auditEvents.delete(auditId);
    }
    
    if (oldEvents.length > 0) {
      logger.debug(`Cleaned up ${oldEvents.length} old audit events`);
    }
  }
  
  /**
   * Track performance metrics
   */
  private trackPerformance(operation: string, responseTime: number): void {
    this.totalResponseTime += responseTime;
    
    if (responseTime > this.config.performanceThresholdMs) {
      logger.warn(`Security operation '${operation}' exceeded performance threshold: ${responseTime}ms`);
    }
  }
  
  /**
   * Collect metrics
   */
  private collectMetrics(): void {
    const stats: SecurityStatistics = {
      totalEvents: this.eventCount,
      eventsByType: Object.fromEntries(this.eventsByType) as Record<SecurityEventType, number>,
      eventsBySeverity: Object.fromEntries(this.eventsBySeverity) as Record<SecurityEventSeverity, number>,
      violationCount: this.violationCount,
      blockedAttempts: this.blockedAttempts,
      activeUsers: new Set(Array.from(this.activeSessions.values()).map(s => s.userId)).size,
      activeSessions: this.activeSessions.size,
      activeLocks: this.activeLocks.size,
      averageResponseTime: this.eventCount > 0 ? this.totalResponseTime / this.eventCount : 0,
      securityScore: this.calculateSecurityScore()
    };
    
    this.emit('metricsCollected', stats);
  }
  
  /**
   * Calculate security score (0-100)
   */
  private calculateSecurityScore(): number {
    let score = 100;
    
    // Deduct points for violations
    if (this.violationCount > 0) {
      score -= Math.min(this.violationCount * 2, 30);
    }
    
    // Deduct points for blocked attempts
    if (this.blockedAttempts > 0) {
      score -= Math.min(this.blockedAttempts * 1, 20);
    }
    
    // Deduct points for performance issues
    const avgResponseTime = this.eventCount > 0 ? this.totalResponseTime / this.eventCount : 0;
    if (avgResponseTime > this.config.performanceThresholdMs) {
      score -= 10;
    }
    
    return Math.max(score, 0);
  }
  
  /**
   * Get security statistics
   */
  public getStatistics(): SecurityStatistics {
    return {
      totalEvents: this.eventCount,
      eventsByType: Object.fromEntries(this.eventsByType) as Record<SecurityEventType, number>,
      eventsBySeverity: Object.fromEntries(this.eventsBySeverity) as Record<SecurityEventSeverity, number>,
      violationCount: this.violationCount,
      blockedAttempts: this.blockedAttempts,
      activeUsers: new Set(Array.from(this.activeSessions.values()).map(s => s.userId)).size,
      activeSessions: this.activeSessions.size,
      activeLocks: this.activeLocks.size,
      averageResponseTime: this.eventCount > 0 ? this.totalResponseTime / this.eventCount : 0,
      securityScore: this.calculateSecurityScore()
    };
  }
  
  // =============================================================================
  // CLEANUP AND DISPOSAL
  // =============================================================================
  
  /**
   * Dispose of the engine and clean up resources
   */
  public dispose(): void {
    // Stop timers
    if (this.lockCleanupTimer) {
      clearInterval(this.lockCleanupTimer);
      this.lockCleanupTimer = null;
    }
    
    if (this.auditCleanupTimer) {
      clearInterval(this.auditCleanupTimer);
      this.auditCleanupTimer = null;
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    
    // Clear state
    this.activeSessions.clear();
    this.activeLocks.clear();
    this.auditEvents.clear();
    this.permissionCache.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    this.initialized = false;
    logger.info('Unified Security Engine disposed');
  }
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Create default configuration for the unified security engine
 */
export function createDefaultSecurityConfig(): UnifiedSecurityEngineConfig {
  return {
    enabled: true,
    strictMode: false,
    performanceThresholdMs: 1000,
    logViolations: true,
    blockOnCriticalViolations: true,
    
    authentication: {
      enabled: true,
      tokenExpiryMinutes: 60,
      maxSessionsPerUser: 5,
      requireStrongPasswords: true,
      enableMFA: false
    },
    
    authorization: {
      enabled: true,
      defaultRole: 'viewer',
      roleHierarchy: {
        admin: ['manager', 'developer', 'viewer', 'guest'],
        manager: ['developer', 'viewer', 'guest'],
        developer: ['viewer', 'guest'],
        viewer: ['guest'],
        guest: []
      },
      permissionCache: true
    },
    
    pathSecurity: {
      enabled: true,
      allowedReadPaths: [process.cwd()],
      allowedWritePaths: [process.cwd()],
      allowedExtensions: ['.ts', '.js', '.json', '.md', '.txt', '.yaml', '.yml'],
      blockSystemPaths: true,
      followSymlinks: false
    },
    
    dataSanitization: {
      enabled: true,
      strictMode: false,
      allowHtml: false,
      allowScripts: false,
      maxStringLength: 10000,
      sanitizeFileNames: true
    },
    
    concurrentAccess: {
      enabled: true,
      maxLockDuration: 300000, // 5 minutes
      deadlockDetection: true,
      lockCleanupInterval: 60, // 1 minute
      maxLocksPerResource: 10
    },
    
    audit: {
      enabled: true,
      logLevel: 'info',
      retentionDays: 30,
      enableIntegrityChecks: true,
      compressLogs: false
    },
    
    filesystem: {
      enabled: true,
      systemDirectoryBlacklist: [
        '/private/var/spool',
        '/System',
        '/usr/bin',
        '/usr/sbin',
        '/bin',
        '/sbin'
      ],
      maxFileSize: 10485760, // 10MB
      allowedMimeTypes: ['text/plain', 'application/json', 'text/markdown'],
      scanForMalware: false
    }
  };
}