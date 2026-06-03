// Wire-shape types + helpers for the bulk endpoints documented in
// `docs/api-contract.md → Bulk operations`. Every bulk endpoint returns
// the same `{ results, summary }` envelope; the consumer modal renders
// it without caring which underlying action produced it.
//
// For actions that are NOT exposed as a backend bulk endpoint (e.g.
// `submit-for-approval`, `reject`, `schedule`, `retry`), the FE
// iterates the single-item endpoint via `runClientBulk` and produces
// the same envelope shape so the result modal stays uniform.

import { ApiError } from './api';

export interface BulkItemError {
  code: string;
  message: string;
  details?: unknown;
}

export interface BulkItemResult<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: BulkItemError;
}

export interface BulkSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface BulkResponse<T = unknown> {
  results: BulkItemResult<T>[];
  summary: BulkSummary;
}

// Wraps a sequence of single-item calls into the same envelope shape the
// backend bulk endpoints return. Used for actions the backend does not
// expose as a bulk endpoint (`submit-for-approval`, `reject`,
// `schedule`, `unschedule`, `retry`). Calls run in parallel so the
// modal opens reasonably fast even on a 25-row selection; the backend
// already serialises behind a single Prisma transaction per item.
export async function runClientBulk<T>(
  ids: readonly string[],
  perItem: (id: string) => Promise<T>,
): Promise<BulkResponse<T>> {
  const settled = await Promise.allSettled(ids.map((id) => perItem(id)));
  const results: BulkItemResult<T>[] = settled.map((outcome, index) => {
    const id = ids[index] ?? '';
    if (outcome.status === 'fulfilled') {
      return { id, ok: true, data: outcome.value };
    }
    const reason = outcome.reason;
    if (reason instanceof ApiError) {
      return {
        id,
        ok: false,
        error: { code: reason.code, message: reason.message, details: reason.details },
      };
    }
    return {
      id,
      ok: false,
      error: {
        code: 'CLIENT_ERROR',
        message: reason instanceof Error ? reason.message : 'Unknown error',
      },
    };
  });
  const succeeded = results.filter((r) => r.ok).length;
  return {
    results,
    summary: { total: results.length, succeeded, failed: results.length - succeeded },
  };
}
