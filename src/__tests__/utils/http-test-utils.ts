/**
 * Utilities for testing HTTP requests and responses
 */

import { Request, Response } from 'express';
import { vi } from 'vitest';

// Define more specific types for our mock objects
type MockRequestOptions = {
  method?: string;
  url?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  session?: Record<string, unknown>;
  ip?: string;
  path?: string;
  protocol?: string;
  secure?: boolean;
  xhr?: boolean;
};

// Define a type for our mock response
type MockResponseData = {
  _headers: Record<string, string>;
  _status: number;
  _data: unknown;
  _json: unknown;
  _end: unknown;
  _redirect: string | null;
  _renderView: string | null;
  _renderData: unknown;
  _cookies: Record<string, { value: string; options?: Record<string, unknown> }>;
};

/**
 * Create a mock Express request object
 * @param options Request options
 * @returns Mock Express request object
 */
export function createMockRequest(options: MockRequestOptions = {}): Partial<Request> & { session?: Record<string, unknown> } {
  const {
    method = 'GET',
    url = '/',
    params = {},
    query = {},
    body = {},
    headers = {},
    cookies = {},
    session = {},
    ip = '127.0.0.1',
    path = '/',
    protocol = 'http',
    secure = false,
    xhr = false,
  } = options;

  const req: Partial<Request> & { session?: Record<string, unknown> } = {
    method,
    url,
    params,
    query,
    body,
    headers: {
      'x-session-id': 'test-session',
      ...headers,
    },
    cookies,
    session,
    ip,
    path,
    protocol,
    secure,
    xhr,
    get: vi.fn(function(name: string): string | string[] | undefined {
      if (name.toLowerCase() === 'set-cookie') {
        return headers[name.toLowerCase()] ? [headers[name.toLowerCase()]] : undefined;
      }
      return headers[name.toLowerCase()];
    }) as unknown as { (name: "set-cookie"): string[] | undefined; (name: string): string | undefined; },
    header: vi.fn(function(name: string): string | string[] | undefined {
      if (name.toLowerCase() === 'set-cookie') {
        return headers[name.toLowerCase()] ? [headers[name.toLowerCase()]] : undefined;
      }
      return headers[name.toLowerCase()];
    }) as unknown as { (name: "set-cookie"): string[] | undefined; (name: string): string | undefined; },
    is: vi.fn((): false => false),
  };

  return req;
}

/**
 * Create a mock Express response object
 * @returns Mock Express response object
 */
export function createMockResponse(): Partial<Response> & MockResponseData {
  const res: Partial<Response> & MockResponseData = {
    _headers: {},
    _status: 200,
    _data: null,
    _json: null,
    _end: null,
    _redirect: null,
    _renderView: null,
    _renderData: null,
    _cookies: {},

    status: vi.fn(function(this: Partial<Response> & MockResponseData, code: number) {
      this._status = code;
      return this as Response;
    }) as (code: number) => Response,

    send: vi.fn(function(this: Partial<Response> & MockResponseData, data: unknown) {
      this._data = data;
      return this as Response;
    }) as unknown as Response['send'],

    json: vi.fn(function(this: Partial<Response> & MockResponseData, data: unknown) {
      this._json = data;
      return this as Response;
    }) as unknown as Response['json'],

    end: vi.fn(function(this: Partial<Response> & MockResponseData, data: unknown) {
      this._end = data;
      return this as Response;
    }) as unknown as Response['end'],

    set: vi.fn(function(this: Partial<Response> & MockResponseData, field: string | Record<string, string>, value?: string | string[]) {
      if (typeof field === 'string') {
        this._headers[field.toLowerCase()] = Array.isArray(value) ? value.join(', ') : (value as string);
      } else {
        for (const key in field) {
          this._headers[key.toLowerCase()] = field[key];
        }
      }
      return this as Response;
    }) as unknown as Response['set'],

    get: vi.fn(function(this: Partial<Response> & MockResponseData, field: string) {
      return this._headers[field.toLowerCase()];
    }),

    cookie: vi.fn(function(this: Partial<Response> & MockResponseData, name: string, value: string, options?: any) {
      this._cookies[name] = { value, options };
      return this as Response;
    }) as unknown as Response['cookie'],

    clearCookie: vi.fn(function(this: Partial<Response> & MockResponseData, name: string, _options?: any) {
      delete this._cookies[name];
      return this as Response;
    }) as unknown as Response['clearCookie'],

    redirect: vi.fn(function(this: Partial<Response> & MockResponseData, ...args: any[]) {
      if (args.length === 1) {
        // redirect(url: string)
        this._redirect = args[0];
      } else if (args.length === 2) {
        if (typeof args[0] === 'number') {
          // redirect(status: number, url: string)
          this._redirect = args[1];
        } else {
          // redirect(url: string, status: number)
          this._redirect = args[0];
        }
      }
      return this as Response;
    }) as unknown as Response['redirect'],

    render: vi.fn(function(this: Partial<Response> & MockResponseData, view: string, data?: unknown) {
      this._renderView = view;
      this._renderData = data;
      return this;
    }),

    write: vi.fn(function(this: Partial<Response> & MockResponseData, data: unknown) {
      this._data = data;
      return true;
    }),

    flushHeaders: vi.fn(),

    on: vi.fn(function(this: Partial<Response> & MockResponseData, _event: string, _listener: (...args: any[]) => void) {
      // Parameters are intentionally unused
      return this as Response;
    }) as unknown as Response['on'],

    off: vi.fn(function(this: Partial<Response> & MockResponseData, _event: string, _listener: (...args: any[]) => void) {
      // Parameters are intentionally unused
      return this as Response;
    }) as unknown as Response['off'],

    writableEnded: false,
  };

  return res;
}

/**
 * Create a mock SSE response object
 * @returns Mock SSE response object
 */
export function createMockSseResponse(): Partial<Response> & {
  _messages: string[];
  _getLastMessage: () => string | undefined;
  _getAllMessages: () => string[];
} {
  const messages: string[] = [];

  const res = createMockResponse();

  res.write = vi.fn((message: string) => {
    messages.push(message);
    return true;
  });

  return {
    ...res,
    _messages: messages,
    _getLastMessage: () => messages[messages.length - 1],
    _getAllMessages: () => messages,
  };
}

/**
 * Create a mock next function for Express middleware
 * @returns Mock next function
 */
export function createMockNext() {
  return vi.fn();
}

// Define a type for Express route handlers
type ExpressHandler = (req: Partial<Request>, res: Partial<Response>, next?: () => void) => void | Promise<void>;

/**
 * Create a mock Express app
 * @returns Mock Express app
 */
export function createMockExpressApp() {
  const routes: Record<string, Record<string, ExpressHandler>> = {
    get: {},
    post: {},
    put: {},
    delete: {},
    patch: {},
  };

  const middlewares: ExpressHandler[] = [];

  const app = {
    get: vi.fn((path: string, handler: ExpressHandler) => {
      routes.get[path] = handler;
      return app;
    }),

    post: vi.fn((path: string, handler: ExpressHandler) => {
      routes.post[path] = handler;
      return app;
    }),

    put: vi.fn((path: string, handler: ExpressHandler) => {
      routes.put[path] = handler;
      return app;
    }),

    delete: vi.fn((path: string, handler: ExpressHandler) => {
      routes.delete[path] = handler;
      return app;
    }),

    patch: vi.fn((path: string, handler: ExpressHandler) => {
      routes.patch[path] = handler;
      return app;
    }),

    use: vi.fn((middleware: ExpressHandler) => {
      middlewares.push(middleware);
      return app;
    }),

    _routes: routes,
    _middlewares: middlewares,

    _executeRoute: async (method: string, path: string, req: Partial<Request>, res: Partial<Response>, next = createMockNext()) => {
      const lowerMethod = method.toLowerCase();
      if (routes[lowerMethod] && routes[lowerMethod][path]) {
        return routes[lowerMethod][path](req, res, next);
      }
      throw new Error(`Route not found: ${method} ${path}`);
    },

    _executeMiddleware: async (index: number, req: Partial<Request>, res: Partial<Response>, next = createMockNext()) => {
      if (index < middlewares.length) {
        return middlewares[index](req, res, next);
      }
      throw new Error(`Middleware not found at index ${index}`);
    },
  };

  return app;
}
