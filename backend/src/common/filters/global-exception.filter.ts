import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

import { ErrorCode } from '../errors/error-codes';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface ResolvedError {
  status: number;
  body: ErrorEnvelope;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(exception);
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnownError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
        },
      },
    };
  }

  private fromHttpException(exception: HttpException): ResolvedError {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        status,
        body: {
          error: {
            code: this.defaultCodeForStatus(status),
            message: response,
          },
        },
      };
    }

    const responseObject = response as {
      message?: unknown;
      error?: unknown;
      code?: unknown;
      details?: unknown;
    };

    const code =
      typeof responseObject.code === 'string'
        ? responseObject.code
        : this.defaultCodeForStatus(status);

    const messageSource = responseObject.message ?? responseObject.error;
    const message = Array.isArray(messageSource)
      ? messageSource.join(', ')
      : typeof messageSource === 'string'
        ? messageSource
        : exception.message;

    const details =
      responseObject.details ??
      (Array.isArray(responseObject.message)
        ? { messages: responseObject.message }
        : undefined);

    return {
      status,
      body: {
        error: {
          code,
          message,
          ...(details !== undefined ? { details } : {}),
        },
      },
    };
  }

  private fromPrismaKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): ResolvedError {
    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Resource not found.',
          },
        },
      };
    }

    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          error: {
            code: ErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
            message: 'A record with the same unique field already exists.',
            details: { target: exception.meta?.target },
          },
        },
      };
    }

    if (exception.code === 'P2003') {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          error: {
            code: ErrorCode.FOREIGN_KEY_VIOLATION,
            message: 'Operation violates a foreign key constraint.',
            details: { field: exception.meta?.field_name },
          },
        },
      };
    }

    this.logger.error(exception);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'A database error occurred.',
        },
      },
    };
  }

  private defaultCodeForStatus(status: number): string {
    if (status === 400) {
      return ErrorCode.VALIDATION_ERROR;
    }
    if (status === 401) {
      return ErrorCode.UNAUTHENTICATED;
    }
    if (status === 403) {
      return ErrorCode.INSUFFICIENT_PERMISSIONS;
    }
    if (status === 404) {
      return ErrorCode.NOT_FOUND;
    }
    return `HTTP_${status}`;
  }
}
