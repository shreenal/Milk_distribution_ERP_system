import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  HttpException,
} from '@nestjs/common';

import { OrdersRepository } from './orders.repository.js';
import {
  SaveMorningEntriesDto,
  ExplicitMorningEntry,
} from './dto/save-morning-entries.dto.js';
import {
  SaveNightEntriesDto,
  ExplicitNightEntry,
} from './dto/save-night-entries.dto.js';
import { OrdersBuilder } from './order.builder.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { OrdersValidationService } from './services/orders-validation.service.js';
import {
  OrderPaperStatus,
  Prisma,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from './orders.constants.js';
import { TRANSACTION_CONFIG } from '../../../common/prisma/transaction.constants.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { AddProductDto } from './dto/add-product.dto.js';
import { BillingService } from './services/billing.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';
import { withSerializableRetry } from '../../../common/prisma/with-serializable-retry.js';

const STALE_DATA_MESSAGE =
  'Order data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly ordersBuilder: OrdersBuilder,
    private readonly validationService: OrdersValidationService,
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
    private readonly workflowState: WorkflowStateService,
    private readonly workflowBuilder: WorkflowBuilder,
    private readonly dependencyOrchestrator: DependencyOrchestratorService,
  ) {}

  async getAvailableProducts(category: SupplyCategory) {
    return this.ordersRepository.findAvailableProducts(category);
  }

  private parseExpected(expected: string | null): Date | null {
    if (expected === null) return null;
    const d = new Date(expected);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException('Invalid expectedUpdatedAt');
    return d;
  }

  // Read-only comparison. Does NOT advance the token (used so no-op saves can still 409 when stale).
  private assertTokenMatches(
    current: Date | null,
    expected: string | null,
  ): void {
    const exp = this.parseExpected(expected);
    const same =
      exp === null
        ? current === null
        : current !== null && current.getTime() === exp.getTime();
    if (!same) throw new ConflictException(STALE_DATA_MESSAGE);
  }

  // Atomic compare-and-advance. Only called when data is actually going to change.
  private async touchToken(
    sheetId: number,
    expected: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<Date> {
    const res = await this.ordersRepository.touchOrderItemsIfUnchanged(
      sheetId,
      this.parseExpected(expected),
      tx,
    );
    if (res.count !== 1) throw new ConflictException(STALE_DATA_MESSAGE);
    return res.touchedAt;
  }

  async getSheetService(sheetId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const sheet = await this.ordersRepository.findSheetById(sheetId, tx);
        if (!sheet) throw new NotFoundException(ERROR_MESSAGES.SHEET_NOT_FOUND);

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

        const itemsUpdatedAt = sheet.order_items_updated_at;

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
        return { sheet, workflow, itemsUpdatedAt, ...orderBilling };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
      },
    );
  }

  async getSheetItemsService(sheetId: number) {
    const sheet = await this.ordersRepository.findSheetById(sheetId);
    if (!sheet) throw new NotFoundException(ERROR_MESSAGES.SHEET_NOT_FOUND);
    return this.ordersRepository.getSheetItems(sheetId);
  }

  async addProductToSheet(sheetId: number, dto: AddProductDto) {
    await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const sheet = await this.ordersRepository.findSheetById(sheetId, tx);
          if (!sheet)
            throw new NotFoundException(ERROR_MESSAGES.SHEET_NOT_FOUND);

          if (
            !this.workflowState.canEditNightEntries(sheet.order_paper.status)
          ) {
            throw new BadRequestException(
              'Products can only be added while the paper is in DRAFT',
            );
          }

          // Decision 19: product add participates in the order-items concurrency token.
          await this.touchToken(sheetId, dto.expectedUpdatedAt, tx);

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

          await this.validationService.validateProduct(dto.productId, tx);

          await this.ordersRepository.createSheetProduct(
            { order_sheet_id: sheetId, product_id: dto.productId },
            tx,
          );
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      ),
    );

    // Full sheet response carries the new itemsUpdatedAt.
    return this.getSheetService(sheetId);
  }

  async removeProductFromSheet(
    sheetId: number,
    productId: number,
    expectedUpdatedAt: string | null,
  ) {
    await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const sheet = await this.ordersRepository.findSheetById(sheetId, tx);
          if (!sheet)
            throw new NotFoundException(ERROR_MESSAGES.SHEET_NOT_FOUND);

          if (
            !this.workflowState.canEditNightEntries(sheet.order_paper.status)
          ) {
            throw new BadRequestException(
              'Products can only be removed while the paper is in DRAFT',
            );
          }

          // Decision 19.
          await this.touchToken(sheetId, expectedUpdatedAt, tx);

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

          const link = await this.ordersRepository.deleteSheetProduct(
            sheetId,
            productId,
            tx,
          );
          const lines = await this.ordersRepository.deleteSheetItems(
            sheetId,
            productId,
            tx,
          );
          if (link.count === 0 && lines.count === 0) {
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
    expectedUpdatedAt: string | null,
  ) {
    try {
      const effective = entries.filter(
        (e): e is ExplicitNightEntry =>
          e.orderedQty !== undefined && e.orderedQty !== null,
      );

      this.validationService.validateNoDuplicates(effective);
      for (const e of effective)
        this.validationService.validateOrderedQuantity(Number(e.orderedQty));

      let itemsUpdatedAt = null as string | null;

      await withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const sheet = await this.ordersRepository.findSheetById(
              sheetId,
              tx,
            );
            if (!sheet)
              throw new NotFoundException(ERROR_MESSAGES.SHEET_NOT_FOUND);

            if (
              !this.workflowState.canEditNightEntries(sheet.order_paper.status)
            ) {
              throw new BadRequestException(
                ERROR_MESSAGES.CANNOT_EDIT_NIGHT(sheet.order_paper.status),
              );
            }

            // OD-12.8: token compared first; stale = 409 even for a no-op.
            this.assertTokenMatches(
              sheet.order_items_updated_at,
              expectedUpdatedAt,
            );
            itemsUpdatedAt =
              sheet.order_items_updated_at?.toISOString() ?? null;

            if (effective.length === 0) return;

            // (a) existence only, for every explicit entry
            await this.validationService.validateEntriesBatch(
              effective,
              sheet.group_id,
              tx,
              false,
            );

            const existingItemMap =
              await this.ordersRepository.findSheetItemsByProductBatch(
                sheetId,
                effective.map((e) => ({
                  clientId: e.clientId,
                  productId: e.productId,
                })),
                tx,
              );
            const hasLine = (e: ExplicitNightEntry) =>
              existingItemMap.has(`${e.clientId}_${e.productId}`);

            // (c) new line = no line and qty > 0 -> full live checks
            const newLines = effective.filter(
              (e) => !hasLine(e) && Number(e.orderedQty) > 0,
            );
            if (newLines.length > 0) {
              await this.validationService.validateEntriesBatch(
                newLines,
                sheet.group_id,
                tx,
                true,
              );
            }

            // processed = existing lines (any explicit qty) + new lines. New zeros are no-ops (d).
            const processed = effective.filter(
              (e) => hasLine(e) || Number(e.orderedQty) > 0,
            );
            if (processed.length === 0) return; // true no-op: token unchanged

            await this.validationService.validateProductsOnSheet(
              sheetId,
              processed.map((e) => e.productId),
              tx,
            );

            itemsUpdatedAt = (
              await this.touchToken(sheetId, expectedUpdatedAt, tx)
            ).toISOString();

            const trayRules = await this.billingService.getTrayRulesOnce(tx);
            await this.billingService.saveNightEntriesBatch(
              tx,
              sheet,
              sheetId,
              processed,
              trayRules,
              existingItemMap,
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
        itemsUpdatedAt,
      };
    } catch (error) {
      if (!(error instanceof HttpException)) {
        this.logger.error(
          `Failed to save night entries for sheet ${sheetId}`,
          error,
        );
      }
      throw error;
    }
  }

  async saveMorningEntriesService(
    sheetId: number,
    entries: SaveMorningEntriesDto[],
    expectedUpdatedAt: string | null,
  ) {
    try {
      if (!sheetId || sheetId <= 0) {
        throw new BadRequestException(`Invalid sheet ID: ${sheetId}`);
      }

      const effective = entries.filter(
        (e): e is ExplicitMorningEntry =>
          e.deliveredQty !== undefined && e.deliveredQty !== null,
      );

      this.validationService.validateNoDuplicates(effective);
      for (const e of effective)
        this.validationService.validateDeliveredQuantity(
          Number(e.deliveredQty),
        );

      let itemsUpdatedAt = null as string | null;

      await withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            const sheet = await this.ordersRepository.findSheetById(
              sheetId,
              tx,
            );
            if (!sheet)
              throw new NotFoundException(ERROR_MESSAGES.SHEET_NOT_FOUND);

            const status = sheet.order_paper.status;
            if (!this.workflowState.canEditMorningEntries(status)) {
              throw new BadRequestException(
                ERROR_MESSAGES.CANNOT_EDIT_MORNING(status),
              );
            }

            this.assertTokenMatches(
              sheet.order_items_updated_at,
              expectedUpdatedAt,
            );
            itemsUpdatedAt =
              sheet.order_items_updated_at?.toISOString() ?? null;

            if (effective.length === 0) return;

            await this.validationService.validateEntriesBatch(
              effective,
              sheet.group_id,
              tx,
              false,
            );

            const existingItemMap =
              await this.ordersRepository.findSheetItemsByProductBatch(
                sheetId,
                effective.map((e) => ({
                  clientId: e.clientId,
                  productId: e.productId,
                })),
                tx,
              );
            const hasLine = (e: ExplicitMorningEntry) =>
              existingItemMap.has(`${e.clientId}_${e.productId}`);

            const newLines = effective.filter(
              (e) => !hasLine(e) && Number(e.deliveredQty) > 0,
            );
            const processedCount =
              effective.filter(hasLine).length + newLines.length;
            if (processedCount === 0) return; // true no-op: token unchanged

            if (newLines.length > 0) {
              // OD-7.11
              if (status !== OrderPaperStatus.NIGHT_SUBMITTED) {
                throw new BadRequestException(
                  ERROR_MESSAGES.NEW_LINE_NOT_ALLOWED_WHEN_REOPENED,
                );
              }
              await this.validationService.validateEntriesBatch(
                newLines,
                sheet.group_id,
                tx,
                true,
              );
              await this.validationService.validateProductsOnSheet(
                sheetId,
                newLines.map((e) => e.productId),
                tx,
              );
            }

            itemsUpdatedAt = (
              await this.touchToken(sheetId, expectedUpdatedAt, tx)
            ).toISOString();

            await this.billingService.saveMorningEntriesBatch(
              tx,
              sheet,
              sheetId,
              effective,
              existingItemMap,
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
        itemsUpdatedAt,
      };
    } catch (error) {
      if (!(error instanceof HttpException)) {
        this.logger.error(
          `Failed to save morning entries for sheet ${sheetId}`,
          error,
        );
      }
      throw error;
    }
  }
}
