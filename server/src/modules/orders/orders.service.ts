import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { OrdersRepository } from './orders.repository.js';

import { SaveMorningEntriesDto } from './dto/save-morning-entries.dto.js';

import { SaveNightEntriesDto } from './dto/save-night-entries.dto.js';

import { OrdersBillingBuilder } from './order.billing-builder.js';

import { TraysService } from '../trays/trays.service.js';

import { OrdersValidationService } from './orders-validation.service.js';

import {
  TRANSACTION_CONFIG,
  ERROR_MESSAGES,
  QUANTITY_PRECISION,
  SUCCESS_MESSAGES,
} from './orders.constants.js';

import { PrismaService } from '../../prisma/prisma.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { CollectionsService } from '../collections/collections.service.js';

/**
 * REFACTORING IN PROGRESS: Paper Module Extraction
 *
 * This service historically contained paper workflow operations.
 *
 * EXTRACTED TO PaperService (see src/paper/paper.service.ts):
 * - submitNightEntryService()     → PaperService.submitNightEntryService()
 * - submitMorningEntryService()   → PaperService.submitMorningEntryService()
 * - finalizePaperService()        → PaperService.finalizePaperService()
 * - reopenPaperService()          → PaperService.reopenPaperService()
 *
 * This class now focuses on:
 * - Order entry (saveNightEntriesService, saveMorningEntriesService)
 * - Sheet retrieval (getSheetService, getSheetItemsService)
 * - Paper generation (generateOrderPaperService, getTodayPaperService)
 *
 * Paper workflow logic has been moved to a dedicated Paper module
 * for better separation of concerns and maintainability.
 *
 * Status: Phase 2 (Parallel Implementation) - Paper module is production-ready
 * Timeline: Methods deleted [DATE], Orders endpoints will be removed in v2.0
 *
 * @deprecated Do not add new paper workflow methods here
 * @see PaperService
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,

    private readonly ordersBillingBuilder: OrdersBillingBuilder,

    private readonly validationService: OrdersValidationService,

    private readonly traysService: TraysService,

    private readonly prisma: PrismaService,

    private readonly collectionsService: CollectionsService,

    private readonly workflowState: WorkflowStateService,
  ) {}

  async getSheetService(sheetId: number) {
    try {
      if (!sheetId || sheetId <= 0) {
        throw new BadRequestException(ERROR_MESSAGES.INVALID_SHEET_ID);
      }

      const sheet = await this.ordersRepository.findSheetById(sheetId);

      if (!sheet) {
        throw new BadRequestException(ERROR_MESSAGES.SHEET_NOT_FOUND);
      }

      const orderBilling =
        await this.ordersBillingBuilder.buildOrderBillingSection(sheet);

      const traySheet = await this.traysService.getTraySheetService(sheetId);

      const collectionGrid =
        await this.collectionsService.getCollectionGrid(sheetId);

      return {
        sheet,

        workflow: {
          status: sheet.order_paper.status,

          isNightEditable: this.workflowState.canEditNightEntries(
            sheet.order_paper.status,
          ),

          isMorningEditable: this.workflowState.canEditMorningEntries(
            sheet.order_paper.status,
          ),
        },

        milkGrid: orderBilling.milkGrid,

        nonMilkGrid: orderBilling.nonMilkGrid,

        trayBilling: traySheet.trayBilling,

        collectionBilling: collectionGrid,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch sheet ${sheetId}`, error);

      throw error;
    }
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

  async saveNightEntriesService(
    sheetId: number,
    entries: SaveNightEntriesDto[],
  ) {
    try {
      if (!sheetId || sheetId <= 0) {
        throw new BadRequestException(`Invalid sheet ID: ${sheetId}`);
      }

      const sheet = await this.ordersRepository.findSheetById(sheetId);

      if (!sheet) {
        throw new BadRequestException(`Sheet with ID ${sheetId} not found`);
      }

      if (!this.workflowState.canEditNightEntries(sheet.order_paper.status)) {
        throw new BadRequestException(
          ERROR_MESSAGES.CANNOT_EDIT_NIGHT(sheet.order_paper.status),
        );
      }

      this.validationService.validateNoDuplicates(entries);

      await this.prisma.$transaction(
        async (tx) => {
          for (const entry of entries) {
            await this.validationService.validateClient(entry.clientId, tx);

            await this.validationService.validateClientInGroup(
              entry.clientId,
              sheet.group_id,
              tx,
            );

            await this.validationService.validateProduct(entry.productId, tx);

            if (entry.orderedQty === undefined || entry.orderedQty === null) {
              throw new BadRequestException(
                ERROR_MESSAGES.MISSING_REQUIRED_FIELD('orderedQty'),
              );
            }

            this.validationService.validateQuantity(Number(entry.orderedQty));

            const sellingRate = await this.ordersRepository.getSellingRate(
              entry.clientId,
              entry.productId,
              sheet.order_paper.order_date, // ← FIXED
            );

            if (sellingRate === null || sellingRate === undefined) {
              throw new BadRequestException(
                ERROR_MESSAGES.NO_APPLICABLE_RATE(
                  entry.productId,
                  sheet.order_paper.order_date.toISOString(),
                ),
              );
            }
            const litres =
              Number(entry.orderedQty) *
              QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

            const nightBillAmount = litres * Number(sellingRate);

            await this.ordersRepository.upsertSheetEntryTx(tx, {
              order_sheet_id: sheetId,

              client_id: entry.clientId,

              product_id: entry.productId,

              ordered_qty: entry.orderedQty,

              night_selling_rate: Number(sellingRate),

              night_bill_amount: Number(nightBillAmount.toFixed(2)),
            });
          }
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
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

      const sheet = await this.ordersRepository.findSheetById(sheetId);

      if (!sheet) {
        throw new BadRequestException(`Sheet with ID ${sheetId} not found`);
      }

      const status = sheet.order_paper.status;

      if (!this.workflowState.canEditMorningEntries(status)) {
        throw new BadRequestException(
          ERROR_MESSAGES.CANNOT_EDIT_MORNING(status),
        );
      }

      this.validationService.validateNoDuplicates(entries);

      await this.prisma.$transaction(
        async (tx) => {
          for (const entry of entries) {
            if (
              entry.deliveredQty === undefined ||
              entry.deliveredQty === null
            ) {
              throw new BadRequestException(
                ERROR_MESSAGES.MISSING_REQUIRED_FIELD('deliveredQty'),
              );
            }

            const deliveredQty = Number(entry.deliveredQty);

            this.validationService.validateQuantity(deliveredQty);

            await this.validationService.validateClient(entry.clientId, tx);

            await this.validationService.validateClientInGroup(
              entry.clientId,
              sheet.group_id,
              tx,
            );

            await this.validationService.validateProduct(entry.productId, tx);

            const existingItem = await tx.order_sheet_items.findUnique({
              where: {
                order_sheet_id_client_id_product_id: {
                  order_sheet_id: sheetId,

                  client_id: entry.clientId,

                  product_id: entry.productId,
                },
              },

              include: {
                master_product: true,
              },
            });

            if (!existingItem) {
              throw new BadRequestException(
                ERROR_MESSAGES.NO_ORDERED_QUANTITY(
                  entry.clientId,
                  entry.productId,
                ),
              );
            }

            const product = existingItem.master_product;

            // CRITICAL FIX: Use order_date for historical accuracy
            const sellingRate = await this.ordersRepository.getSellingRate(
              entry.clientId,
              entry.productId,
              sheet.order_paper.order_date, // ← FIXED
            );

            if (sellingRate === null || sellingRate === undefined) {
              throw new BadRequestException(
                `No rate configured for client ${entry.clientId} product ${entry.productId}`,
              );
            }

            const litres =
              deliveredQty * QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

            const gstPercentage = Number(product.gst_percentage ?? 0);

            const isGstInclusive = product.is_gst_inclusive;

            let taxableAmount = 0;

            let gstAmount = 0;

            let finalBillAmount = 0;

            if (!isGstInclusive) {
              taxableAmount = litres * Number(sellingRate);

              gstAmount = taxableAmount * (gstPercentage / 100);

              finalBillAmount = taxableAmount + gstAmount;
            } else {
              finalBillAmount = litres * Number(sellingRate);

              taxableAmount = finalBillAmount / (1 + gstPercentage / 100);

              gstAmount = finalBillAmount - taxableAmount;
            }

            taxableAmount = Number(taxableAmount.toFixed(2));

            gstAmount = Number(gstAmount.toFixed(2));

            finalBillAmount = Number(finalBillAmount.toFixed(2));

            await tx.order_sheet_items.update({
              where: {
                order_sheet_id_client_id_product_id: {
                  order_sheet_id: sheetId,

                  client_id: entry.clientId,

                  product_id: entry.productId,
                },
              },

              data: {
                delivered_qty: deliveredQty,

                final_selling_rate: Number(sellingRate),

                final_gst_percentage: gstPercentage,

                final_gst_amount: gstAmount,

                final_taxable_amount: taxableAmount,

                final_bill_amount: finalBillAmount,
              },
            });
          }
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
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
