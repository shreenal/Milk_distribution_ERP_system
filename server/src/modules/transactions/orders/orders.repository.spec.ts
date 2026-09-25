import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { BadRequestException } from '@nestjs/common';

import { OrdersRepository } from './orders.repository.js';
import {
  Prisma,
  OrderPaperStatus,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';

/**
 * Layer 3 (plan §6) — real Postgres, never mocked.
 *
 * Exercises OrdersRepository directly against the real schema.
 * Service orchestration is covered separately by OrdersService specs.
 *
 * Precondition: test-seed.ts has been run against milk_distribution_test.
 */
describe('OrdersRepository (integration)', () => {
  const repository = new OrdersRepository(testPrisma);

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    await resetPaperData();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  async function createPaper(orderDate = '2027-01-04T00:00:00.000Z') {
    return testPrisma.order_paper.create({
      data: {
        order_date: new Date(orderDate),
        sale_date: new Date(
          new Date(orderDate).getTime() + 24 * 60 * 60 * 1000,
        ),
        status: OrderPaperStatus.DRAFT,
      },
    });
  }

  async function createSheet(paperId: number, groupId?: number) {
    const group =
      groupId !== undefined
        ? await testPrisma.master_group.findUniqueOrThrow({
            where: { id: groupId },
          })
        : await testPrisma.master_group.findFirstOrThrow({
            where: { is_active: true },
          });

    return testPrisma.order_sheet.create({
      data: {
        order_paper_id: paperId,
        group_id: group.id,
      },
    });
  }

  async function getActiveGroup() {
    return testPrisma.master_group.findFirstOrThrow({
      where: { is_active: true },
    });
  }

  async function getActiveClient(groupId: number) {
    return testPrisma.master_client.findFirstOrThrow({
      where: {
        delivery_group_id: groupId,
        is_active: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async function getActiveProduct(category?: SupplyCategory) {
    return testPrisma.master_product.findFirstOrThrow({
      where: {
        is_active: true,
        ...(category
          ? {
              master_product_group: {
                category,
              },
            }
          : {}),
      },
      include: {
        master_product_group: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async function getProductLink(productId: number, distributorId?: number) {
    return testPrisma.master_product_link.findFirstOrThrow({
      where: {
        product_id: productId,
        ...(distributorId !== undefined
          ? { distributor_id: distributorId }
          : {}),
      },
      orderBy: { id: 'asc' },
    });
  }

  describe('schema invariants', () => {
    it('rejects a duplicate (order_sheet_id, client_id, product_link_id)', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await testPrisma.order_sheet_items.create({
        data: {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      });

      await expect(
        testPrisma.order_sheet_items.create({
          data: {
            order_sheet_id: sheet.id,
            client_id: client.id,
            product_id: product.id,
            product_link_id: link.id,
            ordered_qty: 20,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejects a duplicate (order_sheet_id, product_id) on order_sheet_product at the DB level', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await testPrisma.order_sheet_product.create({
        data: {
          order_sheet_id: sheet.id,
          product_id: product.id,
          product_link_id: link.id,
        },
      });

      await expect(
        testPrisma.order_sheet_product.create({
          data: {
            order_sheet_id: sheet.id,
            product_id: product.id,
            product_link_id: link.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
    it('rejects a duplicate (order_sheet_id, client_id, product_id) independently', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();

      const links = await testPrisma.master_product_link.findMany({
        where: {
          product_id: product.id,
        },
        orderBy: { id: 'asc' },
        take: 2,
      });

      expect(links.length).toBeGreaterThanOrEqual(2);

      await testPrisma.order_sheet_items.create({
        data: {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: links[0].id,
          ordered_qty: 10,
        },
      });

      await expect(
        testPrisma.order_sheet_items.create({
          data: {
            order_sheet_id: sheet.id,
            client_id: client.id,
            product_id: product.id,
            product_link_id: links[1].id,
            ordered_qty: 20,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('getActiveGroups', () => {
    it('returns only active groups', async () => {
      const result = await repository.getActiveGroups();

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((group) => group.is_active)).toBe(true);

      const expected = await testPrisma.master_group.count({
        where: { is_active: true },
      });

      expect(result).toHaveLength(expected);
    });
  });

  describe('generateOrderSheets', () => {
    it('creates one sheet per supplied group', async () => {
      const paper = await createPaper();
      const groups = await repository.getActiveGroups();

      const result = await repository.generateOrderSheets(
        paper.id,
        groups.map((group) => ({ id: group.id })),
      );

      expect(result.count).toBe(groups.length);

      const sheets = await testPrisma.order_sheet.findMany({
        where: { order_paper_id: paper.id },
      });

      expect(sheets).toHaveLength(groups.length);
    });

    it('is idempotent because duplicate sheets are skipped', async () => {
      const paper = await createPaper();
      const groups = await repository.getActiveGroups();

      const first = await repository.generateOrderSheets(
        paper.id,
        groups.map((group) => ({ id: group.id })),
      );

      const second = await repository.generateOrderSheets(
        paper.id,
        groups.map((group) => ({ id: group.id })),
      );

      expect(first.count).toBe(groups.length);
      expect(second.count).toBe(0);
    });
  });

  describe('findSheetById', () => {
    it('returns null for an unknown sheet', async () => {
      const result = await repository.findSheetById(-1);

      expect(result).toBeNull();
    });

    it('returns the sheet with group and paper included', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);

      const result = await repository.findSheetById(sheet.id);

      expect(result?.id).toBe(sheet.id);
      expect(result?.master_group.id).toBe(group.id);
      expect(result?.order_paper.id).toBe(paper.id);
    });
  });

  describe('getSheetItemsByPaperId', () => {
    it('returns items belonging to sheets on the specified paper', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await testPrisma.order_sheet_items.create({
        data: {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 12,
        },
      });

      const result = await repository.getSheetItemsByPaperId(paper.id);

      expect(result).toHaveLength(1);
      expect(result[0].order_sheet_id).toBe(sheet.id);
    });
  });

  describe('client queries', () => {
    it('getClientsByGroupId returns active clients ordered by name', async () => {
      const group = await getActiveGroup();

      const result = await repository.getClientsByGroupId(group.id);

      expect(result.every((client) => client.is_active)).toBe(true);
      expect(
        result.every((client) => client.delivery_group_id === group.id),
      ).toBe(true);

      for (let i = 1; i < result.length; i++) {
        expect(
          result[i - 1].name.localeCompare(result[i].name),
        ).toBeLessThanOrEqual(0);
      }
    });

    it('getClientsByGroupAndCategory returns active clients having the category', async () => {
      const group = await getActiveGroup();

      const result = await repository.getClientsByGroupAndCategory(
        group.id,
        SupplyCategory.MILK,
      );

      expect(result.every((client) => client.is_active)).toBe(true);
      expect(
        result.every((client) => client.delivery_group_id === group.id),
      ).toBe(true);
    });

    it('getClientsForSheetDisplay retains a historically referenced client', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);

      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await testPrisma.order_sheet_items.create({
        data: {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      });

      const result = await repository.getClientsForSheetDisplay(
        sheet.id,
        group.id,
        product.master_product_group.category,
      );

      expect(result.some((item) => item.id === client.id)).toBe(true);

      for (let i = 1; i < result.length; i++) {
        expect(
          result[i - 1].name.localeCompare(result[i].name),
        ).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('product queries', () => {
    it('findAvailableProducts returns only active products', async () => {
      const result = await repository.findAvailableProducts();

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((product) => product.is_active)).toBe(true);
    });

    it('findAvailableProducts filters by category', async () => {
      const result = await repository.findAvailableProducts(
        SupplyCategory.MILK,
      );

      expect(
        result.every(
          (product) =>
            product.master_product_group.category === SupplyCategory.MILK,
        ),
      ).toBe(true);
    });

    it('getProductsForSheet includes default products', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();

      const result = await repository.getProductsForSheet(
        sheet.id,
        product.master_product_group.category,
      );

      expect(result.some((item) => item.id === product.id)).toBe(
        product.show_by_default,
      );
    });

    it('getProductsForSheet retains a historically billed product', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();
      const client = await getActiveClient(group.id);
      const link = await getProductLink(product.id);

      await testPrisma.order_sheet_items.create({
        data: {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      });

      const result = await repository.getProductsForSheet(
        sheet.id,
        product.master_product_group.category,
      );

      expect(result.some((item) => item.id === product.id)).toBe(true);
    });
  });

  describe('sheet product links', () => {
    it('createSheetProduct creates the pinned product link', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      const result = await repository.createSheetProduct({
        order_sheet_id: sheet.id,
        product_id: product.id,
        product_link_id: link.id,
        resolvedViaFallback: true,
      });

      expect(result.order_sheet_id).toBe(sheet.id);
      expect(result.product_id).toBe(product.id);
      expect(result.product_link_id).toBe(link.id);
      expect(result.resolved_via_fallback).toBe(true);
    });

    it('createSheetProduct does not overwrite an existing pinned link', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();

      const links = await testPrisma.master_product_link.findMany({
        where: { product_id: product.id },
        orderBy: { id: 'asc' },
        take: 2,
      });

      expect(links.length).toBeGreaterThanOrEqual(2);

      await repository.createSheetProduct({
        order_sheet_id: sheet.id,
        product_id: product.id,
        product_link_id: links[0].id,
      });

      const result = await repository.createSheetProduct({
        order_sheet_id: sheet.id,
        product_id: product.id,
        product_link_id: links[1].id,
      });

      expect(result.product_link_id).toBe(links[0].id);
    });

    it('getSheetProductLink returns the pinned link', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.createSheetProduct({
        order_sheet_id: sheet.id,
        product_id: product.id,
        product_link_id: link.id,
      });

      const result = await repository.getSheetProductLink(sheet.id, product.id);

      expect(result?.product_link_id).toBe(link.id);
    });

    it('deleteSheetProduct removes the sheet product link', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.createSheetProduct({
        order_sheet_id: sheet.id,
        product_id: product.id,
        product_link_id: link.id,
      });

      const result = await repository.deleteSheetProduct(sheet.id, product.id);

      expect(result.count).toBe(1);

      const persisted = await testPrisma.order_sheet_product.findUnique({
        where: {
          order_sheet_id_product_id: {
            order_sheet_id: sheet.id,
            product_id: product.id,
          },
        },
      });

      expect(persisted).toBeNull();
    });
  });

  describe('sheet item writes', () => {
    it('createSheetItems persists supplied rows', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      const result = await repository.createSheetItems([
        {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      ]);

      expect(result.count).toBe(1);

      const persisted = await testPrisma.order_sheet_items.findFirstOrThrow({
        where: {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_link_id: link.id,
        },
      });

      expect(persisted.ordered_qty).toEqual(new Prisma.Decimal(10));
    });

    it('createSheetItems skips duplicate rows', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      const data = {
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        ordered_qty: 10,
      };

      const first = await repository.createSheetItems([data]);
      const second = await repository.createSheetItems([data]);

      expect(first.count).toBe(1);
      expect(second.count).toBe(0);
    });

    it('deleteSheetItems deletes all items for the sheet and product', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.createSheetItems([
        {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      ]);

      const result = await repository.deleteSheetItems(sheet.id, product.id);

      expect(result.count).toBe(1);

      const remaining = await testPrisma.order_sheet_items.count({
        where: {
          order_sheet_id: sheet.id,
          product_id: product.id,
        },
      });

      expect(remaining).toBe(0);
    });

    it('findSheetItem returns the item using the product-link unique key', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.createSheetItems([
        {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 15,
        },
      ]);

      const result = await repository.findSheetItem(
        sheet.id,
        client.id,
        link.id,
      );

      expect(result?.ordered_qty).toEqual(new Prisma.Decimal(15));
      expect(result?.master_product.id).toBe(product.id);
      expect(result?.product_link.id).toBe(link.id);
    });

    it('findSheetItemByProduct returns the matching product item', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.createSheetItems([
        {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 15,
        },
      ]);

      const result = await repository.findSheetItemByProduct(
        sheet.id,
        client.id,
        product.id,
        testPrisma,
      );

      expect(result?.ordered_qty).toEqual(new Prisma.Decimal(15));
      expect(result?.master_product.id).toBe(product.id);
    });
  });

  describe('upsertSheetEntry', () => {
    it('creates an entry with only the supplied phase fields', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      const result = await repository.upsertSheetEntry({
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        ordered_qty: 10,
        night_selling_rate: 100,
      });

      expect(result.ordered_qty).toEqual(new Prisma.Decimal(10));
      expect(result.night_selling_rate).toEqual(new Prisma.Decimal(100));
      expect(result.delivered_qty).toBeNull();
      expect(result.final_bill_amount).toBeNull();
      expect(result.tray_type_id).toBeNull();
    });

    it('updates supplied fields without changing omitted fields', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.upsertSheetEntry({
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        ordered_qty: 10,
        delivered_qty: 8,
        night_selling_rate: 100,
      });

      const result = await repository.upsertSheetEntry({
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        ordered_qty: 12,
      });

      expect(result.ordered_qty).toEqual(new Prisma.Decimal(12));
      expect(result.delivered_qty).toEqual(new Prisma.Decimal(8));
      expect(result.night_selling_rate).toEqual(new Prisma.Decimal(100));
    });

    it('freezes tray_type_id after creation', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      const trayTypes = await testPrisma.master_tray_type.findMany({
        orderBy: { id: 'asc' },
        take: 2,
      });

      expect(trayTypes.length).toBeGreaterThanOrEqual(2);

      const first = await repository.upsertSheetEntry({
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        ordered_qty: 10,
        tray_type_id: trayTypes[0].id,
      });

      expect(first.tray_type_id).toBe(trayTypes[0].id);

      const second = await repository.upsertSheetEntry({
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        ordered_qty: 12,
        tray_type_id: trayTypes[1].id,
      });

      expect(second.tray_type_id).toBe(trayTypes[0].id);
    });
  });

  describe('validation queries', () => {
    it('getMorningValidationItems returns delivered quantities and product codes', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.upsertSheetEntry({
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        delivered_qty: 8,
      });

      const result = await repository.getMorningValidationItems(sheet.id);

      expect(result).toHaveLength(1);
      expect(result[0].delivered_qty).toEqual(new Prisma.Decimal(8));
      expect(result[0].master_product.code).toBe(product.code);
    });

    it('getQuantityValidationItems returns ordered and delivered quantities', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.upsertSheetEntry({
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
        product_link_id: link.id,
        ordered_qty: 10,
        delivered_qty: 8,
      });

      const result = await repository.getQuantityValidationItems(sheet.id);

      expect(result).toHaveLength(1);
      expect(result[0].ordered_qty).toEqual(new Prisma.Decimal(10));
      expect(result[0].delivered_qty).toEqual(new Prisma.Decimal(8));
    });
  });

  describe('product metadata', () => {
    it('getProductCategory returns the product category', async () => {
      const product = await getActiveProduct();

      const result = await repository.getProductCategory(product.id);

      expect(result).toBe(product.master_product_group.category);
    });

    it('getProductCategory throws for an unknown product', async () => {
      await expect(repository.getProductCategory(-1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('getProductWithGroup returns the product and group summary', async () => {
      const product = await getActiveProduct();

      const result = await repository.getProductWithGroup(product.id);

      expect(result.id).toBe(product.id);
      expect(result.master_product_group).toMatchObject({
        name: product.master_product_group.name,
        category: product.master_product_group.category,
      });
    });

    it('getProductWithGroup throws for an unknown product', async () => {
      await expect(repository.getProductWithGroup(-1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('getProductWithPackaging returns packaging information', async () => {
      const product = await getActiveProduct();

      const result = await repository.getProductWithPackaging(product.id);

      expect(result.id).toBe(product.id);
      expect(result.master_packaging_type).toBeDefined();
    });

    it('getProductWithPackaging throws for an unknown product', async () => {
      await expect(
        repository.getProductWithPackaging(-1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('commercial queries', () => {
    it('getGroupSupplyRules returns the active distributor rules', async () => {
      const group = await getActiveGroup();

      const result = await repository.getGroupSupplyRules(group.id);

      expect(result).toHaveProperty('milkDistributorId');
      expect(result).toHaveProperty('nonMilkDistributorId');
    });

    it('getProductLink returns the matching product link', async () => {
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      const result = await repository.getProductLink(
        link.distributor_id,
        product.id,
      );

      expect(result?.id).toBe(link.id);
      expect(result?.product_id).toBe(product.id);
      expect(result?.distributor_id).toBe(link.distributor_id);
    });

    it('getProductLinksBatch returns links keyed by distributor', async () => {
      const product = await getActiveProduct();

      const links = await testPrisma.master_product_link.findMany({
        where: { product_id: product.id },
        orderBy: { id: 'asc' },
      });

      expect(links.length).toBeGreaterThan(0);

      const result = await repository.getProductLinksBatch(
        links.map((link) => link.distributor_id),
        product.id,
      );

      expect(result.size).toBeGreaterThan(0);

      for (const link of links) {
        expect(result.get(link.distributor_id)?.id).toBe(link.id);
      }
    });

    it('getSheetCommercialContext returns group session and paper sale date', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);

      const result = await repository.getSheetCommercialContext(sheet.id);

      expect(result?.id).toBe(sheet.id);
      expect(result?.group_id).toBe(group.id);
      expect(result?.master_group.delivery_session).toBe(
        group.delivery_session,
      );
      expect(result?.order_paper.sale_date.toISOString()).toBe(
        paper.sale_date.toISOString(),
      );
    });
  });

  describe('selling rates', () => {
    const createdDistributorRateIds: number[] = [];
    const createdClientRateIds: number[] = [];

    afterEach(async () => {
      if (createdClientRateIds.length > 0) {
        await testPrisma.master_client_rate_product.deleteMany({
          where: {
            id: {
              in: createdClientRateIds,
            },
          },
        });

        createdClientRateIds.length = 0;
      }

      if (createdDistributorRateIds.length > 0) {
        await testPrisma.distributor_product_rate.deleteMany({
          where: {
            id: {
              in: createdDistributorRateIds,
            },
          },
        });

        createdDistributorRateIds.length = 0;
      }
    });

    it('getSellingRate prefers the applicable client rate', async () => {
      const group = await getActiveGroup();
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);
      const effectiveDate = new Date('2027-06-01T00:00:00.000Z');

      const distributorRate = await testPrisma.distributor_product_rate.create({
        data: {
          product_link_id: link.id,
          purchase_rate: 80,
          selling_rate: 100,
          effective_from: effectiveDate,
          effective_to: null,
          is_active: true,
        },
      });

      createdDistributorRateIds.push(distributorRate.id);

      const clientRate = await testPrisma.master_client_rate_product.create({
        data: {
          client_id: client.id,
          product_link_id: link.id,
          selling_rate: 125,
          effective_from: effectiveDate,
          effective_to: null,
          is_active: true,
        },
      });

      createdClientRateIds.push(clientRate.id);

      const result = await repository.getSellingRate(
        client.id,
        link.id,
        effectiveDate,
      );

      expect(result).toEqual(clientRate.selling_rate);
      expect(distributorRate.selling_rate).not.toEqual(result);
    });

    it('getSellingRate falls back to distributor rate when no client rate applies', async () => {
      const group = await getActiveGroup();
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);
      const client = await getActiveClient(group.id);

      const effectiveDate = new Date('2025-01-01T00:00:00.000Z');

      const rate = await testPrisma.distributor_product_rate.create({
        data: {
          product_link_id: link.id,
          purchase_rate: 80,
          selling_rate: 111,
          effective_from: effectiveDate,
          effective_to: null,
          is_active: true,
        },
      });

      createdDistributorRateIds.push(rate.id);

      const result = await repository.getSellingRate(
        client.id,
        link.id,
        effectiveDate,
      );

      expect(result).toEqual(rate.selling_rate);
    });

    it('getSellingRate throws when no distributor rate applies', async () => {
      const group = await getActiveGroup();
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      const effectiveDate = new Date('2025-01-01T00:00:00.000Z');

      const clients = await testPrisma.master_client.findMany({
        where: {
          delivery_group_id: group.id,
          is_active: true,
        },
      });

      let clientId: number | undefined;

      for (const client of clients) {
        const clientRate =
          await testPrisma.master_client_rate_product.findFirst({
            where: {
              client_id: client.id,
              product_link_id: link.id,
              is_active: true,
              effective_from: {
                lte: effectiveDate,
              },
              OR: [
                { effective_to: null },
                { effective_to: { gte: effectiveDate } },
              ],
            },
          });

        if (!clientRate) {
          clientId = client.id;
          break;
        }
      }

      expect(clientId).toBeDefined();

      await expect(
        repository.getSellingRate(clientId!, link.id, effectiveDate),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('getSellingRateForDistributor resolves the product link then the rate', async () => {
      const group = await getActiveGroup();
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);
      const client = await getActiveClient(group.id);

      const effectiveDate = new Date('2027-08-01T00:00:00.000Z');

      const result = await repository.getSellingRateForDistributor(
        client.id,
        product.id,
        link.distributor_id,
        effectiveDate,
      );

      expect(result).toEqual(new Prisma.Decimal(125));
    });

    it('getSellingRateForDistributor throws when the product link does not exist', async () => {
      const group = await getActiveGroup();
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();

      await expect(
        repository.getSellingRateForDistributor(
          client.id,
          product.id,
          -1,
          new Date('2040-02-01T00:00:00.000Z'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('getSellingRatesBatch prefers client rates and falls back to distributor rates', async () => {
      const group = await getActiveGroup();
      const client = await getActiveClient(group.id);

      const productWithClientRate = await getActiveProduct();

      const clientRateLink = await getProductLink(productWithClientRate.id);

      const effectiveDate = new Date('2026-01-01T00:00:00.000Z');

      const result = await repository.getSellingRatesBatch(
        [
          {
            clientId: client.id,
            productLinkId: clientRateLink.id,
          },
          {
            clientId: client.id,
            productLinkId: 7,
          },
        ],
        effectiveDate,
        testPrisma,
      );

      expect(result.get(`${client.id}_${clientRateLink.id}`)).toEqual(
        new Prisma.Decimal(25),
      );

      expect(result.get(`${client.id}_7`)).toEqual(new Prisma.Decimal(28.2));
    });
  });

  describe('getEligibleDistributorsForProduct', () => {
    it('returns eligible distributors ordered by priority with the primary distributor at priority zero', async () => {
      const group = await getActiveGroup();
      const product = await getActiveProduct();

      const procurementRules =
        await testPrisma.distributor_procurement_rule.findMany({
          where: {
            category: product.master_product_group.category,
            is_active: true,
            brand_id: product.brand_id,
            product_group_id: product.product_group_id,
          },
          orderBy: { distributor_id: 'asc' },
        });

      expect(procurementRules.length).toBeGreaterThan(0);

      const primaryDistributorId = procurementRules[0].distributor_id;

      const result = await repository.getEligibleDistributorsForProduct(
        group.id,
        product.id,
        product.brand_id,
        product.product_group_id,
        product.master_product_group.category,
        primaryDistributorId,
      );

      expect(result.length).toBeGreaterThan(0);
      expect(
        result.some((item) => item.distributorId === primaryDistributorId),
      ).toBe(true);

      const primary = result.find(
        (item) => item.distributorId === primaryDistributorId,
      );

      expect(primary?.priority).toBe(0);

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].priority).toBeLessThanOrEqual(result[i].priority);
      }
    });

    it('returns an empty array when no procurement rule exists', async () => {
      const group = await getActiveGroup();
      const product = await getActiveProduct();

      const rules = await testPrisma.distributor_procurement_rule.findMany({
        where: {
          category: product.master_product_group.category,
          brand_id: product.brand_id,
          product_group_id: product.product_group_id,
        },
      });

      const activeRuleIds = rules
        .filter((rule) => rule.is_active)
        .map((rule) => rule.id);

      try {
        if (activeRuleIds.length) {
          await testPrisma.distributor_procurement_rule.updateMany({
            where: { id: { in: activeRuleIds } },
            data: { is_active: false },
          });
        }

        const result = await repository.getEligibleDistributorsForProduct(
          group.id,
          product.id,
          product.brand_id,
          product.product_group_id,
          product.master_product_group.category,
          -1,
        );

        expect(result).toEqual([]);
      } finally {
        if (activeRuleIds.length) {
          await testPrisma.distributor_procurement_rule.updateMany({
            where: { id: { in: activeRuleIds } },
            data: { is_active: true },
          });
        }
      }
    });
  });

  describe('batch queries', () => {
    it('findSheetItemsByProductBatch returns a map keyed by client and product', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const client = await getActiveClient(group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.createSheetItems([
        {
          order_sheet_id: sheet.id,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      ]);

      const result = await repository.findSheetItemsByProductBatch(
        sheet.id,
        [{ clientId: client.id, productId: product.id }],
        testPrisma,
      );

      const item = result.get(`${client.id}_${product.id}`);

      expect(item?.ordered_qty).toEqual(new Prisma.Decimal(10));
    });

    it('getSheetProductLinksBatch returns links keyed by product', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);
      const product = await getActiveProduct();
      const link = await getProductLink(product.id);

      await repository.createSheetProduct({
        order_sheet_id: sheet.id,
        product_id: product.id,
        product_link_id: link.id,
      });

      const result = await repository.getSheetProductLinksBatch(
        sheet.id,
        [product.id],
        testPrisma,
      );

      expect(result.get(product.id)?.product_link_id).toBe(link.id);
    });

    it('getProductsWithPackagingBatch returns products keyed by product id', async () => {
      const product = await getActiveProduct();

      const result = await repository.getProductsWithPackagingBatch(
        [product.id],
        testPrisma,
      );

      expect(result.get(product.id)?.id).toBe(product.id);
      expect(result.get(product.id)?.master_packaging_type).toBeDefined();
    });
  });

  describe('markOrderMorningEntrySaved', () => {
    it('sets order_morning_entry_saved_at', async () => {
      const paper = await createPaper();
      const group = await getActiveGroup();
      const sheet = await createSheet(paper.id, group.id);

      const before = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheet.id },
      });

      expect(before.order_morning_entry_saved_at).toBeNull();

      const result = await repository.markOrderMorningEntrySaved(sheet.id);

      expect(result.order_morning_entry_saved_at).not.toBeNull();

      const persisted = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheet.id },
      });

      expect(persisted.order_morning_entry_saved_at).not.toBeNull();
    });
  });

  describe('resolved_via_fallback persistence (seed fixture D4/group 10)', () => {
    it('persists resolved_via_fallback=true when the primary distributor has no link and a lower-priority distributor is used', async () => {
      const paper = await createPaper('2027-01-20T00:00:00.000Z');

      const group10 = await testPrisma.master_group.findFirstOrThrow({
        where: { name: 'Group 10' },
      });

      const sheet = await createSheet(paper.id, group10.id);

      // Group 10's primary MILK distributor is distributorB, which has no
      // product link for any Shakti product. distributorA is the seeded
      // priority-1 alternate and does have the link.
      const shaTonedProduct = await testPrisma.master_product.findFirstOrThrow({
        where: { code: 'SHA-TONED-500' },
      });

      const distributorA = await testPrisma.master_distributor.findFirstOrThrow(
        {
          where: { name: 'Distributor A' },
        },
      );

      const expectedLink =
        await testPrisma.master_product_link.findFirstOrThrow({
          where: {
            product_id: shaTonedProduct.id,
            distributor_id: distributorA.id,
          },
        });

      const result = await repository.createSheetProduct({
        order_sheet_id: sheet.id,
        product_id: shaTonedProduct.id,
        product_link_id: expectedLink.id,
        resolvedViaFallback: true,
      });

      expect(result.resolved_via_fallback).toBe(true);
      expect(result.product_link_id).toBe(expectedLink.id);

      const persisted = await testPrisma.order_sheet_product.findUniqueOrThrow({
        where: {
          order_sheet_id_product_id: {
            order_sheet_id: sheet.id,
            product_id: shaTonedProduct.id,
          },
        },
      });

      expect(persisted.resolved_via_fallback).toBe(true);
    });
  });
});
