import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { DairiesController } from './dairies.controller.js';
import { DairiesService } from './dairies.service.js';
import { DairiesRepository } from './dairies.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [DairiesController],
  providers: [DairiesService, DairiesRepository],
  exports: [DairiesService, DairiesRepository],
})
export class DairiesModule {}
