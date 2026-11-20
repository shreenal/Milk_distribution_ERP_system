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

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as { authorization?: string } | undefined;

    const authorization = headers?.authorization;

    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<{ sub?: number }>(
          authorization.slice(7),
        );

        if (payload?.sub) {
          return Promise.resolve(`user:${payload.sub}`);
        }
      } catch {
        // Fall through to IP-based tracking.
      }
    }

    const ip = req.ip;
    return Promise.resolve(typeof ip === 'string' ? ip : 'unknown');
  }
}
