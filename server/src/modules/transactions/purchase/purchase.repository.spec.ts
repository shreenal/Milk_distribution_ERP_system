import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DeliverySession,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { PurchaseRepository } from './purchase.repository.js';

describe('PurchaseRepository', () => {
  let repository: PurchaseRepository;
  let db: any;

  beforeEach(() => {
    db = {
      order_paper: {
        findUnique: vi.fn(),
      },
      purchase_paper: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      vehicle_distribution_assignment: {
        findMany: vi.fn(),
      },
      purchase_entry: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
        createMany: vi.fn(),
      },
      master_vehicle: {
        findMany: vi.fn(),
      },
      master_product: {
        findMany: vi.fn(),
      },
      distributor_procurement_rule: {
        findMany: vi.fn(),
      },
      vehicle_allocation: {
        findMany: vi.fn(),
      },
      vehicle_allocation_paper: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      distributor_product_rate: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      master_product_link: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    };

    repository = new PurchaseRepository(db);
  });

  describe('findOrderPaperById', () => {
    it('should find an order paper by id', async () => {
      db.order_paper.findUnique.mockResolvedValue({ id: 1 });

      const result = await repository.findOrderPaperById(1, db);

      expect(result).toEqual({ id: 1 });

      expect(db.order_paper.findUnique).toHaveBeenCalledWith({
        where: {
          id: 1,
        },
      });
    });

    it('should return null when the order paper does not exist', async () => {
      db.order_paper.findUnique.mockResolvedValue(null);

      const result = await repository.findOrderPaperById(999, db);

      expect(result).toBeNull();
    });
  });

  describe('findPurchasePaper', () => {
    it('should find a purchase paper by order paper id', async () => {
      db.purchase_paper.findUnique.mockResolvedValue({
        id: 50,
        order_paper_id: 10,
      });

      const result = await repository.findPurchasePaper(10, db);

      expect(result).toEqual({
        id: 50,
        order_paper_id: 10,
      });

      expect(db.purchase_paper.findUnique).toHaveBeenCalledWith({
        where: {
          order_paper_id: 10,
        },
      });
    });

    it('should return null when the purchase paper does not exist', async () => {
      db.purchase_paper.findUnique.mockResolvedValue(null);

      const result = await repository.findPurchasePaper(999, db);

      expect(result).toBeNull();
    });
  });

  describe('getOrCreatePurchasePaper', () => {
    it('should upsert using the order paper id', async () => {
      db.purchase_paper.upsert.mockResolvedValue({
        id: 50,
        order_paper_id: 10,
      });

      const result = await repository.getOrCreatePurchasePaper(10, db);

      expect(result).toEqual({
        id: 50,
        order_paper_id: 10,
      });

      expect(db.purchase_paper.upsert).toHaveBeenCalledWith({
        where: {
          order_paper_id: 10,
        },
        update: {},
        create: {
          order_paper_id: 10,
        },
      });
    });
  });

  describe('findVehicleAssignmentsByPaperId', () => {
    it('should find assignments with vehicle, distributor and session data', async () => {
      db.vehicle_distribution_assignment.findMany.mockResolvedValue([]);

      await repository.findVehicleAssignmentsByPaperId(10, db);

      expect(db.vehicle_distribution_assignment.findMany).toHaveBeenCalledWith({
        where: {
          vehicle_allocation_paper: {
            order_paper_id: 10,
          },
        },
        include: {
          master_vehicle: true,
          master_distributor: true,
          vehicle_allocation_paper: {
            select: {
              delivery_session: true,
            },
          },
        },
        orderBy: [
          {
            vehicle_id: 'asc',
          },
          {
            category: 'asc',
          },
        ],
      });
    });
  });

  describe('findPurchaseEntries', () => {
    it('should find purchase entries with product relations and ordering', async () => {
      db.purchase_entry.findMany.mockResolvedValue([]);

      await repository.findPurchaseEntries(50, db);

      expect(db.purchase_entry.findMany).toHaveBeenCalledWith({
        where: {
          purchase_paper_id: 50,
        },
        include: {
          product_link: true,
          master_product: true,
        },
        orderBy: [
          { distributor_id: 'asc' },
          { category: 'asc' },
          { vehicle_id: 'asc' },
          { gatepass_date: 'asc' },
          { product_id: 'asc' },
        ],
      });
    });
  });

  describe('replacePurchaseEntries', () => {
    const existingRows = [
      {
        id: 1,
        purchase_paper_id: 50,
        vehicle_id: 10,
        distributor_id: 20,
        category: SupplyCategory.MILK,
        product_id: 30,
        delivery_session: DeliverySession.MORNING,
        purchased_qty: 10,
        purchase_rate: 25,
        purchase_amount: 250,
        source_allocation_id: 100,
        source_allocated_qty: 15,
        tray_type_id: 5,
        product_link_id: 200,
        gatepass_date: new Date('2026-06-15T00:00:00.000Z'),
      },
      {
        id: 2,
        purchase_paper_id: 50,
        vehicle_id: 11,
        distributor_id: 20,
        category: SupplyCategory.MILK,
        product_id: 31,
        delivery_session: DeliverySession.MORNING,
        purchased_qty: 20,
        purchase_rate: 30,
        purchase_amount: 600,
        source_allocation_id: 101,
        source_allocated_qty: 25,
        tray_type_id: 6,
        product_link_id: 201,
        gatepass_date: new Date('2026-06-15T00:00:00.000Z'),
      },
    ];

    const unchangedRow = {
      purchase_paper_id: 50,
      vehicle_id: 10,
      distributor_id: 20,
      category: SupplyCategory.MILK,
      product_id: 30,
      delivery_session: DeliverySession.MORNING,
      purchased_qty: 10,
      purchase_rate: 25,
      purchase_amount: 250,
      source_allocation_id: 100,
      source_allocated_qty: 15,
      tray_type_id: 5,
      product_link_id: 200,
      gatepass_date: new Date('2026-06-15T00:00:00.000Z'),
    };

    it('should load existing rows using the supplied db client', async () => {
      db.purchase_entry.findMany.mockResolvedValue([]);

      await repository.replacePurchaseEntries(50, [], db);

      expect(db.purchase_entry.findMany).toHaveBeenCalledWith({
        where: {
          purchase_paper_id: 50,
        },
      });
    });

    it('should preserve existing row identity when incoming data is unchanged', async () => {
      db.purchase_entry.findMany.mockResolvedValue(existingRows);

      await repository.replacePurchaseEntries(50, [unchangedRow] as any, db);

      expect(db.purchase_entry.update).not.toHaveBeenCalled();
      expect(db.purchase_entry.createMany).not.toHaveBeenCalled();

      expect(db.purchase_entry.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [2],
          },
        },
      });
    });

    it('should update an existing row when quantity changes', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      const incoming = {
        ...unchangedRow,
        purchased_qty: 12,
      };

      await repository.replacePurchaseEntries(50, [incoming] as any, db);

      expect(db.purchase_entry.update).toHaveBeenCalledWith({
        where: {
          id: 1,
        },
        data: {
          purchased_qty: 12,
          purchase_rate: 25,
          purchase_amount: 250,
          source_allocation_id: 100,
          source_allocated_qty: 15,
          tray_type_id: 5,
          gatepass_date: incoming.gatepass_date,
          product_link_id: 200,
        },
      });
    });

    it('should insert a genuinely new purchase entry', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.createMany.mockResolvedValue({
        count: 1,
      });

      const newRow = {
        ...unchangedRow,
        vehicle_id: 99,
        product_id: 99,
      };

      await repository.replacePurchaseEntries(
        50,
        [unchangedRow, newRow] as any,
        db,
      );

      expect(db.purchase_entry.createMany).toHaveBeenCalledWith({
        data: [newRow],
      });
    });

    it('should delete existing rows that are absent from incoming data', async () => {
      db.purchase_entry.findMany.mockResolvedValue(existingRows);
      db.purchase_entry.deleteMany.mockResolvedValue({
        count: 2,
      });

      await repository.replacePurchaseEntries(50, [], db);

      expect(db.purchase_entry.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [1, 2],
          },
        },
      });

      expect(db.purchase_entry.update).not.toHaveBeenCalled();
      expect(db.purchase_entry.createMany).not.toHaveBeenCalled();
    });

    it('should treat product_link_id as an update comparator', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            product_link_id: 999,
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(1);
    });

    it('should treat gatepass_date as an update comparator', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            gatepass_date: new Date('2026-06-16T00:00:00.000Z'),
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(1);
    });

    it('should treat tray_type_id as an update comparator', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            tray_type_id: 999,
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(1);
    });

    it('should treat source_allocation_id as an update comparator', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            source_allocation_id: 999,
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(1);
    });

    it('should treat source_allocated_qty as an update comparator', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            source_allocated_qty: 999,
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(1);
    });

    it('should treat purchase rate as an update comparator', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            purchase_rate: 99,
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(1);
    });

    it('should treat purchase amount as an update comparator', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);
      db.purchase_entry.update.mockResolvedValue({ id: 1 });

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            purchase_amount: 999,
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(1);
    });

    it('should treat numeric string values as equal to their numeric counterparts', async () => {
      db.purchase_entry.findMany.mockResolvedValue([
        {
          ...existingRows[0],
          purchased_qty: '10',
          purchase_rate: '25',
          purchase_amount: '250',
          source_allocated_qty: '15',
        },
      ]);

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            purchased_qty: 10,
            purchase_rate: 25,
            purchase_amount: 250,
            source_allocated_qty: 15,
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).not.toHaveBeenCalled();
      expect(db.purchase_entry.createMany).not.toHaveBeenCalled();
      expect(db.purchase_entry.deleteMany).not.toHaveBeenCalled();
    });

    it('should preserve an existing row when only incoming data contains an equivalent Date value', async () => {
      db.purchase_entry.findMany.mockResolvedValue([existingRows[0]]);

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            gatepass_date: new Date('2026-06-15T00:00:00.000Z'),
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).not.toHaveBeenCalled();
    });

    it('should update multiple changed rows without replacing their identities', async () => {
      db.purchase_entry.findMany.mockResolvedValue(existingRows);
      db.purchase_entry.update.mockResolvedValue({});

      await repository.replacePurchaseEntries(
        50,
        [
          {
            ...unchangedRow,
            purchased_qty: 11,
          },
          {
            purchase_paper_id: 50,
            vehicle_id: 11,
            distributor_id: 20,
            category: SupplyCategory.MILK,
            product_id: 31,
            delivery_session: DeliverySession.MORNING,
            purchased_qty: 21,
            purchase_rate: 30,
            purchase_amount: 630,
            source_allocation_id: 101,
            source_allocated_qty: 25,
            tray_type_id: 6,
            product_link_id: 201,
            gatepass_date: new Date('2026-06-15T00:00:00.000Z'),
          },
        ] as any,
        db,
      );

      expect(db.purchase_entry.update).toHaveBeenCalledTimes(2);

      expect(db.purchase_entry.update).toHaveBeenNthCalledWith(1, {
        where: {
          id: 1,
        },
        data: expect.objectContaining({
          purchased_qty: 11,
        }),
      });

      expect(db.purchase_entry.update).toHaveBeenNthCalledWith(2, {
        where: {
          id: 2,
        },
        data: expect.objectContaining({
          purchased_qty: 21,
        }),
      });
    });

    it('should perform delete, update and insert when all three operations are required', async () => {
      db.purchase_entry.findMany.mockResolvedValue([
        existingRows[0],
        existingRows[1],
      ]);
      db.purchase_entry.deleteMany.mockResolvedValue({ count: 1 });
      db.purchase_entry.update.mockResolvedValue({ id: 1 });
      db.purchase_entry.createMany.mockResolvedValue({ count: 1 });

      const updatedRow = {
        ...unchangedRow,
        purchased_qty: 12,
      };

      const newRow = {
        ...unchangedRow,
        vehicle_id: 99,
        product_id: 99,
      };

      await repository.replacePurchaseEntries(
        50,
        [updatedRow, newRow] as any,
        db,
      );

      expect(db.purchase_entry.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [2],
          },
        },
      });

      expect(db.purchase_entry.update).toHaveBeenCalledWith({
        where: {
          id: 1,
        },
        data: expect.objectContaining({
          purchased_qty: 12,
        }),
      });

      expect(db.purchase_entry.createMany).toHaveBeenCalledWith({
        data: [newRow],
      });
    });
  });

  describe('findVehicles', () => {
    it('should return active vehicles ordered by id', async () => {
      db.master_vehicle.findMany.mockResolvedValue([]);

      await repository.findVehicles(db);

      expect(db.master_vehicle.findMany).toHaveBeenCalledWith({
        where: {
          is_active: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
    });
  });

  describe('findProducts', () => {
    it('should return products with all required master data ordered by id', async () => {
      db.master_product.findMany.mockResolvedValue([]);

      await repository.findProducts(db);

      expect(db.master_product.findMany).toHaveBeenCalledWith({
        include: {
          master_brand: true,
          master_product_group: true,
          master_product_type: true,
          master_packaging_type: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
    });
  });

  describe('findDistributorProcurementRules', () => {
    it('should return active procurement rules ordered by distributor/category/brand/group', async () => {
      db.distributor_procurement_rule.findMany.mockResolvedValue([]);

      await repository.findDistributorProcurementRules(db);

      expect(db.distributor_procurement_rule.findMany).toHaveBeenCalledWith({
        where: {
          is_active: true,
        },
        include: {
          master_distributor: true,
          master_brand: true,
          master_product_group: true,
        },
        orderBy: [
          { distributor_id: 'asc' },
          { category: 'asc' },
          { brand_id: 'asc' },
          { product_group_id: 'asc' },
        ],
      });
    });
  });

  describe('findVehicleAllocationsByPaperId', () => {
    it('should find allocations through the order paper relation', async () => {
      db.vehicle_allocation.findMany.mockResolvedValue([]);

      await repository.findVehicleAllocationsByPaperId(10, db);

      expect(db.vehicle_allocation.findMany).toHaveBeenCalledWith({
        where: {
          vehicle_allocation_paper: {
            order_paper_id: 10,
          },
        },
        include: {
          master_vehicle: true,
          vehicle_allocation_paper: {
            select: {
              delivery_session: true,
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
        },
        orderBy: [
          { distributor_id: 'asc' },
          { category: 'asc' },
          { vehicle_id: 'asc' },
          { product_id: 'asc' },
        ],
      });
    });
  });

  describe('findVehicleAllocationPapersForOrderPaper', () => {
    it('should find allocation papers belonging to an order paper', async () => {
      db.vehicle_allocation_paper.findMany.mockResolvedValue([]);

      await repository.findVehicleAllocationPapersForOrderPaper(10, db);

      expect(db.vehicle_allocation_paper.findMany).toHaveBeenCalledWith({
        where: {
          order_paper_id: 10,
        },
      });
    });
  });

  describe('findProductLinkRateForDate', () => {
    it('should find an active rate covering the effective date', async () => {
      const effectiveDate = new Date('2026-06-15T00:00:00.000Z');

      db.distributor_product_rate.findFirst.mockResolvedValue({
        id: 500,
      });

      const result = await repository.findProductLinkRateForDate(
        200,
        effectiveDate,
        db,
      );

      expect(result).toEqual({ id: 500 });

      expect(db.distributor_product_rate.findFirst).toHaveBeenCalledWith({
        where: {
          product_link_id: 200,
          is_active: true,
          effective_from: {
            lte: effectiveDate,
          },
          OR: [
            {
              effective_to: null,
            },
            {
              effective_to: {
                gte: effectiveDate,
              },
            },
          ],
        },
        orderBy: {
          effective_from: 'desc',
        },
      });
    });

    it('should return null when no rate covers the date', async () => {
      db.distributor_product_rate.findFirst.mockResolvedValue(null);

      const result = await repository.findProductLinkRateForDate(
        200,
        new Date('2026-06-15T00:00:00.000Z'),
        db,
      );

      expect(result).toBeNull();
    });
  });

  describe('getProductLink', () => {
    it('should find a product link by distributor and product', async () => {
      db.master_product_link.findUnique.mockResolvedValue({
        id: 200,
      });

      await repository.getProductLink(20, 30, db);

      expect(db.master_product_link.findUnique).toHaveBeenCalledWith({
        where: {
          distributor_id_product_id: {
            distributor_id: 20,
            product_id: 30,
          },
        },
        select: {
          id: true,
          distributor_id: true,
          product_id: true,
          is_active: true,
        },
      });
    });

    it('should apply the active-only condition when requested', async () => {
      db.master_product_link.findUnique.mockResolvedValue({
        id: 200,
      });

      await repository.getProductLink(20, 30, db, true);

      expect(db.master_product_link.findUnique).toHaveBeenCalledWith({
        where: {
          distributor_id_product_id: {
            distributor_id: 20,
            product_id: 30,
          },
          is_active: true,
        },
        select: {
          id: true,
          distributor_id: true,
          product_id: true,
          is_active: true,
        },
      });
    });
  });

  describe('findPurchaseRateForDistributorProduct', () => {
    it('should return null when the product link does not exist', async () => {
      db.master_product_link.findUnique.mockResolvedValue(null);

      const result = await repository.findPurchaseRateForDistributorProduct(
        20,
        30,
        new Date('2026-06-15T00:00:00.000Z'),
        db,
      );

      expect(result).toBeNull();

      expect(db.distributor_product_rate.findFirst).not.toHaveBeenCalled();
    });

    it('should resolve the rate through the product link', async () => {
      const effectiveDate = new Date('2026-06-15T00:00:00.000Z');

      db.master_product_link.findUnique.mockResolvedValue({
        id: 200,
      });

      db.distributor_product_rate.findFirst.mockResolvedValue({
        id: 500,
        purchase_rate: 25,
      });

      const result = await repository.findPurchaseRateForDistributorProduct(
        20,
        30,
        effectiveDate,
        db,
      );

      expect(result).toEqual({
        id: 500,
        purchase_rate: 25,
      });

      expect(db.distributor_product_rate.findFirst).toHaveBeenCalledWith({
        where: {
          product_link_id: 200,
          is_active: true,
          effective_from: {
            lte: effectiveDate,
          },
          OR: [
            {
              effective_to: null,
            },
            {
              effective_to: {
                gte: effectiveDate,
              },
            },
          ],
        },
        orderBy: {
          effective_from: 'desc',
        },
      });
    });
  });

  describe('findLatestVehicleAllocationPaper', () => {
    it('should find the latest allocation paper ordered by updated_at descending', async () => {
      db.vehicle_allocation_paper.findFirst.mockResolvedValue({
        id: 50,
        updated_at: new Date('2026-06-15T10:00:00.000Z'),
        delivery_session: DeliverySession.MORNING,
      });

      const result = await repository.findLatestVehicleAllocationPaper(10, db);

      expect(result).toEqual({
        id: 50,
        updated_at: new Date('2026-06-15T10:00:00.000Z'),
        delivery_session: DeliverySession.MORNING,
      });

      expect(db.vehicle_allocation_paper.findFirst).toHaveBeenCalledWith({
        where: {
          order_paper_id: 10,
        },
        orderBy: {
          updated_at: 'desc',
        },
        select: {
          id: true,
          updated_at: true,
          delivery_session: true,
        },
      });
    });
  });

  describe('getProductLinksBatch', () => {
    it('should query all requested distributor/product pairs', async () => {
      db.master_product_link.findMany.mockResolvedValue([
        {
          id: 200,
          distributor_id: 20,
          product_id: 30,
          is_active: true,
        },
      ]);

      const result = await repository.getProductLinksBatch(
        [
          {
            distributorId: 20,
            productId: 30,
          },
        ],
        db,
      );

      expect(db.master_product_link.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              distributor_id: 20,
              product_id: 30,
            },
          ],
        },
        select: {
          id: true,
          distributor_id: true,
          product_id: true,
          is_active: true,
        },
      });

      expect(result.get('20_30')).toEqual({
        id: 200,
        distributor_id: 20,
        product_id: 30,
        is_active: true,
      });
    });

    it('should apply activeOnly to the batch lookup', async () => {
      db.master_product_link.findMany.mockResolvedValue([]);

      await repository.getProductLinksBatch(
        [
          {
            distributorId: 20,
            productId: 30,
          },
        ],
        db,
        true,
      );

      expect(db.master_product_link.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              distributor_id: 20,
              product_id: 30,
            },
          ],
          is_active: true,
        },
        select: {
          id: true,
          distributor_id: true,
          product_id: true,
          is_active: true,
        },
      });
    });

    it('should return an empty map when no links are returned', async () => {
      db.master_product_link.findMany.mockResolvedValue([]);

      const result = await repository.getProductLinksBatch([], db);

      expect(result).toEqual(new Map());
    });
  });

  describe('findProductLinkRatesForDateBatch', () => {
    it('should resolve the applicable rate for each requested link and date', async () => {
      const firstDate = new Date('2026-06-15T00:00:00.000Z');
      const secondDate = new Date('2026-06-16T00:00:00.000Z');

      const rates = [
        {
          id: 501,
          product_link_id: 200,
          purchase_rate: 25,
          effective_from: new Date('2026-06-01T00:00:00.000Z'),
          effective_to: null,
          is_active: true,
        },
        {
          id: 502,
          product_link_id: 201,
          purchase_rate: 30,
          effective_from: new Date('2026-06-01T00:00:00.000Z'),
          effective_to: null,
          is_active: true,
        },
      ];

      db.distributor_product_rate.findMany.mockResolvedValue(rates);

      const result = await repository.findProductLinkRatesForDateBatch(
        [
          {
            productLinkId: 200,
            effectiveDate: firstDate,
          },
          {
            productLinkId: 201,
            effectiveDate: secondDate,
          },
        ],
        db,
      );

      expect(db.distributor_product_rate.findMany).toHaveBeenCalledWith({
        where: {
          product_link_id: {
            in: [200, 201],
          },
          is_active: true,
        },
        orderBy: {
          effective_from: 'desc',
        },
      });

      expect(result.get(`200_${firstDate.toISOString()}`)).toEqual(rates[0]);

      expect(result.get(`201_${secondDate.toISOString()}`)).toEqual(rates[1]);
    });

    it('should choose the newest effective rate covering the requested date', async () => {
      const effectiveDate = new Date('2026-06-15T00:00:00.000Z');

      const olderRate = {
        id: 501,
        product_link_id: 200,
        effective_from: new Date('2026-05-01T00:00:00.000Z'),
        effective_to: new Date('2026-06-30T00:00:00.000Z'),
        is_active: true,
      };

      const newerRate = {
        id: 502,
        product_link_id: 200,
        effective_from: new Date('2026-06-10T00:00:00.000Z'),
        effective_to: null,
        is_active: true,
      };

      db.distributor_product_rate.findMany.mockResolvedValue([
        newerRate,
        olderRate,
      ]);

      const result = await repository.findProductLinkRatesForDateBatch(
        [
          {
            productLinkId: 200,
            effectiveDate,
          },
        ],
        db,
      );

      expect(result.get(`200_${effectiveDate.toISOString()}`)).toEqual(
        newerRate,
      );
    });

    it('should return null for a requested link/date with no applicable rate', async () => {
      const effectiveDate = new Date('2026-06-15T00:00:00.000Z');

      db.distributor_product_rate.findMany.mockResolvedValue([]);

      const result = await repository.findProductLinkRatesForDateBatch(
        [
          {
            productLinkId: 200,
            effectiveDate,
          },
        ],
        db,
      );

      expect(result.get(`200_${effectiveDate.toISOString()}`)).toBeNull();
    });

    it('should query unique product link ids only once', async () => {
      const effectiveDate = new Date('2026-06-15T00:00:00.000Z');

      db.distributor_product_rate.findMany.mockResolvedValue([]);

      await repository.findProductLinkRatesForDateBatch(
        [
          {
            productLinkId: 200,
            effectiveDate,
          },
          {
            productLinkId: 200,
            effectiveDate: new Date('2026-06-16T00:00:00.000Z'),
          },
        ],
        db,
      );

      expect(db.distributor_product_rate.findMany).toHaveBeenCalledWith({
        where: {
          product_link_id: {
            in: [200],
          },
          is_active: true,
        },
        orderBy: {
          effective_from: 'desc',
        },
      });
    });
  });
});
