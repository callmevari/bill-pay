// Wire-shape types for the bulk endpoints documented in
// `docs/api-contract.md → Bulk operations`. Every bulk endpoint returns
// the same `{ results, summary }` envelope; the consumer modal renders
// it without caring which underlying action produced it.

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
