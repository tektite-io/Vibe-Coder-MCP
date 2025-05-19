/**
 * Utilities for testing API calls
 */

import { vi } from 'vitest';

/**
 * Create a mock Axios instance
 * @returns Mock Axios instance
 */
export function createMockAxios() {
  // Define types for API responses and requests
  type ApiResponse = Record<string, unknown>;
  type ApiError = Record<string, unknown>;

  const mockResponses = new Map<string, ApiResponse>();
  const mockErrors = new Map<string, ApiError>();
  const requestHistory: {
    method: string;
    url: string;
    data?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }[] = [];

  const mockAxios = {
    get: vi.fn((url: string, config?: Record<string, unknown>) => {
      requestHistory.push({ method: 'get', url, config });

      const key = `get:${url}`;

      if (mockErrors.has(key)) {
        return Promise.reject(mockErrors.get(key));
      }

      if (mockResponses.has(key)) {
        return Promise.resolve({ data: mockResponses.get(key), status: 200 });
      }

      return Promise.reject(new Error(`No mock response for GET ${url}`));
    }),

    post: vi.fn((url: string, data?: Record<string, unknown>, config?: Record<string, unknown>) => {
      requestHistory.push({ method: 'post', url, data, config });

      const key = `post:${url}`;

      if (mockErrors.has(key)) {
        return Promise.reject(mockErrors.get(key));
      }

      if (mockResponses.has(key)) {
        return Promise.resolve({ data: mockResponses.get(key), status: 200 });
      }

      return Promise.reject(new Error(`No mock response for POST ${url}`));
    }),

    put: vi.fn((url: string, data?: Record<string, unknown>, config?: Record<string, unknown>) => {
      requestHistory.push({ method: 'put', url, data, config });

      const key = `put:${url}`;

      if (mockErrors.has(key)) {
        return Promise.reject(mockErrors.get(key));
      }

      if (mockResponses.has(key)) {
        return Promise.resolve({ data: mockResponses.get(key), status: 200 });
      }

      return Promise.reject(new Error(`No mock response for PUT ${url}`));
    }),

    delete: vi.fn((url: string, config?: Record<string, unknown>) => {
      requestHistory.push({ method: 'delete', url, config });

      const key = `delete:${url}`;

      if (mockErrors.has(key)) {
        return Promise.reject(mockErrors.get(key));
      }

      if (mockResponses.has(key)) {
        return Promise.resolve({ data: mockResponses.get(key), status: 200 });
      }

      return Promise.reject(new Error(`No mock response for DELETE ${url}`));
    }),

    patch: vi.fn((url: string, data?: Record<string, unknown>, config?: Record<string, unknown>) => {
      requestHistory.push({ method: 'patch', url, data, config });

      const key = `patch:${url}`;

      if (mockErrors.has(key)) {
        return Promise.reject(mockErrors.get(key));
      }

      if (mockResponses.has(key)) {
        return Promise.resolve({ data: mockResponses.get(key), status: 200 });
      }

      return Promise.reject(new Error(`No mock response for PATCH ${url}`));
    }),

    // Utility methods for testing
    _mockResponse: (method: string, url: string, response: ApiResponse) => {
      mockResponses.set(`${method.toLowerCase()}:${url}`, response);
    },

    _mockError: (method: string, url: string, error: ApiError) => {
      mockErrors.set(`${method.toLowerCase()}:${url}`, error);
    },

    _getRequestHistory: () => [...requestHistory],

    _reset: () => {
      mockResponses.clear();
      mockErrors.clear();
      requestHistory.length = 0;
    },

    // Axios instance properties
    defaults: {
      headers: {
        common: {},
        get: {},
        post: {},
        put: {},
        delete: {},
        patch: {},
      },
      baseURL: '',
      timeout: 0,
    },

    interceptors: {
      request: {
        use: vi.fn(),
        eject: vi.fn(),
      },
      response: {
        use: vi.fn(),
        eject: vi.fn(),
      },
    },

    create: vi.fn(() => mockAxios),

    isCancel: vi.fn(() => false),

    CancelToken: {
      source: vi.fn(() => ({
        token: {},
        cancel: vi.fn(),
      })),
    },
  };

  return mockAxios;
}

/**
 * Mock Axios module
 * @param mockAxios Mock Axios instance
 */
export function mockAxios(mockAxios: ReturnType<typeof createMockAxios>) {
  vi.mock('axios', () => ({
    default: mockAxios,
    ...mockAxios,
  }));
}

/**
 * Restore Axios module
 */
export function restoreAxios() {
  vi.unmock('axios');
}

/**
 * Create a mock API client
 * @param baseUrl Base URL
 * @returns Mock API client
 */
export function createMockApiClient(baseUrl: string = 'https://api.example.com') {
  const mockAxiosInstance = createMockAxios();

  return {
    get: async (path: string, config?: Record<string, unknown>) => {
      const url = `${baseUrl}${path}`;
      return mockAxiosInstance.get(url, config);
    },

    post: async (path: string, data?: Record<string, unknown>, config?: Record<string, unknown>) => {
      const url = `${baseUrl}${path}`;
      return mockAxiosInstance.post(url, data, config);
    },

    put: async (path: string, data?: Record<string, unknown>, config?: Record<string, unknown>) => {
      const url = `${baseUrl}${path}`;
      return mockAxiosInstance.put(url, data, config);
    },

    delete: async (path: string, config?: Record<string, unknown>) => {
      const url = `${baseUrl}${path}`;
      return mockAxiosInstance.delete(url, config);
    },

    patch: async (path: string, data?: Record<string, unknown>, config?: Record<string, unknown>) => {
      const url = `${baseUrl}${path}`;
      return mockAxiosInstance.patch(url, data, config);
    },

    // Utility methods for testing
    _mockResponse: (method: string, path: string, response: Record<string, unknown>) => {
      const url = `${baseUrl}${path}`;
      mockAxiosInstance._mockResponse(method, url, response);
    },

    _mockError: (method: string, path: string, error: Record<string, unknown>) => {
      const url = `${baseUrl}${path}`;
      mockAxiosInstance._mockError(method, url, error);
    },

    _getRequestHistory: () => mockAxiosInstance._getRequestHistory(),

    _reset: () => mockAxiosInstance._reset(),
  };
}

/**
 * Create a mock API error
 * @param status HTTP status code
 * @param message Error message
 * @param data Additional error data
 * @returns Mock API error
 */
export function createMockApiError(status: number, message: string, data?: Record<string, unknown>) {
  const error = new Error(message);

  Object.assign(error, {
    response: {
      status,
      data: {
        message,
        ...data,
      },
    },
    isAxiosError: true,
  });

  return error;
}
