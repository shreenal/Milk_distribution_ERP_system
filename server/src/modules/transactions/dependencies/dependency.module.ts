import { Module } from '@nestjs/common';

import { DependencyOrchestratorService } from './dependency-orchestrator.service.js';

import { ClientTraysModule } from '../client-trays/client-trays.module.js';
import { DairyTraysModule } from '../dairy-trays/dairy-trays.module.js';
import { DistributorTransferModule } from '../distributor-transfer/distributor-transfer.module.js';

@Module({
  imports: [ClientTraysModule, DairyTraysModule, DistributorTransferModule],
  providers: [DependencyOrchestratorService],
  exports: [DependencyOrchestratorService],
})
export class DependencyModule {}
