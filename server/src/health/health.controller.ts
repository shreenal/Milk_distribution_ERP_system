import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const [dbOk, redisOk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    if (!dbOk) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'down',
        redis: redisOk ? 'up' : 'down',
      });
    }

    return {
      status: 'ready',
      database: 'up',
      redis: redisOk ? 'up' : 'degraded',
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      tls: this.config.get<boolean>('REDIS_TLS') ? {} : undefined,
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 0,
    });
    try {
      await client.connect();
      await client.ping();
      return true;
    } catch {
      return false;
    } finally {
      client.disconnect();
    }
  }
}
