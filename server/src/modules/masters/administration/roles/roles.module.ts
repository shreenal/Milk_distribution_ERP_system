import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { RolesController } from './roles.controller.js';
import { RolesRepository } from './roles.repository.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [
    RolesService,
    RolesRepository,
  ],
  exports: [
    RolesService,
    RolesRepository,
  ],
})
export class RolesModule {}