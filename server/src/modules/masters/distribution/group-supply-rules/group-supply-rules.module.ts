import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { DistributorModule } from '../distributors/distributor.module.js';
import { GroupsModule } from '../../clients/groups/groups.module.js';

import { GroupSupplyRulesController } from './group-supply-rules.controller.js';
import { GroupSupplyRulesRepository } from './group-supply-rules.repository.js';
import { GroupSupplyRulesService } from './group-supply-rules.service.js';

@Module({
  imports: [PrismaModule, GroupsModule, DistributorModule],
  controllers: [GroupSupplyRulesController],
  providers: [GroupSupplyRulesService, GroupSupplyRulesRepository],
  exports: [GroupSupplyRulesService, GroupSupplyRulesRepository],
})
export class GroupSupplyRulesModule {}
