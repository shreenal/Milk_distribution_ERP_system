import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrdersRepository } from './orders.repository.js';
import { ERROR_MESSAGES, QUANTITY_PRECISION } from './orders.constants.js';
import { TransactionClient } from '../../types/transaction.types.js';

@Injectable()
export class OrdersValidationService {
  private readonly logger = new Logger(OrdersValidationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  async validateProduct(productId: number, txClient?: TransactionClient) {
    const prisma = txClient || this.prisma;

    const product = await prisma.master_product.findUnique({
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

  async validateClient(clientId: number, txClient?: TransactionClient) {
    const prisma = txClient || this.prisma;

    const client = await prisma.master_client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        is_active: true,
      },
    });

    if (!client) {
      throw new BadRequestException(ERROR_MESSAGES.CLIENT_NOT_FOUND(clientId));
    }

    if (!client.is_active) {
      throw new BadRequestException(
        ERROR_MESSAGES.CLIENT_INACTIVE(client.name),
      );
    }

    return client;
  }

  async validateClientInGroup(
    clientId: number,
    groupId: number,
    txClient?: TransactionClient,
  ) {
    const prisma = txClient || this.prisma;

    const client = await prisma.master_client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        delivery_group_id: true,
      },
    });

    if (!client) {
      throw new BadRequestException(ERROR_MESSAGES.CLIENT_NOT_FOUND(clientId));
    }

    if (client.delivery_group_id !== groupId) {
      throw new BadRequestException(
        ERROR_MESSAGES.CLIENT_NOT_IN_GROUP(clientId, groupId),
      );
    }

    return client;
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

  validateQuantity(qty: number) {
    if (qty < 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.QUANTITY_NEGATIVE('Quantity', qty),
      );
    }

    if ((qty * 10) % 5 !== 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.INVALID_QUANTITY_PRECISION(
          qty,
          QUANTITY_PRECISION.MIN_UNIT_PRECISION,
        ),
      );
    }
  }

  async validateNightEntriesComplete(sheetId: number, groupName: string) {
    const entries = await this.ordersRepository.getSheetItems(sheetId);

    if (entries.length === 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.NO_ORDERS_IN_SHEET(groupName),
      );
    }

    const incompleteEntries = entries.filter(
      (item) => item.ordered_qty === null,
    );

    if (incompleteEntries.length > 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.NIGHT_ENTRY_INCOMPLETE(groupName),
      );
    }
  }

  async validateMorningEntriesComplete(sheetId: number): Promise<void> {
    const items =
      await this.ordersRepository.getMorningValidationItems(sheetId);

    if (items.length === 0) return; // Empty OK

    const incomplete = items.filter(
      (i) => i.delivered_qty === null || i.delivered_qty === undefined,
    );

    if (incomplete.length > 0) {
      const codes = incomplete.map((i) => i.master_product.code).join(', ');
      throw new BadRequestException(`Delivered quantity missing for: ${codes}`);
    }
  }

  async validateQuantitySanity(sheetId: number): Promise<void> {
    const items =
      await this.ordersRepository.getQuantityValidationItems(sheetId);

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
}
