import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { ExpenseTypesController } from './expense-types.controller.js';
import { ExpenseTypesService } from './expense-types.service.js';
import { ExpenseTypesRepository } from './expense-types.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [ExpenseTypesController],
  providers: [ExpenseTypesService, ExpenseTypesRepository],
  exports: [ExpenseTypesService],
})
export class ExpenseTypesModule {}