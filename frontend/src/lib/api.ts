// Typed fetch wrapper for the Bill Pay API.
//
// - Reads `x-user-id` from the role store via a module-level getter that the
//   provider wires up at mount time. This keeps the API client decoupled
//   from React while still respecting the active "Acting as" selection.
//   Tests and SSR boots can call `setActiveUserIdGetter` directly.
// - Throws `ApiError` carrying the documented `{ code, message, details? }`
//   envelope plus the HTTP status, so callers can branch on stable codes.
// - For non-JSON 2xx responses (the CSV export) returns the raw `Response`.

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

// Mirrors `backend/src/common/errors/error-codes.ts`. Re-exported so the UI
// has one import surface to branch on.
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  NOT_FOUND: 'NOT_FOUND',
  VENDOR_NOT_FOUND: 'VENDOR_NOT_FOUND',
  VENDOR_HAS_BILLS: 'VENDOR_HAS_BILLS',
  BILL_NOT_EDITABLE: 'BILL_NOT_EDITABLE',
  BILL_LINE_ITEM_NOT_FOUND: 'BILL_LINE_ITEM_NOT_FOUND',
  BILL_INVALID_TRANSITION: 'BILL_INVALID_TRANSITION',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_INVALID_TRANSITION: 'PAYMENT_INVALID_TRANSITION',
  UNIQUE_CONSTRAINT_VIOLATION: 'UNIQUE_CONSTRAINT_VIOLATION',
  FOREIGN_KEY_VIOLATION: 'FOREIGN_KEY_VIOLATION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const BASE_URL: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

type ActiveUserIdGetter = () => string | undefined;

let activeUserIdGetter: ActiveUserIdGetter = () => undefined;

export function setActiveUserIdGetter(getter: ActiveUserIdGetter): void {
  activeUserIdGetter = getter;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  // When true, return the raw `Response` instead of parsing JSON. Used for
  // the CSV export endpoint.
  raw?: boolean;
  // Skip the auth header. Currently only `GET /health` uses this.
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, raw, skipAuth, headers, ...rest } = options;

  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  // Normalize via the Headers constructor so all valid HeadersInit shapes
  // (plain object, Headers instance, [string,string][]) merge correctly.
  // A naive object spread would silently drop entries when the caller
  // passes a Headers instance.
  const finalHeaders = new Headers(headers);
  finalHeaders.set('Accept', raw ? 'text/csv' : 'application/json');

  if (!skipAuth) {
    const userId = activeUserIdGetter();
    if (userId) {
      finalHeaders.set('x-user-id', userId);
    }
  }

  let serializedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    finalHeaders.set('Content-Type', 'application/json');
    serializedBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...rest, headers: finalHeaders, body: serializedBody });
  } catch (cause) {
    throw new ApiError(0, {
      code: ErrorCode.NETWORK_ERROR,
      message: 'Could not reach the API. Is the backend running?',
      details: cause instanceof Error ? { name: cause.name, message: cause.message } : undefined,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const payload = await safeReadError(response);
    throw new ApiError(response.status, payload);
  }

  if (raw) {
    return response as unknown as T;
  }

  return (await response.json()) as T;
}

async function safeReadError(response: Response): Promise<ApiErrorPayload> {
  try {
    const parsed = (await response.json()) as { error?: ApiErrorPayload };
    if (parsed.error && typeof parsed.error.code === 'string') {
      return parsed.error;
    }
  } catch {
    // Fall through to the generic envelope below — the backend always emits
    // JSON, but a proxy or network hiccup can break that contract.
  }
  return {
    code: defaultCodeForStatus(response.status),
    message: `Request failed with status ${response.status}`,
  };
}

function defaultCodeForStatus(status: number): string {
  if (status === 400) return ErrorCode.VALIDATION_ERROR;
  if (status === 401) return ErrorCode.UNAUTHENTICATED;
  if (status === 403) return ErrorCode.INSUFFICIENT_PERMISSIONS;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status >= 500) return ErrorCode.INTERNAL_ERROR;
  return `HTTP_${status}`;
}
