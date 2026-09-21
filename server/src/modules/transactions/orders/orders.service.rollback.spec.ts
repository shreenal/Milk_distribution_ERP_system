import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';

import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';
import { OrdersBuilder } from './order.builder.js';
import { OrdersValidationService } from './services/orders-validation.service.js';
import { OrderCommercialService } from './services/order-commercial.service.js';
import { BillingService } from './services/billing.service.js';
import { NightBillingService } from './services/night-billing.service.js';
import { FinalBillingService } from './services/final-billing.service.js';

import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';

import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';

import { OrderPaperStatus } from '../../../generated/prisma/client.js';

describe('OrdersService rollback (integration)', () => {
  const ordersRepository = new OrdersRepository(testPrisma);

  let service: OrdersService;

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetPaperData();

    const trayCalculationService = new TrayCalculationService(testPrisma);

    const nightBillingService = new NightBillingService();

    const finalBillingService = new FinalBillingService();

    const orderCommercialService = new OrderCommercialService(
      ordersRepository,
    );

    const billingService = new BillingService(
      ordersRepository,
      orderCommercialService,
      nightBillingService,
      finalBillingService,
      trayCalculationService,
    );

    service = new OrdersService(
      ordersRepository,
      {} as OrdersBuilder,
      {} as OrdersValidationService,
      orderCommercialService,
      billingService,
      testPrisma,
      {} as WorkflowStateService,
      {} as WorkflowBuilder,
      {} as DependencyOrchestratorService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  it('rolls back night entries and a newly created product pin when the write fails', async () => {
    /*
     * Create a real paper.
     */
    const paper = await testPrisma.order_paper.create({
      data: {
        order_date: new Date('2026-09-10T00:00:00.000Z'),
        sale_date: new Date('2026-09-10T00:00:00.000Z'),
        status: OrderPaperStatus.DRAFT,
      },
    });

    /*
     * Create a real order sheet.
     */
    const group = await testPrisma.master_group.findFirst({
      where: {
        is_active: true,
      },
    });

    expect(group).not.toBeNull();

    await testPrisma.order_sheet.create({
      data: {
        order_paper_id: paper.id,
        group_id: group!.id,
      },
    });

    const sheet = await testPrisma.order_sheet.findFirst({
      where: {
        order_paper_id: paper.id,
      },
    });

    expect(sheet).not.toBeNull();

    /*
     * Use known valid seed client/product data.
     */
    const client = await testPrisma.master_client.findFirst({
      where: {
        code: 'C001',
      },
    });

    const product = await testPrisma.master_product.findFirst({
      where: {
        code: 'GOV-COW-500',
      },
    });

    expect(client).not.toBeNull();
    expect(product).not.toBeNull();

    /*
     * Make sure this product does NOT already have a sheet-level pin.
     * The test needs BillingService to create the pin inside the
     * transaction.
     */
    const existingSheetProduct =
      await testPrisma.order_sheet_product.findFirst({
        where: {
          order_sheet_id: sheet!.id,
          product_id: product!.id,
        },
      });

    expect(existingSheetProduct).toBeNull();

    /*
     * Rebuild the service using real BillingService dependencies.
     */
    const trayCalculationService = new TrayCalculationService(testPrisma);

    const nightBillingService = new NightBillingService();

    const finalBillingService = new FinalBillingService();

    const orderCommercialService = new OrderCommercialService(
      ordersRepository,
    );

    const billingService = new BillingService(
      ordersRepository,
      orderCommercialService,
      nightBillingService,
      finalBillingService,
      trayCalculationService,
    );

    service = new OrdersService(
      ordersRepository,
      {} as any,
      new OrdersValidationService(ordersRepository) as any,
      orderCommercialService,
      billingService,
      testPrisma,
      {
        canEditNightEntries: vi.fn().mockReturnValue(true),
        canEditMorningEntries: vi.fn().mockReturnValue(true),
      } as any,
      {} as any,
      {
        execute: vi.fn().mockResolvedValue(undefined),
      } as any,
    );

    /*
     * Allow the REAL upsert to execute against the transaction client,
     * then throw.
     *
     * This means the DB write really happened before the transaction
     * was forced to fail.
     */
    const originalUpsertSheetEntry =
      ordersRepository.upsertSheetEntry.bind(ordersRepository);

    const upsertSheetEntrySpy = vi
      .spyOn(ordersRepository, 'upsertSheetEntry')
      .mockImplementation(async (...args) => {
        const result = await originalUpsertSheetEntry(...args);

        throw new Error('forced night-entry failure');

        return result;
      });

    const entries = [
      {
        clientId: client!.id,
        productId: product!.id,
        orderedQty: 10,
      },
    ];

    await expect(
      service.saveNightEntriesService(sheet!.id, entries),
    ).rejects.toThrow('forced night-entry failure');

    /*
     * Fresh reads outside the failed transaction.
     *
     * The order item must not exist.
     */
    const persistedItems = await testPrisma.order_sheet_items.findMany({
      where: {
        order_sheet_id: sheet!.id,
      },
    });

    expect(persistedItems).toHaveLength(0);

    /*
     * The newly-created sheet product pin must also have disappeared.
     *
     * This is explicitly required by the testing plan.
     */
    const persistedPins = await testPrisma.order_sheet_product.findMany({
      where: {
        order_sheet_id: sheet!.id,
        product_id: product!.id,
      },
    });

    expect(persistedPins).toHaveLength(0);

    expect(upsertSheetEntrySpy).toHaveBeenCalled();
  });

  it('rolls back morning entry updates and morning-saved timestamp when a later write fails', async () => {
    /*
     * Create a real paper in NIGHT_SUBMITTED.
     */
    const paper = await testPrisma.order_paper.create({
      data: {
        order_date: new Date('2026-09-10T00:00:00.000Z'),
        sale_date: new Date('2026-09-10T00:00:00.000Z'),
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      },
    });

    const group = await testPrisma.master_group.findFirst({
      where: {
        is_active: true,
      },
    });

    expect(group).not.toBeNull();

    await testPrisma.order_sheet.create({
      data: {
        order_paper_id: paper.id,
        group_id: group!.id,
      },
    });

    const sheet = await testPrisma.order_sheet.findFirst({
      where: {
        order_paper_id: paper.id,
      },
    });

    expect(sheet).not.toBeNull();

    const client = await testPrisma.master_client.findFirst({
      where: {
        code: 'C001',
      },
    });

    const product = await testPrisma.master_product.findFirst({
      where: {
        code: 'GOV-COW-500',
      },
    });

    expect(client).not.toBeNull();
    expect(product).not.toBeNull();

    const productLink = await testPrisma.master_product_link.findFirst({
      where: {
        product_id: product!.id,
        is_active: true,
      },
    });

    expect(productLink).not.toBeNull();

    /*
     * Create the sheet-level product pin.
     */
    await testPrisma.order_sheet_product.create({
      data: {
        order_sheet_id: sheet!.id,
        product_id: product!.id,
        product_link_id: productLink!.id,
        resolved_via_fallback: false,
      },
    });

    /*
     * Create the existing ordered item that morning entry will update.
     */
    await testPrisma.order_sheet_items.create({
      data: {
        order_sheet_id: sheet!.id,
        client_id: client!.id,
        product_id: product!.id,
        product_link_id: productLink!.id,
        ordered_qty: 10,
        delivered_qty: 0,
      },
    });

    const before = await testPrisma.order_sheet_items.findUnique({
      where: {
        order_sheet_id_client_id_product_link_id: {
          order_sheet_id: sheet!.id,
          client_id: client!.id,
          product_link_id: productLink!.id,
        },
      },
    });

    expect(before).not.toBeNull();
    expect(Number(before!.delivered_qty)).toBe(0);

    const beforeSheet = await testPrisma.order_sheet.findUnique({
      where: {
        id: sheet!.id,
      },
      select: {
        order_morning_entry_saved_at: true,
      },
    });

    expect(beforeSheet?.order_morning_entry_saved_at).toBeNull();

    /*
     * Create real BillingService dependencies.
     */
    const trayCalculationService = new TrayCalculationService(testPrisma);

    const nightBillingService = new NightBillingService();

    const finalBillingService = new FinalBillingService();

    const orderCommercialService = new OrderCommercialService(
      ordersRepository,
    );

    const billingService = new BillingService(
      ordersRepository,
      orderCommercialService,
      nightBillingService,
      finalBillingService,
      trayCalculationService,
    );

    /*
     * Force the real morning batch to perform its DB update and then
     * fail before OrdersService can mark the morning entry as saved.
     */
    const originalSaveMorningEntriesBatch =
      billingService.saveMorningEntriesBatch.bind(billingService);

    const saveMorningEntriesBatchSpy = vi
      .spyOn(billingService, 'saveMorningEntriesBatch')
      .mockImplementation(async (...args) => {
        await originalSaveMorningEntriesBatch(...args);

        throw new Error('forced morning-entry failure');
      });

    service = new OrdersService(
      ordersRepository,
      {} as any,
      new OrdersValidationService(ordersRepository) as any,
      orderCommercialService,
      billingService,
      testPrisma,
      {
        canEditNightEntries: vi.fn().mockReturnValue(true),
        canEditMorningEntries: vi.fn().mockReturnValue(true),
      } as any,
      {} as any,
      {
        execute: vi.fn().mockResolvedValue(undefined),
      } as any,
    );

    const entries = [
      {
        clientId: client!.id,
        productId: product!.id,
        deliveredQty: 5,
      },
    ];

    await expect(
      service.saveMorningEntriesService(sheet!.id, entries),
    ).rejects.toThrow('forced morning-entry failure');

    /*
     * The delivered quantity must have been rolled back.
     */
    const persistedItem = await testPrisma.order_sheet_items.findUnique({
      where: {
        order_sheet_id_client_id_product_link_id: {
          order_sheet_id: sheet!.id,
          client_id: client!.id,
          product_link_id: productLink!.id,
        },
      },
    });

    expect(persistedItem).not.toBeNull();

    expect(Number(persistedItem!.ordered_qty)).toBe(
      Number(before!.ordered_qty),
    );

    expect(Number(persistedItem!.delivered_qty)).toBe(
      Number(before!.delivered_qty),
    );

    expect(Number(persistedItem!.final_selling_rate)).toBe(
      Number(before!.final_selling_rate),
    );

    expect(Number(persistedItem!.final_gst_amount)).toBe(
      Number(before!.final_gst_amount),
    );

    expect(Number(persistedItem!.final_taxable_amount)).toBe(
      Number(before!.final_taxable_amount),
    );

    expect(Number(persistedItem!.final_bill_amount)).toBe(
      Number(before!.final_bill_amount),
    );

    /*
     * markOrderMorningEntrySaved() occurs after BillingService returns.
     * Because BillingService threw, it must never persist.
     */
    const afterSheet = await testPrisma.order_sheet.findUnique({
      where: {
        id: sheet!.id,
      },
      select: {
        order_morning_entry_saved_at: true,
      },
    });

    expect(afterSheet?.order_morning_entry_saved_at).toBe(
      beforeSheet?.order_morning_entry_saved_at,
    );

    expect(saveMorningEntriesBatchSpy).toHaveBeenCalled();
  });

  it('rolls back ALL entries in a multi-entry night-save batch when a later entry fails, including an already-written earlier entry', async () => {
    const paper = await testPrisma.order_paper.create({
      data: {
        order_date: new Date('2026-09-11T00:00:00.000Z'),
        sale_date: new Date('2026-09-11T00:00:00.000Z'),
        status: OrderPaperStatus.DRAFT,
      },
    });

    const group = await testPrisma.master_group.findFirst({ where: { is_active: true } });
    expect(group).not.toBeNull();

    await testPrisma.order_sheet.create({
      data: { order_paper_id: paper.id, group_id: group!.id },
    });

    const sheet = await testPrisma.order_sheet.findFirst({
      where: { order_paper_id: paper.id },
    });
    expect(sheet).not.toBeNull();

    const client = await testPrisma.master_client.findFirst({ where: { code: 'C001' } });
    const productOne = await testPrisma.master_product.findFirst({ where: { code: 'GOV-COW-500' } });
    const productTwo = await testPrisma.master_product.findFirst({ where: { code: 'GOV-COW-1000' } });

    expect(client).not.toBeNull();
    expect(productOne).not.toBeNull();
    expect(productTwo).not.toBeNull();

    const trayCalculationService = new TrayCalculationService(testPrisma);
    const nightBillingService = new NightBillingService();
    const finalBillingService = new FinalBillingService();
    const orderCommercialService = new OrderCommercialService(ordersRepository);

    const billingService = new BillingService(
      ordersRepository,
      orderCommercialService,
      nightBillingService,
      finalBillingService,
      trayCalculationService,
    );

    service = new OrdersService(
      ordersRepository,
      {} as any,
      new OrdersValidationService(ordersRepository) as any,
      orderCommercialService,
      billingService,
      testPrisma,
      {
        canEditNightEntries: vi.fn().mockReturnValue(true),
        canEditMorningEntries: vi.fn().mockReturnValue(true),
      } as any,
      {} as any,
      { execute: vi.fn().mockResolvedValue(undefined) } as any,
    );

    // Let entry 1's real upsertSheetEntry call succeed; force failure on the
    // SECOND call (entry 2), after entry 1 has genuinely been written.
    const originalUpsertSheetEntry =
      ordersRepository.upsertSheetEntry.bind(ordersRepository);

    let callCount = 0;

    vi.spyOn(ordersRepository, 'upsertSheetEntry').mockImplementation(
      async (...args) => {
        callCount += 1;
        const result = await originalUpsertSheetEntry(...args);
        if (callCount === 2) {
          throw new Error('forced failure on second entry');
        }
        return result;
      },
    );

    const entries = [
      { clientId: client!.id, productId: productOne!.id, orderedQty: 10 },
      { clientId: client!.id, productId: productTwo!.id, orderedQty: 5 },
    ];

    await expect(
      service.saveNightEntriesService(sheet!.id, entries),
    ).rejects.toThrow('forced failure on second entry');

    // BOTH entries must be gone — including entry 1, which was written
    // successfully before entry 2 failed.
    const persistedItems = await testPrisma.order_sheet_items.findMany({
      where: { order_sheet_id: sheet!.id },
    });
    expect(persistedItems).toHaveLength(0);

    const persistedPins = await testPrisma.order_sheet_product.findMany({
      where: {
        order_sheet_id: sheet!.id,
        product_id: { in: [productOne!.id, productTwo!.id] },
      },
    });
    expect(persistedPins).toHaveLength(0);

    expect(callCount).toBe(2);
  });
});

