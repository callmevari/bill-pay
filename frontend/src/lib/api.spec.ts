import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ErrorCode, apiFetch, setActiveUserIdGetter } from './api';

// Pure-function tests for the API client's error envelope handling.
// The wrapper has three failure modes that the UI branches on:
//   - network failures collapse into `ApiError(0, NETWORK_ERROR)`,
//   - well-formed `{ error: { code, message } }` bodies map verbatim
//     onto the thrown `ApiError`,
//   - malformed / non-JSON error bodies fall back to a status-derived
//     code so the UI never crashes on a misbehaving proxy.
// These three branches are the contract every TanStack Query consumer
// depends on; covering them in one spec is enough to lock the
// behaviour down without re-testing the framework.

const originalFetch = globalThis.fetch;

function mockFetch(response: Response | Error): void {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// Reads the `init` arg of the most recent `fetch` call, narrowed to a
// non-undefined `RequestInit` (every test that uses this helper has
// called `apiFetch` with options, so the cast is sound).
function lastFetchInit(spy: ReturnType<typeof vi.fn>): RequestInit {
  const call = spy.mock.calls[spy.mock.calls.length - 1];
  if (!call) throw new Error('fetch was not called');
  return (call[1] ?? {}) as RequestInit;
}

describe('apiFetch', () => {
  beforeEach(() => {
    setActiveUserIdGetter(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns the parsed JSON body on a 200', async () => {
    mockFetch(jsonResponse(200, { id: 'bill_1', amount: '10.00' }));
    const body = await apiFetch<{ id: string; amount: string }>('/bills/bill_1');
    expect(body).toEqual({ id: 'bill_1', amount: '10.00' });
  });

  it('returns undefined on a 204', async () => {
    mockFetch(new Response(null, { status: 204 }));
    const body = await apiFetch<undefined>('/bills/bill_1', { method: 'DELETE' });
    expect(body).toBeUndefined();
  });

  it('returns the raw Response when `raw: true` (CSV export path)', async () => {
    const csv = new Response('id,amount\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="bills.csv"',
      },
    });
    mockFetch(csv);
    const result = await apiFetch<Response>('/exports/bills.csv', { raw: true });
    expect(result).toBeInstanceOf(Response);
    expect(await result.text()).toBe('id,amount\n');
  });

  it('maps a well-formed error envelope verbatim onto the thrown ApiError', async () => {
    mockFetch(
      jsonResponse(409, {
        error: {
          code: 'BILL_FIELD_LOCKED_POST_PAYMENT',
          message: 'Cannot edit amount on a bill whose Payment already exists.',
          details: { lockedFields: ['amount'], paymentStatus: 'SCHEDULED' },
        },
      }),
    );

    await expect(apiFetch('/bills/bill_1', { method: 'PATCH', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'BILL_FIELD_LOCKED_POST_PAYMENT',
      message: 'Cannot edit amount on a bill whose Payment already exists.',
      details: { lockedFields: ['amount'], paymentStatus: 'SCHEDULED' },
    });
  });

  it('falls back to a status-derived code when the error body is not the documented envelope', async () => {
    mockFetch(jsonResponse(403, { whatever: 'a proxy stripped the body' }));
    const error = await apiFetch('/bills').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(403);
    expect(apiError.code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
    expect(apiError.message).toContain('403');
  });

  it('falls back to a status-derived code when the error body is not JSON at all', async () => {
    mockFetch(textResponse(500, '<html>nginx maintenance</html>'));
    const error = await apiFetch('/bills').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(500);
    expect(apiError.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('collapses a network failure into ApiError(0, NETWORK_ERROR)', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const error = await apiFetch('/bills').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(0);
    expect(apiError.code).toBe(ErrorCode.NETWORK_ERROR);
  });

  it('sets the `x-user-id` header from the active getter', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, {}));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    setActiveUserIdGetter(() => 'user_admin_seed');

    await apiFetch('/bills');

    const init = lastFetchInit(fetchSpy);
    const headers = new Headers(init.headers);
    expect(headers.get('x-user-id')).toBe('user_admin_seed');
  });

  it('omits the `x-user-id` header when `skipAuth: true`', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, {}));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    setActiveUserIdGetter(() => 'user_admin_seed');

    await apiFetch('/health', { skipAuth: true });

    const init = lastFetchInit(fetchSpy);
    const headers = new Headers(init.headers);
    expect(headers.get('x-user-id')).toBeNull();
  });

  it('serialises an object body to JSON and sets Content-Type', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(201, { id: 'bill_new' }));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await apiFetch('/bills', { method: 'POST', body: { amount: '100.00' } });

    const init = lastFetchInit(fetchSpy);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe('{"amount":"100.00"}');
  });
});
