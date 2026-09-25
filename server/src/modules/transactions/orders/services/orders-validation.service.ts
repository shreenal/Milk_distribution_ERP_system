import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { OrdersRepository } from '.././orders.repository.js';
import { ERROR_MESSAGES, QUANTITY_PRECISION } from './../orders.constants.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { TrayCalculationService } from '../../../../common/calculators/tray-calculation.service.js';
import {
  ProductTrayRule,
  TrayRuleProduct,
} from '../../../../types/tray.types.js';

@Injectable()
export class OrdersValidationService {
  private readonly logger = new Logger(OrdersValidationService.name);
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly trayCalculationService: TrayCalculationService,
  ) {}

  async validateProduct(productId: number, db: PrismaOrTransaction) {
    const product = await db.master_product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        is_active: true,
      },
    });

    if (!product) {
      throw new BadRequestException(
        ERROR_MESSAGES.PRODUCT_NOT_FOUND(productId),
      );
    }

    if (!product.is_active) {
      throw new BadRequestException(
        ERROR_MESSAGES.PRODUCT_INACTIVE(String(productId)),
      );
    }

    return product;
  }

  validateNoDuplicates(
    entries: {
      clientId: number;

      productId: number;
    }[],
  ) {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const entry of entries) {
      const key = `${entry.clientId}-${entry.productId}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    if (duplicates.length > 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.DUPLICATE_ENTRIES(duplicates),
      );
    }
  }

  validateOrderedQuantity(
    qty: number,
    product: TrayRuleProduct,
    trayRules: ProductTrayRule[],
  ) {
    if (qty < 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.QUANTITY_NEGATIVE('ordered quantity', qty),
      );
    }

    const trayRule = this.trayCalculationService.resolveTrayRule(
      product,
      trayRules,
    );

    // No tray rule = product is not tray-based.
    if (!trayRule) {
      return;
    }

    this.validateTrayQuantity(qty);
  }

  validateDeliveredQuantity(
    qty: number,
    item: {
      tray_type_id: number | null;
    },
  ) {
    if (qty < 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.QUANTITY_NEGATIVE('delivered quantity', qty),
      );
    }

    // Product was not tray-based when the order item was created.
    if (item.tray_type_id === null) {
      return;
    }

    this.validateTrayQuantity(qty);
  }

  private validateTrayQuantity(qty: number) {
    const decimalPlaces = QUANTITY_PRECISION.QTY_DECIMAL_PLACES;
    const factor = 10 ** decimalPlaces;

    if (!Number.isFinite(qty)) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_QUANTITY_PRECISION(qty),
      );
    }

    const rounded = Math.round(qty * factor) / factor;

    if (Math.abs(qty - rounded) > 1e-9) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_QUANTITY_PRECISION(qty),
      );
    }
  }

  async validateNightEntriesComplete(
    sheetId: number,
    groupName: string,
    db: PrismaOrTransaction,
  ) {
    const entries = await this.ordersRepository.getSheetItems(sheetId, db);

    if (entries.length === 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.NO_ORDERS_IN_SHEET(groupName),
      );
    }
  }

  async validateMorningEntriesComplete(
    sheetId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const items = await this.ordersRepository.getMorningValidationItems(
      sheetId,
      db,
    );

    if (items.length === 0) return; // Empty OK

    const incomplete = items.filter(
      (i) => i.delivered_qty === null || i.delivered_qty === undefined,
    );

    if (incomplete.length > 0) {
      const codes = incomplete.map((i) => i.master_product.code).join(', ');
      throw new BadRequestException(`Delivered quantity missing for: ${codes}`);
    }
  }

  async validateQuantitySanity(
    sheetId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const items = await this.ordersRepository.getQuantityValidationItems(
      sheetId,
      db,
    );

    // Check no negative quantities
    const negative = items.filter((i) => Number(i.delivered_qty) < 0);
    if (negative.length > 0) {
      const codes = negative.map((i) => i.master_product.code).join(', ');
      throw new BadRequestException(
        `Negative quantities not allowed: ${codes}`,
      );
    }

    // Log extreme over-delivery but don't fail
    const extreme = items.filter((i) => {
      const ord = Number(i.ordered_qty ?? 0);
      const del = Number(i.delivered_qty ?? 0);
      return ord > 0 && del > ord * 1.5;
    });

    if (extreme.length > 0) {
      this.logger.warn(`Over-delivery detected: ${extreme.length} items`);
    }
  }

  async validateEntriesBatch(
    entries: { clientId: number; productId: number }[],
    groupId: number,
    db: PrismaOrTransaction,
    checkCategoryAuthorization = true,
  ) {
    const clientIds = [...new Set(entries.map((e) => e.clientId))];
    const productIds = [...new Set(entries.map((e) => e.productId))];

    const [clients, products] = await Promise.all([
      db.master_client.findMany({
        where: { id: { in: clientIds } },
        select: {
          id: true,
          name: true,
          is_active: true,
          delivery_group_id: true,
          categories: { select: { category: true } },
        },
      }),
      db.master_product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          is_active: true,
          brand_id: true,
          product_group_id: true,
          product_type_id: true,
          packaging_type_id: true,
          master_product_group: {
            select: {
              category: true,
            },
          },
        },
      }),
    ]);

    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const entry of entries) {
      const client = clientMap.get(entry.clientId);
      if (!client) {
        throw new BadRequestException(
          ERROR_MESSAGES.CLIENT_NOT_FOUND(entry.clientId),
        );
      }
      if (!client.is_active) {
        throw new BadRequestException(
          ERROR_MESSAGES.CLIENT_INACTIVE(client.name),
        );
      }
      if (client.delivery_group_id !== groupId) {
        throw new BadRequestException(
          ERROR_MESSAGES.CLIENT_NOT_IN_GROUP(entry.clientId, groupId),
        );
      }

      const product = productMap.get(entry.productId);
      if (!product) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT_NOT_FOUND(entry.productId),
        );
      }
      if (!product.is_active) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT_INACTIVE(String(entry.productId)),
        );
      }

      const productCategory = product.master_product_group.category;
      if (checkCategoryAuthorization) {
        const isAllowed = client.categories.some(
          (c) => c.category === productCategory,
        );
        if (!isAllowed) {
          throw new BadRequestException(
            `Client "${client.name}" is not authorized to purchase ${productCategory} products`,
          );
        }
      }
    }

    return productMap;
  }
}
