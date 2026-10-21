import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { OrdersRepository } from '.././orders.repository.js';
import { ERROR_MESSAGES, QUANTITY_PRECISION } from './../orders.constants.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';
import { toDecimal } from '../../../../common/utils/money.util.js';

@Injectable()
export class OrdersValidationService {
  private readonly logger = new Logger(OrdersValidationService.name);
  constructor(private readonly ordersRepository: OrdersRepository) {}

  private productLabels(
    items: { product_id: number; master_product: { code: string | null } }[],
  ): string {
    return [
      ...new Set(items.map((i) => i.master_product.code ?? `#${i.product_id}`)),
    ].join(', ');
  }

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
      throw new BadRequestException(ERROR_MESSAGES.PRODUCT_INACTIVE(productId));
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

  validateOrderedQuantity(qty: number) {
    this.validateQuantity(qty, 'ordered quantity');
  }

  validateDeliveredQuantity(qty: number) {
    this.validateQuantity(qty, 'delivered quantity');
  }

  private validateQuantity(qty: number, label: string) {
    if (!Number.isFinite(qty)) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_QUANTITY_PRECISION(qty),
      );
    }
    if (qty < 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.QUANTITY_NEGATIVE(label, qty),
      );
    }
    if (
      toDecimal(qty).decimalPlaces() > QUANTITY_PRECISION.QTY_DECIMAL_PLACES
    ) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_QUANTITY_PRECISION(qty),
      );
    }
  }

  async validateProductsOnSheet(
    sheetId: number,
    productIds: number[],
    db: PrismaOrTransaction,
  ) {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return;
    const available = await this.ordersRepository.getProductIdsAvailableOnSheet(
      sheetId,
      unique,
      db,
    );
    for (const id of unique) {
      if (!available.has(id)) {
        throw new BadRequestException(ERROR_MESSAGES.PRODUCT_NOT_ON_SHEET(id));
      }
    }
  }

  async validateNightEntriesComplete(
    sheetId: number,
    groupName: string,
    db: PrismaOrTransaction,
  ) {
    // Business rule: an active group must have a real order. Rows that were
    // zeroed out (ordered_qty = 0) do not count.
    const positiveOrders =
      await this.ordersRepository.countPositiveOrderedItems(sheetId, db);

    if (positiveOrders === 0) {
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

    if (items.length === 0) {
      const sheet = await db.order_sheet.findUnique({
        where: { id: sheetId },
        select: { master_group: { select: { name: true } } },
      });
      throw new BadRequestException(
        ERROR_MESSAGES.NO_ORDER_LINES_IN_SHEET(
          sheet?.master_group.name ?? `#${sheetId}`,
        ),
      );
    }

    const incomplete = items.filter(
      (i) => i.delivered_qty === null || i.delivered_qty === undefined,
    );
    if (incomplete.length > 0) {
      const codes = incomplete.map((i) => i.master_product.code).join(', ');
      throw new BadRequestException(
        `Delivered quantity missing for: ${this.productLabels(incomplete)}`,
      );
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
    const negative = items.filter((i) => Number(i.delivered_qty) < 0);
    if (negative.length > 0) {
      throw new BadRequestException(
        `Negative quantities not allowed: ${this.productLabels(negative)}`,
      );
    }
  }

  async validateEntriesBatch(
    entries: { clientId: number; productId: number }[],
    groupId: number,
    db: PrismaOrTransaction,
    enforceLiveMasterRules = true,
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
      if (enforceLiveMasterRules && !client.is_active) {
        throw new BadRequestException(
          ERROR_MESSAGES.CLIENT_INACTIVE(client.name),
        );
      }
      if (enforceLiveMasterRules && client.delivery_group_id !== groupId) {
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
      if (enforceLiveMasterRules && !product.is_active) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT_INACTIVE(entry.productId),
        );
      }

      const productCategory = product.master_product_group.category;
      if (enforceLiveMasterRules) {
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
  }
}
