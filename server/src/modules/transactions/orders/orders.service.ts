import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { OrdersRepository } from './orders.repository.js';

import { SaveMorningEntriesDto } from './dto/save-morning-entries.dto.js';

import { SaveNightEntriesDto } from './dto/save-night-entries.dto.js';

import { OrdersBuilder } from './order.builder.js';

import { WorkflowBuilder } from '../workflow/workflow.builder.js';

import { OrdersValidationService } from './services/orders-validation.service.js';

import {
  OrderPaperStatus,
  SupplyCategory,
} from '../../../generated/prisma/client.js';

import { ERROR_MESSAGES, SUCCESS_MESSAGES } from './orders.constants.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';

import { PrismaService } from '../../../prisma/prisma.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { AddProductDto } from './dto/add-product.dto.js';
import { OrderCommercialService } from './services/order-commercial.service.js';
import { BillingService } from './services/billing.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,

    private readonly ordersBuilder: OrdersBuilder,

    private readonly validationService: OrdersValidationService,

    private readonly orderCommercialService: OrderCommercialService,

    private readonly billingService: BillingService,

    private readonly prisma: PrismaService,

    private readonly workflowState: WorkflowStateService,

    private readonly workflowBuilder: WorkflowBuilder,

    private readonly dependencyOrchestrator: DependencyOrchestratorService,
  ) { }

  async getAvailableProducts(category: SupplyCategory) {
    return this.ordersRepository.findAvailableProducts(category);
  }

  async getSheetService(sheetId: number) {
    return this.prisma.$transaction(async (tx) => {
      const sheet = await this.ordersRepository.findSheetById(sheetId, tx);
      if (!sheet) throw new BadRequestException(ERROR_MESSAGES.SHEET_NOT_FOUND);

      const [
        milkProducts,
        nonMilkProducts,
        milkClients,
        nonMilkClients,
        sheetItems,
      ] = await Promise.all([
        this.ordersRepository.getProductsForSheet(
          sheetId,
          SupplyCategory.MILK,
          tx,
        ),
        this.ordersRepository.getProductsForSheet(
          sheetId,
          SupplyCategory.NON_MILK,
          tx,
        ),
        this.ordersRepository.getClientsForSheetDisplay(
          sheet.id,
          sheet.group_id,
          SupplyCategory.MILK,
          tx,
        ),
        this.ordersRepository.getClientsForSheetDisplay(
          sheet.id,
          sheet.group_id,
          SupplyCategory.NON_MILK,
          tx,
        ),
        this.ordersRepository.getSheetItems(sheet.id, tx),
      ]);
      const workflow = this.workflowBuilder.buildOrdersWorkflow(
        sheet.order_paper.status,
      );

      const morningEntrySaved =
        sheet.order_paper.status === OrderPaperStatus.NIGHT_SUBMITTED &&
        sheet.order_morning_entry_saved_at !== null;

      const orderBilling = this.ordersBuilder.buildOrderBillingSection(
        {
          milkProducts,
          nonMilkProducts,
          milkClients,
          nonMilkClients,
          sheetItems,
        },
        sheet.order_paper.status,
        morningEntrySaved,
      );
      return {
        sheet,

        workflow,

        ...orderBilling,
      };
    });
  }

  async getSheetItemsService(sheetId: number) {
    try {
      if (!sheetId || sheetId <= 0) {
        throw new BadRequestException(ERROR_MESSAGES.INVALID_SHEET_ID);
      }

      return await this.ordersRepository.getSheetItems(sheetId);
    } catch (error) {
      this.logger.error(ERROR_MESSAGES.SHEET_NOT_FOUND, error);

      throw error;
    }
  }

  async addProductToSheet(sheetId: number, dto: AddProductDto) {
    if (!sheetId || sheetId <= 0) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_SHEET_ID);
    }

    await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const sheet = await this.ordersRepository.findSheetById(sheetId, tx);
          if (!sheet)
            throw new BadRequestException(ERROR_MESSAGES.SHEET_NOT_FOUND);

          if (
            !this.workflowState.canEditNightEntries(sheet.order_paper.status)
          ) {
            throw new BadRequestException(
              'Products can only be added while the paper is in DRAFT',
            );
          }

          const existingLink = await this.ordersRepository.getSheetProductLink(
            sheetId,
            dto.productId,
            tx,
          );
          if (existingLink) {
            throw new BadRequestException(
              'Product already exists in this sheet',
            );
          }

          const supplyRules = await this.ordersRepository.getGroupSupplyRules(
            sheet.group_id,
            tx,
          );

          await this.validationService.validateProduct(dto.productId, tx);
          // Resolve commercial context exactly once, at deliberate add-time —
          // this is now the *only* place product_link_id gets fixed for an
          // explicitly-added product.
          const commercialContext = await this.orderCommercialService.resolve(
            sheet.group_id,
            dto.productId,
            supplyRules,
            tx,
          );

          await this.ordersRepository.createSheetProduct(
            {
              order_sheet_id: sheetId,
              product_id: dto.productId,
              product_link_id: commercialContext.productLinkId,
              resolvedViaFallback: commercialContext.resolvedViaFallback,
            },
            tx,
          );
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );

    return this.getSheetService(sheetId);
  }

  async removeProductFromSheet(sheetId: number, productId: number) {
    if (!sheetId || sheetId <= 0) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_SHEET_ID);
    }

    await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const sheet = await this.ordersRepository.findSheetById(sheetId, tx);
          if (!sheet)
            throw new BadRequestException(ERROR_MESSAGES.SHEET_NOT_FOUND);

          if (
            !this.workflowState.canEditNightEntries(sheet.order_paper.status)
          ) {
            throw new BadRequestException(
              'Products can only be removed while the paper is in DRAFT',
            );
          }

          const product = await this.ordersRepository.getProductWithGroup(
            productId,
            tx,
          );
          if (product.show_by_default) {
            throw new BadRequestException('Default products cannot be removed');
          }

          const hasRealOrders = await tx.order_sheet_items.findFirst({
            where: {
              order_sheet_id: sheetId,
              product_id: productId,
              ordered_qty: { gt: 0 },
            },
            select: { id: true },
          });

          if (hasRealOrders) {
            throw new BadRequestException(
              'Cannot remove a product that already has ordered quantities. Set quantities to 0 first.',
            );
          }

          const result = await this.ordersRepository.deleteSheetProduct(
            sheetId,
            productId,
            tx,
          );

          if (result.count === 0) {
            throw new BadRequestException('Product not found in this sheet');
          }

          await this.ordersRepository.deleteSheetItems(sheetId, productId, tx);
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );

    return this.getSheetService(sheetId);
  }

  async saveNightEntriesService(
    sheetId: number,
    entries: SaveNightEntriesDto[],
  ) {
    try {
      if (!sheetId || sheetId <= 0) {
        throw new BadRequestException(`Invalid sheet ID: ${sheetId}`);
      }

      this.validationService.validateNoDuplicates(entries);

      await withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const sheet = await this.ordersRepository.findSheetById(
              sheetId,
              tx,
            );

            if (!sheet) {
              throw new BadRequestException(
                `Sheet with ID ${sheetId} not found`,
              );
            }

            if (
              !this.workflowState.canEditNightEntries(sheet.order_paper.status)
            ) {
              throw new BadRequestException(
                ERROR_MESSAGES.CANNOT_EDIT_NIGHT(sheet.order_paper.status),
              );
            }

            const supplyRules = await this.ordersRepository.getGroupSupplyRules(
              sheet.group_id,
              tx,
            );

            const productMap = await this.validationService.validateEntriesBatch(
              entries,
              sheet.group_id,
              tx,
            );

            const trayRules = await this.billingService.getTrayRulesOnce(tx);

            for (const entry of entries) {
              if (entry.orderedQty === undefined || entry.orderedQty === null) {
                throw new BadRequestException(
                  ERROR_MESSAGES.MISSING_REQUIRED_FIELD('orderedQty'),
                );
              }
              const product = productMap.get(entry.productId);

              if (!product) {
                throw new BadRequestException(
                  ERROR_MESSAGES.PRODUCT_NOT_FOUND(entry.productId),
                );
              }

              this.validationService.validateOrderedQuantity(
                Number(entry.orderedQty),
                product,
                trayRules,
              );
            }

            await this.billingService.saveNightEntriesBatch(
              tx,
              sheet,
              supplyRules,
              sheetId,
              entries,
              trayRules,
            );
            await this.dependencyOrchestrator.execute(
              DEPENDENCY_MODULES.ORDERS,
              DEPENDENCY_TRIGGERS.ON_SAVE,
              {
                paperId: sheet.order_paper_id,
                sheetId,
                paperStatus: sheet.order_paper.status,
                tx,
              },
            );
          },
          {
            timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
            isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
          },
        ),
      );

      return {
        success: true,

        message: SUCCESS_MESSAGES.NIGHT_ENTRIES_SAVED,
      };
    } catch (error) {
      this.logger.error(
        `Failed to save night entries for sheet ${sheetId}`,
        error,
      );

      throw error;
    }
  }

  async saveMorningEntriesService(
    sheetId: number,
    entries: SaveMorningEntriesDto[],
  ) {
    try {
      if (!sheetId || sheetId <= 0) {
        throw new BadRequestException(`Invalid sheet ID: ${sheetId}`);
      }

      this.validationService.validateNoDuplicates(entries);

      await withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const sheet = await this.ordersRepository.findSheetById(
              sheetId,
              tx,
            );

            if (!sheet) {
              throw new BadRequestException(
                `Sheet with ID ${sheetId} not found`,
              );
            }

            const status = sheet.order_paper.status;

            if (!this.workflowState.canEditMorningEntries(status)) {
              throw new BadRequestException(
                ERROR_MESSAGES.CANNOT_EDIT_MORNING(status),
              );
            }

            await this.validationService.validateEntriesBatch(
              entries,
              sheet.group_id,
              tx,
            );

            const existingItemMap =
              await this.ordersRepository.findSheetItemsByProductBatch(
                sheetId,
                entries.map((entry) => ({
                  clientId: entry.clientId,
                  productId: entry.productId,
                })),
                tx,
              );

            for (const entry of entries) {
              if (
                entry.deliveredQty === undefined ||
                entry.deliveredQty === null
              ) {
                throw new BadRequestException(
                  ERROR_MESSAGES.MISSING_REQUIRED_FIELD('deliveredQty'),
                );
              }

              const existingItem = existingItemMap.get(
                `${entry.clientId}_${entry.productId}`,
              );

              const deliveredQty = Number(entry.deliveredQty);

              if (!existingItem) {
                if (deliveredQty === 0) {
                  continue;
                }

                throw new BadRequestException(
                  ERROR_MESSAGES.NO_ORDERED_QUANTITY(
                    entry.clientId,
                    entry.productId,
                  ),
                );
              }

              this.validationService.validateDeliveredQuantity(
                deliveredQty,
                existingItem,
              );
            }

            await this.billingService.saveMorningEntriesBatch(
              tx,
              sheet,
              sheetId,
              entries,
            );

            await this.ordersRepository.markOrderMorningEntrySaved(sheetId, tx);

            await this.dependencyOrchestrator.execute(
              DEPENDENCY_MODULES.ORDERS,
              DEPENDENCY_TRIGGERS.ON_SAVE,
              {
                paperId: sheet.order_paper_id,
                sheetId,
                paperStatus: status,
                tx,
              },
            );
          },
          {
            timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
            isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
          },
        ),
      );

      return {
        success: true,

        message: SUCCESS_MESSAGES.MORNING_ENTRIES_SAVED,
      };
    } catch (error) {
      this.logger.error(
        `Failed to save morning entries for sheet ${sheetId}`,
        error,
      );

      throw error;
    }
  }
}
