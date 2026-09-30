import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PropagationQueueService } from './propagation-queue.service.js';
import { PropagationQueueProcessor } from './propagation-queue.processor.js';
import { PropagationOutboxRepository } from './propagation-outbox.repository.js';
import { PropagationOutboxRelayService } from './propagation-outbox.relay.service.js';
import { PROPAGATION_QUEUE } from './propagation-queue.constants.js';
import { ClientTraysModule } from '../client-trays/client-trays.module.js';
import { DairyTraysModule } from '../dairy-trays/dairy-trays.module.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';

@Module({
  imports: [
    // FIX C3 (production review): backs PropagationOutboxRelayService's
    // @Interval polling. Requires the `@nestjs/schedule` package.
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          tls: config.get<boolean>('REDIS_TLS') ? {} : undefined,
        },
      }),
    }),
    BullModule.registerQueue({ name: PROPAGATION_QUEUE }),
    ClientTraysModule,
    DairyTraysModule,
    PrismaModule,
  ],
  providers: [
    PropagationQueueService,
    PropagationQueueProcessor,
    PropagationOutboxRepository,
    PropagationOutboxRelayService,
  ],
  exports: [PropagationQueueService, PropagationOutboxRepository],
})
export class PropagationQueueModule {}
