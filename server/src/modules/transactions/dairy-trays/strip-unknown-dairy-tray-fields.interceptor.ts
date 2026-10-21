import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

const REQUEST_KEYS = ['entries', 'expectedUpdatedAt'];
const ENTRY_KEYS = ['vehicleId', 'trayTypeId', 'deliverySession', 'returned'];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pick = (source: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(
    keys.filter((k) => k in source).map((k) => [k, source[k]]),
  );

/**
 * DT-4.5: unknown properties on the dairy tray save request are dropped
 * instead of failing the request (same behavior as Client Trays CT-4.5).
 *
 * The app-wide ValidationPipe uses forbidNonWhitelisted, and a global pipe
 * cannot be relaxed for one route. This interceptor runs BEFORE pipes, so it
 * removes the unknown keys first and leaves every other route untouched.
 * Client Trays has its own copy because its entry keys differ.
 */
@Injectable()
export class StripUnknownDairyTrayFieldsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();

    if (isPlainObject(request.body)) {
      const body = pick(request.body, REQUEST_KEYS);

      if (Array.isArray(body.entries)) {
        body.entries = body.entries.map((entry: unknown) =>
          isPlainObject(entry) ? pick(entry, ENTRY_KEYS) : entry,
        );
      }

      request.body = body;
    }

    return next.handle();
  }
}
