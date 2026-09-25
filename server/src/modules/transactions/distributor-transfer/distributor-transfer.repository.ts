import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaOrTransaction } from '../../../types/transaction.types.js';
import { diffByKey } from '../../../common/prisma/diff-by-key.util.js';

@Injectable()
export class DistributorTransferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderPaperById(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.findUnique({
      where: {
        id: paperId,
      },
    });
  }

  async getTransferSourceItems(
    paperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },

      include: {
        order_sheet: {
          include: {
            master_group: {
              select: {
                id: true,
                name: true,
                delivery_session: true,
              },
            },
          },
        },

        master_client: {
          include: {
            owner_distributor: true,
          },
        },

        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
          },
        },

        product_link: {
          include: {
            distributor: true,
          },
        },
      },

      orderBy: [
        {
          order_sheet: {
            group_id: 'asc',
          },
        },
        {
          client_id: 'asc',
        },
        {
          product_id: 'asc',
        },
      ],
    });
  }

  async findTransferRules(db: PrismaOrTransaction = this.prisma) {
    return db.distributor_transfer_rule.findMany({
      where: {
        is_active: true,
      },

      include: {
        supplier_distributor: true,
        owner_distributor: true,
      },
    });
  }

  async findDistributorTransfers(
    orderPaperId: number,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.distributor_transfer.findMany({
      where: {
        order_paper_id: orderPaperId,
      },

      include: {
        supplier_distributor: true,
        owner_distributor: true,

        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
          },
        },
      },

      orderBy: [
        { supplier_distributor_id: 'asc' },
        { owner_distributor_id: 'asc' },
        { product_id: 'asc' },
      ],
    });
  }

  async replaceDistributorTransfers(
    orderPaperId: number,
    data: Prisma.distributor_transferCreateManyInput[],
    db: PrismaOrTransaction = this.prisma,
  ) {
    const existing = await db.distributor_transfer.findMany({
      where: { order_paper_id: orderPaperId },
    });

    const { toDelete, toInsert, toUpdate } = diffByKey<
      (typeof existing)[number],
      (typeof data)[number]
    >(
      existing,
      data,
      (row) =>
        `${row.supplier_distributor_id}_${row.owner_distributor_id}_${row.product_id}`,
      (row) =>
        `${row.supplier_distributor_id}_${row.owner_distributor_id}_${row.product_id}`,
      (existingRow, incomingRow) =>
        Number(existingRow.transfer_qty) !== Number(incomingRow.transfer_qty),
    );
    if (toDelete.length > 0) {
      await db.distributor_transfer.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });
    }
    for (const { existingRow, incomingRow } of toUpdate) {
      await db.distributor_transfer.update({
        where: { id: existingRow.id },
        data: { transfer_qty: incomingRow.transfer_qty },
      });
    }
    if (toInsert.length > 0) {
      await db.distributor_transfer.createMany({ data: toInsert });
    }
  }

  async touchOrderPaperIfUnchanged(
    paperId: number,
    expectedUpdatedAt: Date,
    db: PrismaOrTransaction = this.prisma,
  ) {
    return db.order_paper.updateMany({
      where: { id: paperId, updated_at: expectedUpdatedAt },
      data: {},
    });
  }
}
