import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

// Global prefix ('api', see main.ts) + AuthController path ('auth'). Scoping the
// cookie to this path keeps it off every other request.
const REFRESH_COOKIE_PATH = '/api/auth';

type SameSite = 'lax' | 'strict' | 'none';

/**
 * The refresh token lives only in an httpOnly cookie, so page scripts (and
 * therefore XSS) can never read it. Because browsers attach cookies
 * automatically, the endpoints that consume it also verify the Origin header
 * (CSRF defence on top of SameSite).
 */
@Injectable()
export class AuthCookieService {
  private readonly allowedOrigins: Set<string>;

  constructor(private readonly config: ConfigService) {
    this.allowedOrigins = new Set(
      this.config
        .get<string>('CORS_ORIGINS', '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  set(res: Response, refreshToken: string): void {
    const ttlDays = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 7);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.baseOptions(),
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
    });
  }

  clear(res: Response): void {
    // Attributes must match those used to set the cookie or browsers ignore it.
    res.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions());
  }

  read(req: Request): string | undefined {
    const header = req.headers.cookie;

    if (!header) {
      return undefined;
    }

    for (const part of header.split(';')) {
      const separator = part.indexOf('=');

      if (
        separator !== -1 &&
        part.slice(0, separator).trim() === REFRESH_COOKIE_NAME
      ) {
        return part.slice(separator + 1).trim() || undefined;
      }
    }

    return undefined;
  }

  /**
   * Browsers always send Origin on cross-site POSTs. A missing header means a
   * non-browser client, which cannot be a CSRF victim, so it is allowed.
   */
  assertTrustedOrigin(req: Request): void {
    const origin = req.headers.origin;

    if (origin !== undefined && !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException('Untrusted origin');
    }
  }

  private baseOptions(): CookieOptions {
    const sameSite = this.config.get<SameSite>(
      'REFRESH_COOKIE_SAMESITE',
      'lax',
    );

    return {
      httpOnly: true,
      // Browsers reject SameSite=None cookies that are not Secure.
      secure:
        sameSite === 'none'
          ? true
          : this.config.get<boolean>('REFRESH_COOKIE_SECURE', false),
      sameSite,
      path: REFRESH_COOKIE_PATH,
    };
  }
}
