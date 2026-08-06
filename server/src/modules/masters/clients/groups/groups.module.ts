import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { VehiclesModule } from '../../fleet/vehicles/vehicles.module.js';

import { GroupsController } from './groups.controller.js';
import { GroupsRepository } from './groups.repository.js';
import { GroupsService } from './groups.service.js';

@Module({
  imports: [PrismaModule, VehiclesModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsRepository],
  exports: [GroupsService, GroupsRepository],
})
export class GroupsModule {}
