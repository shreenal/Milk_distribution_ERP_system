import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
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
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
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
