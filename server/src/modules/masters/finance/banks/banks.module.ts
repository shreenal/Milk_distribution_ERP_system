import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { BanksController } from './banks.controller.js';
import { BanksService } from './banks.service.js';
import { BanksRepository } from './banks.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [BanksController],
  providers: [BanksService, BanksRepository],
  exports: [BanksService],
})
export class BanksModule {}