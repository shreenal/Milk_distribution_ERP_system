import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  ThrottlerGuard,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';

import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const h: string | undefined = req.headers?.authorization;
    if (h?.startsWith('Bearer ')) {
      try {
        const p = this.jwt.verify<{ sub?: number }>(h.slice(7));
        if (p?.sub) return `user:${p.sub}`;
      } catch {
        /* fall through */
      }
    }
    return req.ip; // login/refresh stay per-IP
  }
}
