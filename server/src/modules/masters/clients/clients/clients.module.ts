import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { DistributorModule } from '../../distribution/distributors/distributor.module.js';
import { GroupsModule } from '../groups/groups.module.js';

import { ClientsController } from './clients.controller.js';
import { ClientsRepository } from './clients.repository.js';
import { ClientsService } from './clients.service.js';

@Module({
  imports: [PrismaModule, GroupsModule, DistributorModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientsRepository],
  exports: [ClientsService, ClientsRepository],
})
export class ClientsModule {}
