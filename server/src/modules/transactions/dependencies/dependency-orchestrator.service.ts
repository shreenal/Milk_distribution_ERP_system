import { Injectable } from '@nestjs/common';

import {
  BusinessDependency,
  DEPENDENCY_TYPES,
  DEPENDENCY_SCOPES,
  DependencyModule,
  DependencyTrigger,
  DEPENDENCY_IDS,
} from '../dependencies/dependency.constant.js';

import { ClientTraysPropagationService } from '../client-trays/services/client-trays-propagation.service.js';
import { DairyTraysPropagationService } from '../dairy-trays/services/dairy-trays-propagation.service.js';
import { DistributorTransferPropagationService } from '../distributor-transfer/services/distributor-transfer-propagation.service.js';

import { Prisma } from '../../../generated/prisma/client.js';
import { BUSINESS_DEPENDENCY_REGISTER } from './dependency-register.js';

export interface DependencyExecutionContext {
  paperId: number;
  sheetId?: number;
  tx: Prisma.TransactionClient;
}

@Injectable()
export class DependencyOrchestratorService {
  constructor(
    private readonly clientTraysPropagationService: ClientTraysPropagationService,
    private readonly dairyTraysPropagationService: DairyTraysPropagationService,
    private readonly distributorTransferPropagationService: DistributorTransferPropagationService,
  ) {}

  async execute(
    source: DependencyModule,
    trigger: DependencyTrigger,
    context: DependencyExecutionContext,
  ): Promise<void> {
    const dependencies = BUSINESS_DEPENDENCY_REGISTER.filter(
      (dependency) =>
        dependency.source === source &&
        dependency.trigger === trigger &&
        dependency.type === DEPENDENCY_TYPES.PROPAGATION,
    );

    for (const dependency of dependencies) {
      await this.executeDependency(dependency, context);
    }
  }

  private async executeDependency(
    dependency: BusinessDependency,
    context: DependencyExecutionContext,
  ): Promise<void> {
    switch (dependency.id) {
      case DEPENDENCY_IDS.ORDERS_TO_CLIENT_TRAYS_PROPAGATION:
        await this.executeOrdersToClientTrays(dependency, context);
        break;

      case DEPENDENCY_IDS.PURCHASE_TO_DAIRY_TRAYS_PROPAGATION:
        await this.executePurchaseToDairyTrays(dependency, context);
        break;

      case DEPENDENCY_IDS.PAPER_TO_CLIENT_TRAYS_PROPAGATION:
        await this.executePaperToClientTrays(dependency, context);
        break;

      case DEPENDENCY_IDS.PAPER_TO_DAIRY_TRAYS_PROPAGATION:
        await this.executePaperToDairyTrays(dependency, context);
        break;

      case DEPENDENCY_IDS.PAPER_TO_DISTRIBUTOR_TRANSFER_PROPAGATION:
        await this.executePaperToDistributorTransfer(dependency, context);
        break;

      default:
        throw new Error(
          `No propagation handler registered for dependency ${dependency.id}`,
        );
    }
  }

  private async executeOrdersToClientTrays(
    dependency: BusinessDependency,
    context: DependencyExecutionContext,
  ): Promise<void> {
    if (dependency.scope !== DEPENDENCY_SCOPES.CURRENT) {
      throw new Error(`Invalid scope for ${dependency.id}: expected CURRENT`);
    }

    if (context.sheetId === undefined) {
      throw new Error(
        'sheetId is required for Orders → Client Trays propagation',
      );
    }
    // Internal Client Trays recalculation.
    // This is not an inter-module dependency because the changed
    // data and the derived state both belong to Client Trays.
    await this.clientTraysPropagationService.recalculateFromSheet(
      context.sheetId,
      context.tx,
    );
  }

  private async executePurchaseToDairyTrays(
    dependency: BusinessDependency,
    context: DependencyExecutionContext,
  ): Promise<void> {
    if (dependency.scope !== DEPENDENCY_SCOPES.CURRENT) {
      throw new Error(`Invalid scope for ${dependency.id}: expected CURRENT`);
    }

    await this.dairyTraysPropagationService.recalculateCurrentPaper(
      context.paperId,
      context.tx,
    );
  }

  private async executePaperToClientTrays(
    dependency: BusinessDependency,
    context: DependencyExecutionContext,
  ): Promise<void> {
    if (dependency.scope !== DEPENDENCY_SCOPES.FORWARD) {
      throw new Error(`Invalid scope for ${dependency.id}: expected FORWARD`);
    }

    await this.clientTraysPropagationService.propagateFromPaper(
      context.paperId,
      context.tx,
    );
  }

  private async executePaperToDairyTrays(
    dependency: BusinessDependency,
    context: DependencyExecutionContext,
  ): Promise<void> {
    if (dependency.scope !== DEPENDENCY_SCOPES.FORWARD) {
      throw new Error(`Invalid scope for ${dependency.id}: expected FORWARD`);
    }

    await this.dairyTraysPropagationService.propagateFromPaper(
      context.paperId,
      context.tx,
    );
  }

  private async executePaperToDistributorTransfer(
    dependency: BusinessDependency,
    context: DependencyExecutionContext,
  ): Promise<void> {
    await this.distributorTransferPropagationService.propagate(
      context.paperId,
      context.tx,
    );
  }
}
