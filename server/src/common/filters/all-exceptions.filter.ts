import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * FIX M10 (production review): there was no global exception filter —
 * anything that wasn't an explicit HttpException fell through to Nest's
 * default handler with no structured logging and no correlation id, making
 * production incidents hard to trace back to a specific request. This
 * catches everything, logs it once with a consistent shape (including the
 * request id from RequestIdMiddleware), and returns a consistent JSON error
 * body without leaking internal error details for unexpected (non-Http)
 * exceptions.
 */

function mapPrismaError(e: unknown): HttpException | null {
  const code = (e as { code?: unknown } | null)?.code;
  switch (code) {
    case 'P2002':
      return new ConflictException(
        'A record with the same unique value already exists.',
      );
    case 'P2003':
      return new ConflictException(
        'This record is referenced by, or references, other data.',
      );
    case 'P2025':
      return new NotFoundException('Record not found.');
    default:
      return null;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(rawException: unknown, host: ArgumentsHost): void {
    const exception = mapPrismaError(rawException) ?? rawException;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const requestId = request.requestId ?? 'unknown';

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const httpResponseBody = isHttpException
      ? exception.getResponse()
      : undefined;

    const message = isHttpException
      ? exception.message
      : 'An unexpected error occurred';

    const logPayload = {
      requestId,
      method: request.method,
      path: request.url,
      status,
      message,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        JSON.stringify(logPayload),
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    const body =
      isHttpException && typeof httpResponseBody === 'object'
        ? { ...httpResponseBody, requestId }
        : {
            statusCode: status,
            message:
              status === HttpStatus.INTERNAL_SERVER_ERROR
                ? 'Internal server error'
                : message,
            requestId,
          };

    response.status(status).json(body);
  }
}
