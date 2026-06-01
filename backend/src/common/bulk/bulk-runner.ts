import { HttpException } from '@nestjs/common';

import { ErrorCode } from '../errors/error-codes';
import {
  BulkItemErrorDto,
  BulkItemResultDto,
  BulkResponseDto,
  buildBulkSummary,
} from '../dto/bulk-result.dto';

// Translates a thrown exception into the same `{ code, message, details? }`
// envelope the single-item endpoint would have written through the global
// exception filter. Keeping the translation here (instead of letting the
// filter handle it) is intentional: the filter only runs at the controller
// boundary, but a bulk endpoint catches exceptions per item inside the
// service and turns them into 200 responses with an `ok: false` entry —
// so each per-item failure has to be normalized here, by hand.
export function toBulkItemError(exception: unknown): BulkItemErrorDto {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return {
        code: ErrorCode.INTERNAL_ERROR,
        message: response,
      };
    }
    const obj = response as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    const code =
      typeof obj.code === 'string' ? obj.code : ErrorCode.INTERNAL_ERROR;
    const message =
      typeof obj.message === 'string' ? obj.message : exception.message;
    const error: BulkItemErrorDto = { code, message };
    if (obj.details !== undefined) {
      error.details = obj.details;
    }
    return error;
  }

  return {
    code: ErrorCode.INTERNAL_ERROR,
    message:
      exception instanceof Error
        ? exception.message
        : 'An unexpected error occurred.',
  };
}

// Iterates ids and invokes the single-item handler for each. Each call
// runs in its own try/catch so a failure in item N never affects
// item N+1 — the service method is responsible for opening its own
// transaction (which is how the single-item endpoint already works), so
// failures roll back only their own write and the activity log entry
// shows up exactly when the underlying operation succeeded.
export async function runBulk<T>(
  ids: string[],
  handler: (id: string) => Promise<T>,
): Promise<BulkResponseDto<T>> {
  const results: BulkItemResultDto<T>[] = [];
  for (const id of ids) {
    try {
      const data = await handler(id);
      results.push({ id, ok: true, data });
    } catch (exception) {
      results.push({
        id,
        ok: false,
        error: toBulkItemError(exception),
      });
    }
  }
  return {
    results,
    summary: buildBulkSummary(results),
  };
}
