// Single source of truth for translating ApiError envelopes coming back
// from mutations into user-facing toast copy.
//
// Lifecycle transitions surface the actual `from`/`to` in the message so
// the user understands why the action was rejected — the backend already
// puts them in `details`, we just thread them through.
import { ApiError, ErrorCode } from './api';

export function describeMutationError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  if (
    error.code === ErrorCode.BILL_INVALID_TRANSITION ||
    error.code === ErrorCode.PAYMENT_INVALID_TRANSITION
  ) {
    const details = error.details as
      | { from?: string; to?: string; allowedFrom?: string[] }
      | undefined;
    if (details?.from && details.to) {
      return `${error.message} Current state: ${details.from}.`;
    }
  }
  return error.message || fallback;
}
