import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { OrdersRepository } from './orders.repository.js';

import { SaveMorningEntriesDto } from './dto/save-morning-entries.dto.js';

import { SaveNightEntriesDto } from './dto/save-night-entries.dto.js';

import { OrdersBuilder } from './order.builder.js';

import { WorkflowBuilder } from '../workflow/workflow.builder.js';

import { OrdersValidationService } from './services/orders-validation.service.js';

import { SupplyCategory } from '../../../generated/prisma/client.js';

import { ClientTraysPropagationService } from '../client-trays/services/client-trays-propagation.service.js';

import {
  TRANSACTION_CONFIG,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from './orders.constants.js';

import { PrismaService } from '../../../prisma/prisma.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { AddProductDto } from './dto/add-product.dto.js';
import { OrderCommercialService } from './services/order-commercial.service.js';
import { BillingService } from './services/billing.service.js';

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

    private readonly clientTraysPropagationService: ClientTraysPropagationService,
  ) {}

  async getAvailableProducts(category: SupplyCategory) {
    return this.ordersRepository.findAvailableProducts(category);
  }

  async getSheetService(sheetId: number) {
    try {
      if (!sheetId || sheetId <= 0) {
        throw new BadRequestException(ERROR_MESSAGES.INVALID_SHEET_ID);
      }

      const sheet = await this.ordersRepository.findSheetById(sheetId);

      if (!sheet) {
        throw new BadRequestException(ERROR_MESSAGES.SHEET_NOT_FOUND);
      }

      const milkProducts = await this.ordersRepository.getProductsForSheet(
        sheetId,
        SupplyCategory.MILK,
      );

      const nonMilkProducts = await this.ordersRepository.getProductsForSheet(
        sheetId,
        SupplyCategory.NON_MILK,
      );

      const milkClients =
        await this.ordersRepository.getClientsByGroupAndCategory(
          sheet.group_id,
          SupplyCategory.MILK,
        );

      const nonMilkClients =
        await this.ordersRepository.getClientsByGroupAndCategory(
          sheet.group_id,
          SupplyCategory.NON_MILK,
        );

      const sheetItems = await this.ordersRepository.getSheetItems(sheet.id);

      const workflow = this.workflowBuilder.buildOrdersWorkflow(
        sheet.order_paper.status,
      );

      const orderBilling = this.ordersBuilder.buildOrderBillingSection(
        {
          milkProducts,
          nonMilkProducts,
          milkClients,
          nonMilkClients,
          sheetItems,
        },
        sheet.order_paper.status,
      );

      return {
        sheet,

        workflow,

        ...orderBilling,
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

  async addProductToSheet(sheetId: number, dto: AddProductDto) {
    if (!sheetId || sheetId <= 0) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_SHEET_ID);
    }

    const sheet = await this.ordersRepository.findSheetById(sheetId);

    if (!sheet) {
      throw new BadRequestException(ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    if (!this.workflowState.canEditNightEntries(sheet.order_paper.status)) {
      throw new BadRequestException(
        'Products can only be added while the paper is in DRAFT',
      );
    }
    const supplyRules = await this.ordersRepository.getGroupSupplyRules(
      sheet.group_id,
    );

    await this.prisma.$transaction(
      async (tx) => {
        const commercialContext = await this.orderCommercialService.resolve(
          sheet.group_id,
          dto.productId,
          supplyRules,
          tx,
        );

        const existingItems =
          await this.ordersRepository.getSheetItems(sheetId);

        const product = await tx.master_product.findUnique({
          where: { id: dto.productId },
          select: {
            id: true,
            master_product_group: {
              select: {
                category: true,
              },
            },
          },
        });

        if (!product) {
          throw new BadRequestException(
            ERROR_MESSAGES.PRODUCT_NOT_FOUND(dto.productId),
          );
        }

        const eligibleClients =
          await this.ordersRepository.getClientsByGroupAndCategory(
            sheet.group_id,
            product.master_product_group.category,
            tx,
          );

        const rows = eligibleClients
          .filter(
            (client) =>
              !existingItems.some(
                (item) =>
                  item.client_id === client.id &&
                  item.product_id === dto.productId,
              ),
          )
          .map((client) => ({
            order_sheet_id: sheetId,
            client_id: client.id,
            product_id: dto.productId,
            product_link_id: commercialContext.productLinkId,

            ordered_qty: 0,
            delivered_qty: 0,

            night_selling_rate: 0,
            night_bill_amount: 0,

            final_selling_rate: 0,
            final_gst_percentage: 0,
            final_gst_amount: 0,
            final_taxable_amount: 0,
            final_bill_amount: 0,
          }));

        if (rows.length === 0) {
          throw new BadRequestException('Product already exists in this sheet');
        }

        const result = await this.ordersRepository.createSheetItems(rows, tx);

        if (result.count === 0) {
          throw new BadRequestException('Product already exists in this sheet');
        }
      },
      {
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
        isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
      },
    );

    return this.getSheetService(sheetId);
  }

  async removeProductFromSheet(sheetId: number, productId: number) {
    if (!sheetId || sheetId <= 0) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_SHEET_ID);
    }

    const sheet = await this.ordersRepository.findSheetById(sheetId);

    if (!sheet) {
      throw new BadRequestException(ERROR_MESSAGES.SHEET_NOT_FOUND);
    }

    if (!this.workflowState.canEditNightEntries(sheet.order_paper.status)) {
      throw new BadRequestException(
        'Products can only be removed while the paper is in DRAFT',
      );
    }

    const product = await this.ordersRepository.getProductWithGroup(productId);

    if (product.show_by_default) {
      throw new BadRequestException('Default products cannot be removed');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const result = await this.ordersRepository.deleteSheetItems(
          sheetId,
          productId,
          tx,
        );

        if (result.count === 0) {
          throw new BadRequestException('Product not found in this sheet');
        }
      },
      {
        timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
        isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
      },
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

      const sheet = await this.ordersRepository.findSheetById(sheetId);

      if (!sheet) {
        throw new BadRequestException(`Sheet with ID ${sheetId} not found`);
      }

      const supplyRules = await this.ordersRepository.getGroupSupplyRules(
        sheet.group_id,
      );

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

            await this.validationService.validateClientCanBuyProductCategory(
              entry.clientId,
              entry.productId,
              tx,
            );

            if (entry.orderedQty === undefined || entry.orderedQty === null) {
              throw new BadRequestException(
                ERROR_MESSAGES.MISSING_REQUIRED_FIELD('orderedQty'),
              );
            }

            this.validationService.validateQuantity(Number(entry.orderedQty));

            await this.billingService.saveNightEntry(
              tx,
              sheet,
              supplyRules,
              sheetId,
              entry,
            );
          }
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      );

      await this.clientTraysPropagationService.recalculateFromSheet(sheetId);

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

      const supplyRules = await this.ordersRepository.getGroupSupplyRules(
        sheet.group_id,
      );

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

            await this.validationService.validateClientCanBuyProductCategory(
              entry.clientId,
              entry.productId,
              tx,
            );

            await this.billingService.saveMorningEntry(
              tx,
              sheet,
              supplyRules,
              sheetId,
              entry,
            );
          }
        },
        {
          timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
          isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,
        },
      );

      await this.clientTraysPropagationService.recalculateFromSheet(sheetId);

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
