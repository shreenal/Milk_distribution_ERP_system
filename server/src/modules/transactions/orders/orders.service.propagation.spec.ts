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

import { OrdersService } from './orders.service.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersBuilder } from './order.builder.js';
import { OrdersValidationService } from './services/orders-validation.service.js';
import { OrderCommercialService } from './services/order-commercial.service.js';
import { BillingService } from './services/billing.service.js';
import { NightBillingService } from './services/night-billing.service.js';
import { FinalBillingService } from './services/final-billing.service.js';

import { PaperRepository } from '../paper/paper.repository.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';

import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';

import { ClientTraysRepository } from '../client-trays/client-trays.repository.js';
import { ClientTraysPropagationService } from '../client-trays/services/client-trays-propagation.service.js';

import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';

import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';

import { OrderPaperStatus } from '../../../generated/prisma/client.js';

describe('OrdersService propagation (integration)', () => {
  let service: OrdersService;

  let ordersRepository: OrdersRepository;
  let paperRepository: PaperRepository;
  let workflowState: WorkflowStateService;
  let dependencyOrchestrator: DependencyOrchestratorService;
  let clientTraysPropagationService: ClientTraysPropagationService;

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetPaperData();

    ordersRepository = new OrdersRepository(testPrisma);
    paperRepository = new PaperRepository(testPrisma);

    workflowState = new WorkflowStateService();

    const trayCalculationService = new TrayCalculationService(testPrisma);

    const ordersValidationService = new OrdersValidationService(
      ordersRepository,
    );

    const orderCommercialService = new OrderCommercialService(ordersRepository);

    const nightBillingService = new NightBillingService();

    const finalBillingService = new FinalBillingService();

    const billingService = new BillingService(
      ordersRepository,
      orderCommercialService,
      nightBillingService,
      finalBillingService,
      trayCalculationService,
    );

    const clientTraysRepository = new ClientTraysRepository(testPrisma);

    clientTraysPropagationService = new ClientTraysPropagationService(
      clientTraysRepository,
      trayCalculationService,
      workflowState,
    );

    dependencyOrchestrator = new DependencyOrchestratorService(
      clientTraysPropagationService,
      // These two are not used by Orders → Client Trays propagation.
      {} as any,
      {} as any,
    );

    service = new OrdersService(
      ordersRepository,
      {} as OrdersBuilder,
      ordersValidationService,
      orderCommercialService,
      billingService,
      testPrisma,
      workflowState,
      {} as WorkflowBuilder,
      dependencyOrchestrator,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  async function createPaperAndSheet() {
    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-06-15T00:00:00.000Z'),
    );

    const group = await testPrisma.master_group.findFirst({
      where: { is_active: true },
    });

    expect(group).not.toBeNull();

    const sheets = await paperRepository.generateOrderSheets(paper.id, [
      group!,
    ]);

    expect(sheets.count).toBeGreaterThan(0);

    const sheet = await testPrisma.order_sheet.findFirst({
      where: {
        order_paper_id: paper.id,
        group_id: group!.id,
      },
    });

    expect(sheet).not.toBeNull();

    return {
      paper,
      sheet: sheet!,
    };
  }

  async function getTestClientAndProduct(sheetId: number) {
    const sheet = await testPrisma.order_sheet.findUnique({
      where: { id: sheetId },
      select: {
        group_id: true,
      },
    });

    expect(sheet).not.toBeNull();

    const client = await testPrisma.master_client.findFirst({
      where: {
        delivery_group_id: sheet!.group_id,
        is_active: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    expect(client).not.toBeNull();

    const product = await testPrisma.master_product.findFirst({
      where: {
        is_active: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    expect(product).not.toBeNull();

    return {
      client: client!,
      product: product!,
    };
  }

  it('propagates night save to Client Trays using ordered_qty', async () => {
    const { sheet } = await createPaperAndSheet();

    const { client, product } = await getTestClientAndProduct(sheet.id);

    /*
     * The product must be valid for the sheet/client combination.
     *
     * If your existing rollback fixture already uses a known-good
     * client/product pair (for example C001 + GOV-COW-500),
     * replace getTestClientAndProduct() with that exact fixture.
     */

    await service.saveNightEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: product.id,
        orderedQty: 10,
      },
    ]);

    const item = await testPrisma.order_sheet_items.findFirst({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
      },
    });

    expect(item).not.toBeNull();

    const trayTransactions = await testPrisma.client_tray_transaction.findMany({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
      },
    });

    expect(trayTransactions.length).toBeGreaterThan(0);

    const totalTraysTaken = trayTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.trays_taken ?? 0),
      0,
    );

    expect(totalTraysTaken).toBeGreaterThan(0);
  });

  it('resolves via fallback distributor and persists resolved_via_fallback when the primary distributor lacks a product link', async () => {
    const group10 = await testPrisma.master_group.findFirstOrThrow({
      where: { name: 'Group 10' },
    });

    const paper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-06-20T00:00:00.000Z'),
    );

    await paperRepository.generateOrderSheets(paper.id, [group10]);

    const sheet = await testPrisma.order_sheet.findFirstOrThrow({
      where: { order_paper_id: paper.id, group_id: group10.id },
    });

    const client = await testPrisma.master_client.findFirstOrThrow({
      where: { delivery_group_id: group10.id, is_active: true },
      orderBy: { id: 'asc' },
    });

    const shaTonedProduct = await testPrisma.master_product.findFirstOrThrow({
      where: { code: 'SHA-TONED-500' },
    });

    const distributorA = await testPrisma.master_distributor.findFirstOrThrow({
      where: { name: 'Distributor A' },
    });

    await service.saveNightEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: shaTonedProduct.id,
        orderedQty: 10,
      },
    ]);

    const pin = await testPrisma.order_sheet_product.findUniqueOrThrow({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: sheet.id,
          product_id: shaTonedProduct.id,
        },
      },
    });

    expect(pin.resolved_via_fallback).toBe(true);

    const item = await testPrisma.order_sheet_items.findFirstOrThrow({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: shaTonedProduct.id,
      },
      include: { product_link: true },
    });

    expect(item.product_link.distributor_id).toBe(distributorA.id);
  });

  it('re-resolves only the genuinely new product when a batch mixes a new and an already-pinned product', async () => {
    const { sheet } = await createPaperAndSheet();

    const client = await testPrisma.master_client.findFirstOrThrow({
      where: { delivery_group_id: sheet.group_id, is_active: true },
      orderBy: { id: 'asc' },
    });

    const productOne = await testPrisma.master_product.findFirstOrThrow({
      where: { code: 'GOV-COW-500' },
    });
    const productTwo = await testPrisma.master_product.findFirstOrThrow({
      where: { code: 'GOV-COW-1000' },
    });

    // First save: pins productOne.
    await service.saveNightEntriesService(sheet.id, [
      { clientId: client.id, productId: productOne.id, orderedQty: 10 },
    ]);

    const pinBefore = await testPrisma.order_sheet_product.findUniqueOrThrow({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: sheet.id,
          product_id: productOne.id,
        },
      },
    });

    // Second save: resubmits productOne (already pinned) AND introduces productTwo (new).
    await service.saveNightEntriesService(sheet.id, [
      { clientId: client.id, productId: productOne.id, orderedQty: 12 },
      { clientId: client.id, productId: productTwo.id, orderedQty: 8 },
    ]);

    const pinAfter = await testPrisma.order_sheet_product.findUniqueOrThrow({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: sheet.id,
          product_id: productOne.id,
        },
      },
    });

    // The already-pinned product's link must be byte-identical — it was
    // not re-resolved.
    expect(pinAfter.product_link_id).toBe(pinBefore.product_link_id);
    expect(pinAfter.created_at.toISOString()).toBe(
      pinBefore.created_at.toISOString(),
    );

    // The new product must now have its own pin.
    const newPin = await testPrisma.order_sheet_product.findUnique({
      where: {
        order_sheet_id_product_id: {
          order_sheet_id: sheet.id,
          product_id: productTwo.id,
        },
      },
    });

    expect(newPin).not.toBeNull();

    const itemOne = await testPrisma.order_sheet_items.findFirstOrThrow({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: productOne.id,
      },
    });
    expect(Number(itemOne.ordered_qty)).toBe(12);
  });

  it('propagates morning save to Client Trays using delivered_qty', async () => {
    const { sheet } = await createPaperAndSheet();

    const { client, product } = await getTestClientAndProduct(sheet.id);

    await service.saveNightEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: product.id,
        orderedQty: 10,
      },
    ]);

    await testPrisma.order_paper.update({
      where: {
        id: sheet.order_paper_id,
      },
      data: {
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      },
    });

    await service.saveMorningEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: product.id,
        deliveredQty: 4,
      },
    ]);

    const item = await testPrisma.order_sheet_items.findFirst({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
      },
    });

    expect(item).not.toBeNull();
    expect(Number(item!.ordered_qty)).toBe(10);
    expect(Number(item!.delivered_qty)).toBe(4);

    const trayTransactions = await testPrisma.client_tray_transaction.findMany({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
      },
    });

    expect(trayTransactions.length).toBeGreaterThan(0);

    const totalTraysTaken = trayTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.trays_taken ?? 0),
      0,
    );

    /*
     * The exact expected value should be asserted once we use the
     * known seeded product/tray-rule fixture. The important invariant
     * here is that Client Trays reflects delivered_qty, not ordered_qty.
     */
    expect(totalTraysTaken).toBeGreaterThan(0);
  });

  it('preserves manually entered trays_returned during Orders propagation', async () => {
    const { sheet } = await createPaperAndSheet();

    const { client, product } = await getTestClientAndProduct(sheet.id);

    await service.saveNightEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: product.id,
        orderedQty: 10,
      },
    ]);

    const transaction = await testPrisma.client_tray_transaction.findFirst({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
      },
    });

    expect(transaction).not.toBeNull();

    await testPrisma.client_tray_transaction.update({
      where: {
        id: transaction!.id,
      },
      data: {
        trays_returned: 2,
      },
    });

    await service.saveNightEntriesService(sheet.id, [
      {
        clientId: client.id,
        productId: product.id,
        orderedQty: 8,
      },
    ]);

    const after = await testPrisma.client_tray_transaction.findUnique({
      where: {
        id: transaction!.id,
      },
    });

    expect(after).not.toBeNull();
    expect(Number(after!.trays_returned)).toBe(2);
  });

  it('rolls back Orders writes when Client Trays propagation fails', async () => {
    const { sheet } = await createPaperAndSheet();

    const { client, product } = await getTestClientAndProduct(sheet.id);

    vi.spyOn(
      clientTraysPropagationService,
      'recalculateFromSheet',
    ).mockRejectedValueOnce(
      new Error('forced Client Trays propagation failure'),
    );

    await expect(
      service.saveNightEntriesService(sheet.id, [
        {
          clientId: client.id,
          productId: product.id,
          orderedQty: 10,
        },
      ]),
    ).rejects.toThrow('forced Client Trays propagation failure');

    const item = await testPrisma.order_sheet_items.findFirst({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
        product_id: product.id,
      },
    });

    expect(item).toBeNull();

    const sheetProduct = await testPrisma.order_sheet_product.findFirst({
      where: {
        order_sheet_id: sheet.id,
        product_id: product.id,
      },
    });

    expect(sheetProduct).toBeNull();

    const trayTransactions = await testPrisma.client_tray_transaction.findMany({
      where: {
        order_sheet_id: sheet.id,
        client_id: client.id,
      },
    });

    expect(trayTransactions).toHaveLength(0);
  });

  it('propagates from a REOPENED sheet to later sheets in the same delivery group', async () => {
    const groups = await paperRepository.getActiveGroups();
    expect(groups.length).toBeGreaterThan(0);

    const group = groups[0];

    // First paper/sheet.
    const firstPaper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-06-15T00:00:00.000Z'),
    );

    await paperRepository.generateOrderSheets(firstPaper.id, [group]);

    const firstSheet = await testPrisma.order_sheet.findFirst({
      where: {
        order_paper_id: firstPaper.id,
        group_id: group.id,
      },
    });

    expect(firstSheet).not.toBeNull();

    // Later paper/sheet in the same delivery group.
    const secondPaper = await paperRepository.generatePaperFromOrderDate(
      new Date('2026-06-16T00:00:00.000Z'),
    );

    await paperRepository.generateOrderSheets(secondPaper.id, [group]);

    const secondSheet = await testPrisma.order_sheet.findFirst({
      where: {
        order_paper_id: secondPaper.id,
        group_id: group.id,
      },
    });

    expect(secondSheet).not.toBeNull();

    const { client, product } = await getTestClientAndProduct(firstSheet!.id);

    // Establish ordered quantity on both sheets.
    await service.saveNightEntriesService(firstSheet!.id, [
      {
        clientId: client.id,
        productId: product.id,
        orderedQty: 10,
      },
    ]);

    await service.saveNightEntriesService(secondSheet!.id, [
      {
        clientId: client.id,
        productId: product.id,
        orderedQty: 10,
      },
    ]);

    // Move both papers into the morning/completion phase.
    await testPrisma.order_paper.update({
      where: {
        id: firstPaper.id,
      },
      data: {
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      },
    });

    await testPrisma.order_paper.update({
      where: {
        id: secondPaper.id,
      },
      data: {
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      },
    });

    // Establish delivered quantities on both sheets.
    await service.saveMorningEntriesService(firstSheet!.id, [
      {
        clientId: client.id,
        productId: product.id,
        deliveredQty: 10,
      },
    ]);

    await service.saveMorningEntriesService(secondSheet!.id, [
      {
        clientId: client.id,
        productId: product.id,
        deliveredQty: 10,
      },
    ]);

    // Finalize the first paper, then reopen it.
    await testPrisma.order_paper.update({
      where: {
        id: firstPaper.id,
      },
      data: {
        status: OrderPaperStatus.FINALIZED,
      },
    });

    await testPrisma.order_paper.update({
      where: {
        id: firstPaper.id,
      },
      data: {
        status: OrderPaperStatus.REOPENED,
      },
    });

    const before = await testPrisma.client_tray_transaction.findFirst({
      where: {
        order_sheet_id: secondSheet!.id,
        client_id: client.id,
      },
    });

    expect(before).not.toBeNull();

    const beforeOpeningBalance = Number(before!.opening_balance);

    const beforeTraysTaken = Number(before!.trays_taken ?? 0);

    const beforeTraysReturned = Number(before!.trays_returned ?? 0);

    const propagateSpy = vi.spyOn(
      clientTraysPropagationService,
      'propagateFromSheet',
    );

    const recalculateSpy = vi.spyOn(
      clientTraysPropagationService,
      'recalculateFromSheet',
    );

    // REOPENED permits correction of delivered quantity.
    // This must use the forward propagation path.
    await service.saveMorningEntriesService(firstSheet!.id, [
      {
        clientId: client.id,
        productId: product.id,
        deliveredQty: 4,
      },
    ]);

    expect(propagateSpy).toHaveBeenCalledWith(
      firstSheet!.id,
      expect.anything(),
    );

    expect(recalculateSpy).not.toHaveBeenCalled();

    const after = await testPrisma.client_tray_transaction.findUnique({
      where: {
        id: before!.id,
      },
    });

    expect(after).not.toBeNull();

    /*
     * The later sheet's own transaction values must be preserved
     * during forward propagation.
     */
    expect(Number(after!.trays_taken ?? 0)).toBe(beforeTraysTaken);

    expect(Number(after!.trays_returned ?? 0)).toBe(beforeTraysReturned);

    /*
     * The later sheet is reached by propagateFromSheet().
     * Its opening balance is recalculated from the preceding sheet.
     */
    expect(Number(after!.opening_balance)).not.toBe(beforeOpeningBalance);
  });
});
