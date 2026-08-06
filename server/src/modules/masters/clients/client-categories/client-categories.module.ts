import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../prisma/prisma.module.js';

import { ClientsModule } from '../clients/clients.module.js';

import { ClientCategoriesController } from './client-categories.controller.js';
import { ClientCategoriesRepository } from './client-categories.repository.js';
import { ClientCategoriesService } from './client-categories.service.js';

@Module({
  imports: [PrismaModule, ClientsModule],
  controllers: [ClientCategoriesController],
  providers: [ClientCategoriesService, ClientCategoriesRepository],
  exports: [ClientCategoriesService, ClientCategoriesRepository],
})
export class ClientCategoriesModule {}
