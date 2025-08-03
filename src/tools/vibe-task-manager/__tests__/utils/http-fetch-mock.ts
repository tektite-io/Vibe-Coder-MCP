/**
 * HTTP/Fetch Mocking System for Test Infrastructure
 * Provides comprehensive mocking for all HTTP/fetch operations in tests
 * Integrates with universal cleanup system for proper test isolation
 */

import { vi } from 'vitest';
import logger from '../../../../logger.js';

/**
 * Mock response configuration
 */
export interface MockHttpResponse {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  delay?: number;
  shouldFail?: boolean;
  failureReason?: string;
}

/**
 * Mock request matcher
 */
export interface MockRequestMatcher {
  url?: string | RegExp;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * Mock configuration entry
 */
interface MockEntry {
  matcher: MockRequestMatcher;
  response: MockHttpResponse;
  callCount: number;
  maxCalls?: number;
  id: string;
}

/**
 * Global mock state
 */
interface MockState {
  isInitialized: boolean;
  mockEntries: MockEntry[];
  requestHistory: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
    timestamp: number;
  }>;
  originalFetch?: typeof fetch;
}

let mockState: MockState = {
  isInitialized: false,
  mockEntries: [],
  requestHistory: []
};

/**
 * Initialize HTTP/fetch mocking system
 */
export function initializeHttpMocking(): void {
  if (mockState.isInitialized) {
    logger.debug('HTTP mocking already initialized');
    return;
  }

  // Store original fetch if available
  if (typeof global.fetch !== 'undefined') {
    mockState.originalFetch = global.fetch;
  }

  // Mock global fetch
  global.fetch = vi.fn().mockImplementation(async (url: string | URL, options: RequestInit = {}) => {
    const urlString = url.toString();
    const method = options.method || 'GET';
    const headers = (options.headers as Record<string, string>) || {};
    const body = options.body;

    // Record request in history
    mockState.requestHistory.push({
      url: urlString,
      method,
      headers,
      body,
      timestamp: Date.now()
    });

    logger.debug({ url: urlString, method, headers }, 'Mock fetch intercepted request');

    // Find matching mock entry
    const matchingEntry = findMatchingMockEntry(urlString, method, headers, body);
    
    if (!matchingEntry) {
      logger.warn({ url: urlString, method }, 'No mock configured for HTTP request');
      throw new Error(`No mock configured for ${method} ${urlString}`);
    }

    // Increment call count
    matchingEntry.callCount++;

    // Check if max calls exceeded
    if (matchingEntry.maxCalls && matchingEntry.callCount > matchingEntry.maxCalls) {
      throw new Error(`Mock for ${method} ${urlString} exceeded max calls (${matchingEntry.maxCalls})`);
    }

    // Apply delay if configured
    if (matchingEntry.response.delay) {
      await new Promise(resolve => setTimeout(resolve, matchingEntry.response.delay));
    }

    // Handle failure scenarios
    if (matchingEntry.response.shouldFail) {
      throw new Error(matchingEntry.response.failureReason || 'Mock HTTP request failed');
    }

    // Create mock response
    const mockResponse = createMockResponse(matchingEntry.response);
    
    logger.debug({ 
      url: urlString, 
      method, 
      status: mockResponse.status,
      callCount: matchingEntry.callCount 
    }, 'Mock fetch returning response');

    return mockResponse;
  });

  mockState.isInitialized = true;
  logger.debug('HTTP/fetch mocking system initialized');
}

/**
 * Find matching mock entry for a request
 */
function findMatchingMockEntry(
  url: string, 
  method: string, 
  headers: Record<string, string>, 
  body: unknown
): MockEntry | undefined {
  return mockState.mockEntries.find(entry => {
    const matcher = entry.matcher;

    // Check URL match
    if (matcher.url) {
      if (typeof matcher.url === 'string') {
        if (url !== matcher.url) return false;
      } else if (matcher.url instanceof RegExp) {
        if (!matcher.url.test(url)) return false;
      }
    }

    // Check method match
    if (matcher.method && method.toLowerCase() !== matcher.method.toLowerCase()) {
      return false;
    }

    // Check headers match
    if (matcher.headers) {
      for (const [key, value] of Object.entries(matcher.headers)) {
        if (headers[key] !== value) return false;
      }
    }

    // Check body match (basic comparison)
    if (matcher.body && JSON.stringify(body) !== JSON.stringify(matcher.body)) {
      return false;
    }

    return true;
  });
}

/**
 * Create mock Response object
 */
function createMockResponse(config: MockHttpResponse): Response {
  const headers = new Headers(config.headers || {});
  
  const responseBody = config.body !== undefined 
    ? (typeof config.body === 'string' ? config.body : JSON.stringify(config.body))
    : '';

  return new Response(responseBody, {
    status: config.status,
    statusText: config.statusText || getDefaultStatusText(config.status),
    headers
  });
}

/**
 * Get default status text for HTTP status codes
 */
function getDefaultStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };
  
  return statusTexts[status] || 'Unknown';
}

/**
 * Add a mock for HTTP requests
 */
export function mockHttpRequest(
  matcher: MockRequestMatcher, 
  response: MockHttpResponse,
  options: { maxCalls?: number; id?: string } = {}
): string {
  const id = options.id || `mock-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  
  const mockEntry: MockEntry = {
    matcher,
    response,
    callCount: 0,
    maxCalls: options.maxCalls,
    id
  };

  mockState.mockEntries.push(mockEntry);
  
  logger.debug({ id, matcher, response }, 'HTTP mock registered');
  
  return id;
}

/**
 * Mock successful HTTP response
 */
export function mockHttpSuccess(
  matcher: MockRequestMatcher,
  body?: unknown,
  status: number = 200,
  options: { maxCalls?: number; id?: string } = {}
): string {
  return mockHttpRequest(matcher, {
    status,
    body,
    headers: { 'Content-Type': 'application/json' }
  }, options);
}

/**
 * Mock HTTP error response
 */
export function mockHttpError(
  matcher: MockRequestMatcher,
  status: number = 500,
  errorMessage?: string,
  options: { maxCalls?: number; id?: string } = {}
): string {
  return mockHttpRequest(matcher, {
    status,
    body: { error: errorMessage || 'Internal Server Error' },
    headers: { 'Content-Type': 'application/json' }
  }, options);
}

/**
 * Mock HTTP request failure (network error)
 */
export function mockHttpFailure(
  matcher: MockRequestMatcher,
  failureReason?: string,
  options: { maxCalls?: number; id?: string } = {}
): string {
  return mockHttpRequest(matcher, {
    status: 0,
    shouldFail: true,
    failureReason: failureReason || 'Network error'
  }, options);
}

/**
 * Mock agent HTTP endpoint
 */
export function mockAgentEndpoint(
  agentId: string,
  endpoint: string,
  response: { success?: boolean; result?: unknown; error?: string } = { success: true },
  options: { maxCalls?: number } = {}
): string {
  return mockHttpSuccess(
    {
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    response,
    200,
    { ...options, id: `agent-${agentId}` }
  );
}

/**
 * Remove a specific mock by ID
 */
export function removeMock(id: string): boolean {
  const initialLength = mockState.mockEntries.length;
  mockState.mockEntries = mockState.mockEntries.filter(entry => entry.id !== id);
  
  const removed = mockState.mockEntries.length < initialLength;
  if (removed) {
    logger.debug({ id }, 'HTTP mock removed');
  }
  
  return removed;
}

/**
 * Clear all HTTP mocks
 */
export function clearAllHttpMocks(): void {
  const mockCount = mockState.mockEntries.length;
  mockState.mockEntries = [];
  mockState.requestHistory = [];
  
  if (mockCount > 0) {
    logger.debug({ mockCount }, 'All HTTP mocks cleared');
  }
}

/**
 * Get request history
 */
export function getRequestHistory(): typeof mockState.requestHistory {
  return [...mockState.requestHistory];
}

/**
 * Get mock statistics
 */
export function getMockStats(): {
  totalMocks: number;
  totalRequests: number;
  mockUsage: Array<{
    id: string;
    matcher: MockRequestMatcher;
    callCount: number;
    maxCalls?: number;
  }>;
} {
  return {
    totalMocks: mockState.mockEntries.length,
    totalRequests: mockState.requestHistory.length,
    mockUsage: mockState.mockEntries.map(entry => ({
      id: entry.id,
      matcher: entry.matcher,
      callCount: entry.callCount,
      maxCalls: entry.maxCalls
    }))
  };
}

/**
 * Verify that a mock was called
 */
export function verifyMockCalled(id: string, expectedCalls?: number): boolean {
  const entry = mockState.mockEntries.find(e => e.id === id);
  if (!entry) {
    throw new Error(`Mock with ID ${id} not found`);
  }
  
  if (expectedCalls !== undefined) {
    return entry.callCount === expectedCalls;
  }
  
  return entry.callCount > 0;
}

/**
 * Verify that a request was made
 */
export function verifyRequestMade(
  url: string | RegExp, 
  method?: string,
  expectedCount?: number
): boolean {
  const matchingRequests = mockState.requestHistory.filter(req => {
    const urlMatches = typeof url === 'string' 
      ? req.url === url 
      : url.test(req.url);
    
    const methodMatches = !method || req.method.toLowerCase() === method.toLowerCase();
    
    return urlMatches && methodMatches;
  });
  
  if (expectedCount !== undefined) {
    return matchingRequests.length === expectedCount;
  }
  
  return matchingRequests.length > 0;
}

/**
 * Reset HTTP mocking system
 */
export function resetHttpMocking(): void {
  // Restore original fetch if it was stored
  if (mockState.originalFetch) {
    global.fetch = mockState.originalFetch;
  } else {
    delete (global as Record<string, unknown>).fetch;
  }

  // Reset state
  mockState = {
    isInitialized: false,
    mockEntries: [],
    requestHistory: []
  };
  
  logger.debug('HTTP mocking system reset');
}

/**
 * Setup HTTP mocking for tests (call in beforeEach)
 */
export function setupHttpMocking(): void {
  initializeHttpMocking();
  clearAllHttpMocks();
}

/**
 * Cleanup HTTP mocking for tests (call in afterEach)
 */
export function cleanupHttpMocking(): void {
  clearAllHttpMocks();
}

/**
 * Common mock configurations for agent communication
 */
export const AgentMocks = {
  /**
   * Mock successful agent task assignment
   */
  successfulTaskAssignment: (agentId: string, endpoint: string) => 
    mockAgentEndpoint(agentId, endpoint, { success: true, result: 'Task assigned' }),

  /**
   * Mock failed agent task assignment
   */
  failedTaskAssignment: (agentId: string, endpoint: string, error: string = 'Agent unavailable') =>
    mockAgentEndpoint(agentId, endpoint, { success: false, error }),

  /**
   * Mock agent timeout
   */
  agentTimeout: (agentId: string, endpoint: string) =>
    mockHttpRequest(
      { url: endpoint, method: 'POST' },
      { status: 200, body: { success: true }, delay: 10000 }, // 10 second delay
      { id: `agent-timeout-${agentId}` }
    ),

  /**
   * Mock agent network error
   */
  agentNetworkError: (agentId: string, endpoint: string) =>
    mockHttpFailure(
      { url: endpoint, method: 'POST' },
      'Network connection failed',
      { id: `agent-network-error-${agentId}` }
    )
};