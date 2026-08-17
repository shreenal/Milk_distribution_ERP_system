import { Module } from '@nestjs/common';

import { ClientStatementController } from './client-statement.controller.js';
import { ClientStatementRepository } from './client-statement.repository.js';
import { ClientStatementService } from './client-statement.service.js';

@Module({
  controllers: [ClientStatementController],

  providers: [ClientStatementService, ClientStatementRepository],
})
export class ClientStatementModule {}
