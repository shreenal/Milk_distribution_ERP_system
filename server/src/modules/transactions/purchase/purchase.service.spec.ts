import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, DeliverySession } from '../../../generated/prisma/client.js';

import { PurchaseService } from './purchase.service.js';
import { PurchaseRepository } from './purchase.repository.js';
import { PurchaseBuilder } from './purchase.builder.js';
import { AllocationSummaryBuilder } from '../../../common/builders/allocation-summary.builder.js';
import { OrderItemsRepository } from '../../../common/repositories/order-items.repository.js';
import { PurchaseValidationService } from './services/purchase-validation.service.js';
import { PurchaseBillingService } from './services/purchase-billing.service.js';
import { PurchaseCommercialService } from './services/purchase-commercial.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import { DairyTraysRepository } from '../dairy-trays/dairy-trays.repository.js';
import { TrayCalculationService } from '../../../common/calculators/tray-calculation.service.js';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';

describe('PurchaseService', () => {
  let service: PurchaseService;

  let purchaseRepository: Mocked<PurchaseRepository>;
  let purchaseBuilder: Mocked<PurchaseBuilder>;
  let allocationSummaryBuilder: Mocked<AllocationSummaryBuilder>;
  let orderItemsRepository: Mocked<OrderItemsRepository>;
  let purchaseValidationService: Mocked<PurchaseValidationService>;
  let purchaseBillingService: Mocked<PurchaseBillingService>;
  let purchaseCommercialService: Mocked<PurchaseCommercialService>;
  let workflowState: Mocked<WorkflowStateService>;
  let workflowBuilder: Mocked<WorkflowBuilder>;
  let prisma: Mocked<PrismaService>;
  let dependencyOrchestrator: Mocked<DependencyOrchestratorService>;
  let trayCalculationService: Mocked<TrayCalculationService>;
  let dairyTraysRepository: Mocked<DairyTraysRepository>;

  let tx: Record<string, ReturnType<typeof vi.fn>>;
  const paper = {
    id: 1,
    status: 'NIGHT_SUBMITTED',
    sale_date: new Date('2026-09-14T00:00:00.000Z'),
  } as any;

  const vehicleAssignment = {
    vehicle_id: 10,
    distributor_id: 20,
    category: 'MILK',
    vehicle_allocation_paper: {
      delivery_session: DeliverySession.MORNING,
    },
  } as any;

  const allocation = {
    id: 100,
    vehicle_id: 10,
    distributor_id: 20,
    category: 'MILK',
    product_id: 30,
    allocated_qty: 10,
    vehicle_allocation_paper: {
      delivery_session: DeliverySession.MORNING,
    },
    master_product: {
      master_brand: {
        gatepass_date_policy: 'SAME_DAY',
      },
      master_packaging_type: {
        unit_multiplier: 1,
      },
    },
  } as any;

  const purchaseEntry = {
    id: 500,
    vehicle_id: 10,
    distributor_id: 20,
    category: 'MILK',
    product_id: 30,
    delivery_session: DeliverySession.MORNING,
    purchased_qty: 10,
    purchase_rate: 50,
    purchase_amount: 500,
    tray_type_id: 7,
    source_allocation_id: 100,
    source_allocated_qty: 10,
  } as any;

  const purchasePaper = {
    id: 200,
    updated_at: new Date('2026-09-14T05:00:00.000Z'),
  } as any;

  beforeEach(() => {
    purchaseRepository = {
      findOrderPaperById: vi.fn(),
      findVehicleAssignmentsByPaperId: vi.fn(),
      findVehicleAllocationsByPaperId: vi.fn(),
      findPurchasePaper: vi.fn(),
      findPurchaseEntries: vi.fn(),
      getProductLinksBatch: vi.fn(),
      findProductLinkRatesForDateBatch: vi.fn(),
      getOrCreatePurchasePaper: vi.fn(),
      findVehicleAllocationPapersForOrderPaper: vi.fn(),
      replacePurchaseEntries: vi.fn(),
      touchPurchasePaperIfUnchanged: vi.fn(),
    } as any;

    purchaseBuilder = {
      buildPurchaseGrids: vi.fn(),
      applyVehicleAllocations: vi.fn(),
      applyPurchaseRates: vi.fn(),
      applyPurchaseEntries: vi.fn(),
      applyVarianceMetadata: vi.fn(),
    } as any;

    allocationSummaryBuilder = {
      build: vi.fn(),
    };

    orderItemsRepository = {
      getOrderItemsWithSupplyContextByPaperId: vi.fn(),
    } as any;

    purchaseValidationService = {
      validateNoDuplicateEntries: vi.fn(),
      validatePurchases: vi.fn(),
    } as any;

    purchaseBillingService = {
      calculate: vi.fn(),
    };

    purchaseCommercialService = {
      resolveGatepassDateFor: vi.fn(),
    } as any;

    workflowState = {
      canEditPurchases: vi.fn(),
    } as any;

    workflowBuilder = {
      buildPurchasesWorkflow: vi.fn(),
    } as any;

    dependencyOrchestrator = {
      execute: vi.fn(),
    } as any;

    trayCalculationService = {
      resolveFrozenTrayTypeId: vi.fn(),
      resolveTrayRule: vi.fn(),
    } as any;

    dairyTraysRepository = {
      getProductTrayRules: vi.fn(),
    } as any;

    tx = {};

    prisma = {
      $transaction: vi.fn(),
    } as any;

    prisma.$transaction.mockImplementation(
      async (callback: any, options?: any) => {
        return callback(tx);
      },
    );

    service = new PurchaseService(
      purchaseRepository,
      purchaseBuilder,
      allocationSummaryBuilder,
      orderItemsRepository,
      purchaseValidationService,
      purchaseBillingService,
      purchaseCommercialService,
      workflowState,
      workflowBuilder,
      prisma,
      dependencyOrchestrator,
      trayCalculationService,
      dairyTraysRepository,
    );
  });

  describe('getPurchases', () => {
    beforeEach(() => {
      purchaseRepository.findOrderPaperById.mockResolvedValue(paper);

      purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue([
        vehicleAssignment,
      ]);

      orderItemsRepository.getOrderItemsWithSupplyContextByPaperId.mockResolvedValue(
        [],
      );

      allocationSummaryBuilder.build.mockReturnValue([]);

      purchaseBuilder.buildPurchaseGrids.mockReturnValue({
        purchases: [],
      });

      purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue([
        allocation,
      ]);

      purchaseBuilder.applyVehicleAllocations.mockReturnValue({
        purchases: [],
      });

      purchaseRepository.findPurchasePaper.mockResolvedValue(purchasePaper);

      purchaseRepository.findPurchaseEntries.mockResolvedValue([purchaseEntry]);

      purchaseBuilder.applyPurchaseEntries.mockReturnValue({
        purchases: [],
        orphanedEntries: [],
      });

      purchaseBuilder.applyPurchaseRates.mockReturnValue({
        purchases: [],
      });

      purchaseBuilder.applyVarianceMetadata.mockReturnValue({
        purchases: [],
      });

      purchaseRepository.findVehicleAllocationPapersForOrderPaper.mockResolvedValue(
        [
          {
            delivery_session: DeliverySession.MORNING,
          },
        ] as any,
      );

      workflowBuilder.buildPurchasesWorkflow.mockReturnValue({
        canEdit: true,
      } as any);
    });

    it('throws when the order paper does not exist', async () => {
      purchaseRepository.findOrderPaperById.mockResolvedValue(null);

      await expect(service.getPurchases(1)).rejects.toThrow(
        BadRequestException,
      );

      expect(purchaseRepository.findOrderPaperById).toHaveBeenCalledWith(1, tx);

      expect(
        purchaseRepository.findVehicleAssignmentsByPaperId,
      ).not.toHaveBeenCalled();
    });

    it('throws when there are no vehicle assignments', async () => {
      purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue([]);

      await expect(service.getPurchases(1)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        purchaseRepository.findVehicleAssignmentsByPaperId,
      ).toHaveBeenCalledWith(1, tx);

      expect(
        purchaseRepository.findVehicleAllocationsByPaperId,
      ).not.toHaveBeenCalled();
    });

    it('throws when there are no vehicle allocations', async () => {
      purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue([]);

      await expect(service.getPurchases(1)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        purchaseRepository.findVehicleAllocationsByPaperId,
      ).toHaveBeenCalledWith(1, tx);

      expect(purchaseRepository.findPurchasePaper).not.toHaveBeenCalled();
    });

    it('uses RepeatableRead isolation', async () => {
      await service.getPurchases(1);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });
    });

    it('passes the transaction client to repository reads', async () => {
      await service.getPurchases(1);

      expect(purchaseRepository.findOrderPaperById).toHaveBeenCalledWith(1, tx);

      expect(
        purchaseRepository.findVehicleAssignmentsByPaperId,
      ).toHaveBeenCalledWith(1, tx);

      expect(
        orderItemsRepository.getOrderItemsWithSupplyContextByPaperId,
      ).toHaveBeenCalledWith(1, tx);

      expect(
        purchaseRepository.findVehicleAllocationsByPaperId,
      ).toHaveBeenCalledWith(1, tx);

      expect(purchaseRepository.findPurchasePaper).toHaveBeenCalledWith(1, tx);

      expect(purchaseRepository.findPurchaseEntries).toHaveBeenCalledWith(
        purchasePaper.id,
        tx,
      );
    });

    it('does not request live rates for allocations that already have purchase entries', async () => {
      await service.getPurchases(1);

      expect(purchaseRepository.getProductLinksBatch).toHaveBeenCalledWith(
        [],
        tx,
        true,
      );

      expect(
        purchaseRepository.findProductLinkRatesForDateBatch,
      ).toHaveBeenCalledWith([], tx);
    });

    it('resolves live rates only for allocations without saved purchase entries', async () => {
      purchaseRepository.findPurchaseEntries.mockResolvedValue([]);

      purchaseRepository.getProductLinksBatch.mockResolvedValue(
        new Map([
          [
            '20_30',
            {
              id: 300,
            } as any,
          ],
        ]),
      );

      const gatepassDate = new Date('2026-09-14T00:00:00.000Z');

      purchaseCommercialService.resolveGatepassDateFor.mockReturnValue(
        gatepassDate,
      );

      purchaseRepository.findProductLinkRatesForDateBatch.mockResolvedValue(
        new Map([
          [
            `300_${gatepassDate.toISOString()}`,
            {
              purchase_rate: 55,
            } as any,
          ],
        ]),
      );

      purchaseBuilder.applyPurchaseRates.mockReturnValue({
        purchases: [],
      });

      purchaseBuilder.applyPurchaseEntries.mockReturnValue({
        purchases: [],
        orphanedEntries: [],
      });

      purchaseBuilder.applyVarianceMetadata.mockReturnValue({
        purchases: [],
      });

      await service.getPurchases(1);

      expect(purchaseRepository.getProductLinksBatch).toHaveBeenCalledWith(
        [
          {
            distributorId: 20,
            productId: 30,
          },
        ],
        tx,
        true,
      );

      expect(
        purchaseRepository.findProductLinkRatesForDateBatch,
      ).toHaveBeenCalled();
    });

    it('throws when a live product link cannot be found', async () => {
      purchaseRepository.findPurchaseEntries.mockResolvedValue([]);

      purchaseRepository.getProductLinksBatch.mockResolvedValue(new Map());

      await expect(service.getPurchases(1)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        purchaseRepository.findProductLinkRatesForDateBatch,
      ).not.toHaveBeenCalled();
    });

    it('throws when a live rate cannot be found', async () => {
      purchaseRepository.findPurchaseEntries.mockResolvedValue([]);

      purchaseRepository.getProductLinksBatch.mockResolvedValue(
        new Map([
          [
            '20_30',
            {
              id: 300,
            } as any,
          ],
        ]),
      );

      const gatepassDate = new Date('2026-09-14T00:00:00.000Z');

      purchaseCommercialService.resolveGatepassDateFor.mockReturnValue(
        gatepassDate,
      );

      purchaseRepository.findProductLinkRatesForDateBatch.mockResolvedValue(
        new Map(),
      );

      await expect(service.getPurchases(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('calculates morningAllocationPending from the existence of a MORNING allocation paper', async () => {
      purchaseRepository.findVehicleAllocationPapersForOrderPaper.mockResolvedValue(
        [],
      );

      const result = await service.getPurchases(1);

      expect(result.morningAllocationPending).toBe(true);
    });

    it('returns morningAllocationPending=false when a MORNING allocation paper exists', async () => {
      const result = await service.getPurchases(1);

      expect(result.morningAllocationPending).toBe(false);
    });

    it('surfaces stale rows through hasStaleRows', async () => {
      purchaseBuilder.applyPurchaseEntries.mockReturnValue({
        purchases: [
          {
            rows: [
              {
                purchase_rate_stale: true,
              },
            ],
          },
        ],
        orphanedEntries: [],
      } as any);

      const result = await service.getPurchases(1);

      expect(result.hasStaleRows).toBe(true);
    });

    it('returns hasStaleRows=false when no stale field is true', async () => {
      purchaseBuilder.applyPurchaseEntries.mockReturnValue({
        purchases: [
          {
            rows: [
              {
                purchase_rate_stale: false,
                source_allocation_stale: false,
              },
            ],
          },
        ],
        orphanedEntries: [],
      } as any);

      const result = await service.getPurchases(1);

      expect(result.hasStaleRows).toBe(false);
    });

    it('returns orphaned purchase entries', async () => {
      const orphanedEntries = [
        {
          vehicleId: 10,
          productId: 30,
          purchasedQty: 5,
        },
      ];

      purchaseBuilder.applyPurchaseEntries.mockReturnValue({
        purchases: [],
        orphanedEntries,
      } as any);

      const result = await service.getPurchases(1);

      expect(result.orphanedEntries).toEqual(orphanedEntries);
    });

    it('returns the purchase paper updated timestamp', async () => {
      const result = await service.getPurchases(1);

      expect(result.purchasePaperUpdatedAt).toEqual(purchasePaper.updated_at);
    });

    it('returns null purchasePaperUpdatedAt when no purchase paper exists', async () => {
      purchaseRepository.findPurchasePaper.mockResolvedValue(null);
      purchaseRepository.findPurchaseEntries.mockResolvedValue([]);

      purchaseRepository.getProductLinksBatch.mockResolvedValue(
        new Map([
          [
            '20_30',
            {
              id: 300,
            } as any,
          ],
        ]),
      );

      const gatepassDate = new Date('2026-09-14T00:00:00.000Z');

      purchaseCommercialService.resolveGatepassDateFor.mockReturnValue(
        gatepassDate,
      );

      purchaseRepository.findProductLinkRatesForDateBatch.mockResolvedValue(
        new Map([
          [
            `300_${gatepassDate.toISOString()}`,
            {
              purchase_rate: 50,
            } as any,
          ],
        ]),
      );

      const result = await service.getPurchases(1);

      expect(result.purchasePaperUpdatedAt).toBeNull();
      expect(result.hasPurchaseEntries).toBe(false);
    });

    it('returns hasPurchaseEntries=true when saved entries exist', async () => {
      const result = await service.getPurchases(1);

      expect(result.hasPurchaseEntries).toBe(true);
    });

    it('passes allocations and purchase entries through the builder pipeline', async () => {
      await service.getPurchases(1);

      expect(purchaseBuilder.applyVehicleAllocations).toHaveBeenCalledWith(
        expect.anything(),
        [allocation],
      );

      expect(purchaseBuilder.applyPurchaseEntries).toHaveBeenCalledWith(
        expect.anything(),
        [purchaseEntry],
        [allocation],
      );

      expect(purchaseBuilder.applyVarianceMetadata).toHaveBeenCalledWith(
        expect.anything(),
        [allocation],
        [purchaseEntry],
      );
    });

    it('builds the purchase workflow from the paper status', async () => {
      await service.getPurchases(1);

      expect(workflowBuilder.buildPurchasesWorkflow).toHaveBeenCalledWith(
        paper.status,
      );
    });
  });

  describe('savePurchases', () => {
    const dto = {
      entries: [
        {
          vehicleId: 10,
          distributorId: 20,
          category: 'MILK',
          productId: 30,
          deliverySession: DeliverySession.MORNING,
          purchasedQty: 10,
        },
      ],
    } as any;

    beforeEach(() => {
      purchaseRepository.findOrderPaperById.mockResolvedValue(paper);

      workflowState.canEditPurchases.mockReturnValue(true);

      purchaseValidationService.validateNoDuplicateEntries.mockReturnValue(
        undefined,
      );

      purchaseValidationService.validatePurchases.mockResolvedValue(undefined);

      purchaseRepository.findPurchasePaper.mockResolvedValue(purchasePaper);

      purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue([
        allocation,
      ]);

      purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue([
        vehicleAssignment,
      ]);

      purchaseRepository.findPurchaseEntries.mockResolvedValue([purchaseEntry]);

      dairyTraysRepository.getProductTrayRules.mockResolvedValue([]);

      purchaseRepository.getProductLinksBatch.mockResolvedValue(
        new Map([
          [
            '20_30',
            {
              id: 300,
            } as any,
          ],
        ]),
      );

      const gatepassDate = new Date('2026-09-14T00:00:00.000Z');

      purchaseCommercialService.resolveGatepassDateFor.mockReturnValue(
        gatepassDate,
      );

      purchaseRepository.findProductLinkRatesForDateBatch.mockResolvedValue(
        new Map([
          [
            `300_${gatepassDate.toISOString()}`,
            {
              purchase_rate: 50,
            } as any,
          ],
        ]),
      );

      purchaseBillingService.calculate.mockReturnValue({
        purchaseAmount: 500,
      });

      trayCalculationService.resolveFrozenTrayTypeId.mockReturnValue(7);

      purchaseRepository.replacePurchaseEntries.mockResolvedValue(undefined);

      dependencyOrchestrator.execute.mockResolvedValue(undefined);
    });

    it('throws when the order paper does not exist', async () => {
      purchaseRepository.findOrderPaperById.mockResolvedValue(null);

      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(purchaseRepository.findOrderPaperById).toHaveBeenCalled();
    });

    it('rejects editing when workflow does not allow purchases', async () => {
      workflowState.canEditPurchases.mockReturnValue(false);

      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(
        purchaseValidationService.validateNoDuplicateEntries,
      ).not.toHaveBeenCalled();

      expect(
        purchaseValidationService.validatePurchases,
      ).not.toHaveBeenCalled();
    });

    it('validates duplicate entries before purchase validation', async () => {
      await service.savePurchases(1, dto);

      expect(
        purchaseValidationService.validateNoDuplicateEntries,
      ).toHaveBeenCalledWith(dto.entries);

      expect(purchaseValidationService.validatePurchases).toHaveBeenCalledWith(
        1,
        dto,
        tx,
      );
    });

    it('rejects stale expectedUpdatedAt', async () => {
      const staleDto = {
        ...dto,
        expectedUpdatedAt: '2026-09-14T04:00:00.000Z',
      };

      purchaseRepository.touchPurchasePaperIfUnchanged.mockResolvedValue(false);

      await expect(service.savePurchases(1, staleDto)).rejects.toThrow(
        ConflictException,
      );

      expect(
        purchaseValidationService.validatePurchases,
      ).not.toHaveBeenCalled();

      expect(purchaseRepository.replacePurchaseEntries).not.toHaveBeenCalled();
    });

    it('accepts matching expectedUpdatedAt', async () => {
      const matchingDto = {
        ...dto,
        expectedUpdatedAt: purchasePaper.updated_at.toISOString(),
      };

      purchaseRepository.touchPurchasePaperIfUnchanged.mockResolvedValue(true);

      await expect(service.savePurchases(1, matchingDto)).resolves.toEqual({
        success: true,
      });
    });

    it('rejects dropped entries unless confirmDeletions is true', async () => {
      const incomingDifferentDto = {
        entries: [
          {
            vehicleId: 99,
            distributorId: 20,
            category: 'MILK',
            productId: 31,
            deliverySession: DeliverySession.MORNING,
            purchasedQty: 5,
          },
        ],
      } as any;

      await expect(
        service.savePurchases(1, incomingDifferentDto),
      ).rejects.toMatchObject({
        response: {
          droppedEntries: [
            expect.objectContaining({
              vehicleId: 10,
              distributorId: 20,
              category: 'MILK',
              productId: 30,
              deliverySession: DeliverySession.MORNING,
              purchasedQty: 10,
            }),
          ],
        },
      });

      expect(purchaseRepository.replacePurchaseEntries).not.toHaveBeenCalled();
    });

    it('allows dropped entries when confirmDeletions is true', async () => {
      const incomingDifferentDto = {
        confirmDeletions: true,
        entries: [],
      } as any;

      await expect(
        service.savePurchases(1, incomingDifferentDto),
      ).resolves.toEqual({
        success: true,
      });

      expect(purchaseRepository.replacePurchaseEntries).toHaveBeenCalled();
    });

    it('rejects an entry without a matching allocation', async () => {
      purchaseRepository.findVehicleAllocationsByPaperId.mockResolvedValue([]);

      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(purchaseRepository.replacePurchaseEntries).not.toHaveBeenCalled();
    });

    it('rejects an entry without a matching vehicle assignment', async () => {
      purchaseRepository.findVehicleAssignmentsByPaperId.mockResolvedValue([]);

      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(purchaseRepository.replacePurchaseEntries).not.toHaveBeenCalled();
    });

    it('loads tray rules before constructing purchase rows', async () => {
      await service.savePurchases(1, dto);

      expect(dairyTraysRepository.getProductTrayRules).toHaveBeenCalledWith(tx);
    });

    it('resolves the gatepass date using the product brand policy', async () => {
      await service.savePurchases(1, dto);

      expect(
        purchaseCommercialService.resolveGatepassDateFor,
      ).toHaveBeenCalledWith(
        paper.sale_date,
        allocation.master_product.master_brand.gatepass_date_policy,
      );
    });

    it('calculates purchase amount using purchased quantity, rate and unit multiplier', async () => {
      await service.savePurchases(1, dto);

      expect(purchaseBillingService.calculate).toHaveBeenCalledWith(10, 50, 1);
    });

    it('preserves the existing frozen tray type', async () => {
      await service.savePurchases(1, dto);

      expect(
        trayCalculationService.resolveFrozenTrayTypeId,
      ).toHaveBeenCalledWith(purchaseEntry, expect.anything());

      const rows = purchaseRepository.replacePurchaseEntries.mock.calls[0][1];

      expect(rows[0].tray_type_id).toBe(7);
    });

    it('uses the current tray rule for a new purchase entry', async () => {
      purchaseRepository.findPurchaseEntries.mockResolvedValue([]);

      trayCalculationService.resolveTrayRule.mockReturnValue({
        tray_type_id: 99,
      } as any);

      await service.savePurchases(1, dto);

      expect(trayCalculationService.resolveTrayRule).toHaveBeenCalledWith(
        allocation.master_product,
        expect.anything(),
      );

      const rows = purchaseRepository.replacePurchaseEntries.mock.calls[0][1];

      expect(rows[0].tray_type_id).toBe(99);
    });

    it('filters out zero-quantity entries before persistence', async () => {
      const zeroDto = {
        entries: [
          {
            ...dto.entries[0],
            purchasedQty: 0,
          },
        ],
        confirmDeletions: true,
      } as any;

      await service.savePurchases(1, zeroDto);

      expect(purchaseRepository.replacePurchaseEntries).toHaveBeenCalledWith(
        purchasePaper.id,
        [],
        tx,
      );
    });

    it('persists source allocation information on purchase rows', async () => {
      await service.savePurchases(1, dto);

      const rows = purchaseRepository.replacePurchaseEntries.mock.calls[0][1];

      expect(rows[0]).toMatchObject({
        source_allocation_id: allocation.id,
        source_allocated_qty: allocation.allocated_qty,
      });
    });

    it('calls replacePurchaseEntries with the generated purchase rows', async () => {
      await service.savePurchases(1, dto);

      expect(purchaseRepository.replacePurchaseEntries).toHaveBeenCalledTimes(
        1,
      );

      expect(purchaseRepository.replacePurchaseEntries).toHaveBeenCalledWith(
        purchasePaper.id,
        expect.arrayContaining([
          expect.objectContaining({
            vehicle_id: 10,
            distributor_id: 20,
            category: 'MILK',
            product_id: 30,
            delivery_session: DeliverySession.MORNING,
            purchased_qty: 10,
            purchase_rate: 50,
            purchase_amount: 500,
            product_link_id: 300,
            source_allocation_id: 100,
            source_allocated_qty: 10,
          }),
        ]),
        tx,
      );
    });

    it('fires Purchase ON_SAVE dependency propagation after replacing entries', async () => {
      await service.savePurchases(1, dto);

      expect(dependencyOrchestrator.execute).toHaveBeenCalledTimes(1);

      expect(dependencyOrchestrator.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {
          paperId: 1,
          tx,
        },
      );
    });

    it('returns success after saving purchases', async () => {
      await expect(service.savePurchases(1, dto)).resolves.toEqual({
        success: true,
      });
    });

    it('uses the configured transaction timeout and isolation level', async () => {
      await service.savePurchases(1, dto);

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          timeout: expect.any(Number),
          isolationLevel: expect.anything(),
        }),
      );
    });

    it('creates a purchase paper when one does not already exist', async () => {
      purchaseRepository.findPurchasePaper.mockResolvedValue(null);

      purchaseRepository.getOrCreatePurchasePaper.mockResolvedValue(
        purchasePaper,
      );

      purchaseRepository.findPurchaseEntries.mockResolvedValue([]);

      await service.savePurchases(1, dto);

      expect(purchaseRepository.getOrCreatePurchasePaper).toHaveBeenCalledWith(
        1,
        tx,
      );
    });
  });
});
