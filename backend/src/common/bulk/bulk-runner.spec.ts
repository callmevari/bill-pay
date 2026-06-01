import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { ErrorCode } from '../errors/error-codes';
import { runBulk, toBulkItemError } from './bulk-runner';

describe('runBulk', () => {
  it('returns an ok entry per resolved handler and a summary that counts succeeded vs failed', async () => {
    const ids = ['a', 'b', 'c'];
    const handler = jest.fn((id: string) =>
      Promise.resolve({ value: id.toUpperCase() }),
    );

    const result = await runBulk(ids, handler);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(result.results).toEqual([
      { id: 'a', ok: true, data: { value: 'A' } },
      { id: 'b', ok: true, data: { value: 'B' } },
      { id: 'c', ok: true, data: { value: 'C' } },
    ]);
    expect(result.summary).toEqual({ total: 3, succeeded: 3, failed: 0 });
  });

  it('catches per-item exceptions and translates them into the documented error envelope without aborting later items', async () => {
    const handler = jest.fn((id: string): Promise<{ id: string }> => {
      if (id === 'b') {
        return Promise.reject(
          new ConflictException({
            code: ErrorCode.BILL_INVALID_TRANSITION,
            message: 'Cannot transition bill from PAID to APPROVED.',
            details: { from: 'PAID', to: 'APPROVED' },
          }),
        );
      }
      if (id === 'c') {
        return Promise.reject(
          new NotFoundException({
            code: ErrorCode.NOT_FOUND,
            message: 'Bill not found.',
          }),
        );
      }
      return Promise.resolve({ id });
    });

    const result = await runBulk(['a', 'b', 'c', 'd'], handler);

    expect(handler).toHaveBeenCalledTimes(4);
    expect(result.results[0]).toEqual({ id: 'a', ok: true, data: { id: 'a' } });
    expect(result.results[1]).toEqual({
      id: 'b',
      ok: false,
      error: {
        code: ErrorCode.BILL_INVALID_TRANSITION,
        message: 'Cannot transition bill from PAID to APPROVED.',
        details: { from: 'PAID', to: 'APPROVED' },
      },
    });
    expect(result.results[2]).toEqual({
      id: 'c',
      ok: false,
      error: { code: ErrorCode.NOT_FOUND, message: 'Bill not found.' },
    });
    expect(result.results[3]).toEqual({ id: 'd', ok: true, data: { id: 'd' } });
    expect(result.summary).toEqual({ total: 4, succeeded: 2, failed: 2 });
  });
});

describe('toBulkItemError', () => {
  it('maps a string-bodied HttpException to the default code for its status', () => {
    expect(
      toBulkItemError(new BadRequestException('amount must be positive')),
    ).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'amount must be positive',
    });
    expect(toBulkItemError(new NotFoundException('bill missing'))).toEqual({
      code: ErrorCode.NOT_FOUND,
      message: 'bill missing',
    });
  });

  it('preserves the code + message + details when the HttpException carries the documented shape', () => {
    const exception = new ConflictException({
      code: ErrorCode.BILL_NOT_EDITABLE,
      message: 'Bill in PAID cannot be edited.',
      details: { status: 'PAID' },
    });
    expect(toBulkItemError(exception)).toEqual({
      code: ErrorCode.BILL_NOT_EDITABLE,
      message: 'Bill in PAID cannot be edited.',
      details: { status: 'PAID' },
    });
  });

  it('falls back to INTERNAL_ERROR with the error message for non-HttpException throwables', () => {
    const error = toBulkItemError(new Error('boom'));
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.message).toBe('boom');
  });
});
