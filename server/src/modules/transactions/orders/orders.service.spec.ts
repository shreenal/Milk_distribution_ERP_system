import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrdersService } from './orders.service.js';
import {
  OrderPaperStatus,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from './orders.constants.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';

describe('OrdersService', () => {
  let service: OrdersService;

  const ordersRepository = {
    findAvailableProducts: vi.fn(),
    findSheetById: vi.fn(),
    getProductsForSheet: vi.fn(),
    getClientsForSheetDisplay: vi.fn(),
    getSheetItems: vi.fn(),
    getSheetProductLink: vi.fn(),
    createSheetProduct: vi.fn(),
    getProductWithGroup: vi.fn(),
    deleteSheetProduct: vi.fn(),
    deleteSheetItems: vi.fn(),
    markOrderMorningEntrySaved: vi.fn(),
  };

  const ordersBuilder = {
    buildOrderBillingSection: vi.fn(),
  };

  const validationService = {
    validateProduct: vi.fn(),
    validateNoDuplicates: vi.fn(),
    validateEntriesBatch: vi.fn(),
    validateQuantity: vi.fn(),
  };

  const orderCommercialService = {
    resolve: vi.fn(),
  };

  const billingService = {
    getTrayRulesOnce: vi.fn(),
    saveNightEntriesBatch: vi.fn(),
    saveMorningEntriesBatch: vi.fn(),
  };

  const prisma: any = {
    $transaction: vi.fn(),
    order_sheet_items: {
      findFirst: vi.fn(),
    },
  };

  const workflowState = {
    canEditNightEntries: vi.fn(),
    canEditMorningEntries: vi.fn(),
  };

  const workflowBuilder = {
    buildOrdersWorkflow: vi.fn(),
  };

  const dependencyOrchestrator = {
    execute: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrdersService(
      ordersRepository as any,
      ordersBuilder as any,
      validationService as any,
      orderCommercialService as any,
      billingService as any,
      prisma,
      workflowState as any,
      workflowBuilder as any,
      dependencyOrchestrator as any,
    );

    prisma.$transaction.mockImplementation(
      async (callback: (tx: any) => Promise<any>) => callback(prisma),
    );

    ordersRepository.findAvailableProducts.mockResolvedValue([]);
    ordersRepository.getProductsForSheet.mockResolvedValue([]);
    ordersRepository.getClientsForSheetDisplay.mockResolvedValue([]);
    ordersRepository.getSheetItems.mockResolvedValue([]);
    ordersRepository.getSheetProductLink.mockResolvedValue(null);
    ordersRepository.getProductWithGroup.mockResolvedValue({
      show_by_default: false,
    });
    ordersRepository.deleteSheetProduct.mockResolvedValue({ count: 1 });
    ordersRepository.deleteSheetItems.mockResolvedValue(undefined);
    ordersRepository.markOrderMorningEntrySaved.mockResolvedValue(undefined);

    ordersBuilder.buildOrderBillingSection.mockReturnValue({
      billing: {},
    });

    workflowBuilder.buildOrdersWorkflow.mockReturnValue({
      state: 'DRAFT',
    });

    workflowState.canEditNightEntries.mockReturnValue(true);
    workflowState.canEditMorningEntries.mockReturnValue(true);

    validationService.validateProduct.mockResolvedValue(undefined);
    validationService.validateNoDuplicates.mockReturnValue(undefined);
    validationService.validateEntriesBatch.mockResolvedValue(undefined);
    validationService.validateQuantity.mockReturnValue(undefined);

    orderCommercialService.resolve.mockResolvedValue({
      productLinkId: 101,
      resolvedViaFallback: false,
    });

    billingService.getTrayRulesOnce.mockResolvedValue({
      milk: {},
      nonMilk: {},
    });

    billingService.saveNightEntriesBatch.mockResolvedValue(undefined);
    billingService.saveMorningEntriesBatch.mockResolvedValue(undefined);
    dependencyOrchestrator.execute.mockResolvedValue(undefined);
  });

  describe('getAvailableProducts', () => {
    it('delegates category to repository', async () => {
      const products = [{ id: 1 }];

      ordersRepository.findAvailableProducts.mockResolvedValue(products);

      const result = await service.getAvailableProducts(SupplyCategory.MILK);

      expect(ordersRepository.findAvailableProducts).toHaveBeenCalledWith(
        SupplyCategory.MILK,
      );

      expect(result).toEqual(products);
    });
  });

  describe('getSheetService', () => {
    const sheet = {
      id: 10,
      group_id: 20,
      order_paper_id: 30,
      order_paper: {
        status: OrderPaperStatus.DRAFT,
      },
      order_morning_entry_saved_at: null,
    };

    beforeEach(() => {
      ordersRepository.findSheetById.mockResolvedValue(sheet);
    });

    it('throws when sheet does not exist', async () => {
      ordersRepository.findSheetById.mockResolvedValue(null);

      await expect(service.getSheetService(10)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('loads all required sheet data and builds billing section', async () => {
      const milkProducts = [{ id: 1 }];
      const nonMilkProducts = [{ id: 2 }];
      const milkClients = [{ id: 3 }];
      const nonMilkClients = [{ id: 4 }];
      const sheetItems = [{ id: 5 }];
      const workflow = { state: 'DRAFT' };
      const billing = { rows: [] };

      ordersRepository.getProductsForSheet
        .mockResolvedValueOnce(milkProducts)
        .mockResolvedValueOnce(nonMilkProducts);

      ordersRepository.getClientsForSheetDisplay
        .mockResolvedValueOnce(milkClients)
        .mockResolvedValueOnce(nonMilkClients);

      ordersRepository.getSheetItems.mockResolvedValue(sheetItems);

      workflowBuilder.buildOrdersWorkflow.mockReturnValue(workflow);
      ordersBuilder.buildOrderBillingSection.mockReturnValue(billing);

      const result = await service.getSheetService(10);

      expect(ordersRepository.getProductsForSheet).toHaveBeenNthCalledWith(
        1,
        10,
        SupplyCategory.MILK,
        prisma,
      );

      expect(ordersRepository.getProductsForSheet).toHaveBeenNthCalledWith(
        2,
        10,
        SupplyCategory.NON_MILK,
        prisma,
      );

      expect(
        ordersRepository.getClientsForSheetDisplay,
      ).toHaveBeenNthCalledWith(1, 10, 20, SupplyCategory.MILK, prisma);

      expect(
        ordersRepository.getClientsForSheetDisplay,
      ).toHaveBeenNthCalledWith(2, 10, 20, SupplyCategory.NON_MILK, prisma);

      expect(ordersRepository.getSheetItems).toHaveBeenCalledWith(10, prisma);

      expect(workflowBuilder.buildOrdersWorkflow).toHaveBeenCalledWith(
        OrderPaperStatus.DRAFT,
      );

      expect(ordersBuilder.buildOrderBillingSection).toHaveBeenCalledWith(
        {
          milkProducts,
          nonMilkProducts,
          milkClients,
          nonMilkClients,
          sheetItems,
        },
        OrderPaperStatus.DRAFT,
        false,
      );

      expect(result).toEqual({
        sheet,
        workflow,
        ...billing,
      });
    });

    it('sets morningEntrySaved when night-submitted and timestamp exists', async () => {
      const nightSheet = {
        ...sheet,
        order_paper: {
          status: OrderPaperStatus.NIGHT_SUBMITTED,
        },
        order_morning_entry_saved_at: new Date('2026-01-01T00:00:00.000Z'),
      };

      ordersRepository.findSheetById.mockResolvedValue(nightSheet);

      await service.getSheetService(10);

      expect(ordersBuilder.buildOrderBillingSection).toHaveBeenCalledWith(
        expect.anything(),
        OrderPaperStatus.NIGHT_SUBMITTED,
        true,
      );
    });
  });

  describe('getSheetItemsService', () => {
    it('rejects an invalid sheet id', async () => {
      await expect(service.getSheetItemsService(0)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(ordersRepository.getSheetItems).not.toHaveBeenCalled();
    });

    it('returns repository sheet items', async () => {
      const items = [{ id: 1 }];

      ordersRepository.getSheetItems.mockResolvedValue(items);

      const result = await service.getSheetItemsService(10);

      expect(ordersRepository.getSheetItems).toHaveBeenCalledWith(10);

      expect(result).toEqual(items);
    });

    it('rethrows repository errors', async () => {
      const error = new Error('DB failure');

      ordersRepository.getSheetItems.mockRejectedValue(error);

      await expect(service.getSheetItemsService(10)).rejects.toBe(error);
    });
  });

  describe('addProductToSheet', () => {
    const sheet = {
      id: 10,
      group_id: 20,
      order_paper_id: 30,
      order_paper: {
        status: OrderPaperStatus.DRAFT,
      },
    };

    beforeEach(() => {
      ordersRepository.findSheetById.mockResolvedValue(sheet);
    });

    it('rejects an invalid sheet id', async () => {
      await expect(
        service.addProductToSheet(0, { productId: 50 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when sheet does not exist', async () => {
      ordersRepository.findSheetById.mockResolvedValue(null);

      await expect(
        service.addProductToSheet(10, { productId: 50 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when night editing is not allowed', async () => {
      workflowState.canEditNightEntries.mockReturnValue(false);

      await expect(
        service.addProductToSheet(10, { productId: 50 } as any),
      ).rejects.toThrow(
        'Products can only be added while the paper is in DRAFT',
      );
    });

    it('rejects a product already present on the sheet', async () => {
      ordersRepository.getSheetProductLink.mockResolvedValue({
        id: 99,
      });

      await expect(
        service.addProductToSheet(10, { productId: 50 } as any),
      ).rejects.toThrow('Product already exists in this sheet');

      expect(orderCommercialService.resolve).not.toHaveBeenCalled();
    });

    it('validates and resolves the commercial context before creating the sheet product', async () => {
      const dto = { productId: 50 };

      ordersRepository.getGroupSupplyRules.mockResolvedValue({
        milkDistributorId: 7,
        nonMilkDistributorId: 8,
      });

      orderCommercialService.resolve.mockResolvedValue({
        productLinkId: 123,
        resolvedViaFallback: true,
      });

      vi.spyOn(service, 'getSheetService').mockResolvedValue({} as any);

      await service.addProductToSheet(10, dto);

      expect(validationService.validateProduct).toHaveBeenCalledWith(
        50,
        prisma,
      );

      expect(orderCommercialService.resolve).toHaveBeenCalledWith(
        20,
        50,
        {
          milkDistributorId: 7,
          nonMilkDistributorId: 8,
        },
        prisma,
      );

      expect(ordersRepository.createSheetProduct).toHaveBeenCalledWith(
        {
          order_sheet_id: 10,
          product_id: 50,
          product_link_id: 123,
          resolvedViaFallback: true,
        },
        prisma,
      );
    });
  });

  describe('removeProductFromSheet', () => {
    const sheet = {
      id: 10,
      group_id: 20,
      order_paper_id: 30,
      order_paper: {
        status: OrderPaperStatus.DRAFT,
      },
    };

    beforeEach(() => {
      ordersRepository.findSheetById.mockResolvedValue(sheet);
    });

    it('rejects an invalid sheet id', async () => {
      await expect(
        service.removeProductFromSheet(0, 50),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a default product', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue({
        show_by_default: true,
      });

      await expect(service.removeProductFromSheet(10, 50)).rejects.toThrow(
        'Default products cannot be removed',
      );
    });

    it('rejects when ordered quantities exist', async () => {
      prisma.order_sheet_items.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.removeProductFromSheet(10, 50)).rejects.toThrow(
        'Cannot remove a product that already has ordered quantities',
      );
    });

    it('rejects when the product is not in the sheet', async () => {
      prisma.order_sheet_items.findFirst.mockResolvedValue(null);

      ordersRepository.deleteSheetProduct.mockResolvedValue({
        count: 0,
      });

      await expect(service.removeProductFromSheet(10, 50)).rejects.toThrow(
        'Product not found in this sheet',
      );
    });

    it('deletes the product and its sheet items', async () => {
      prisma.order_sheet_items.findFirst.mockResolvedValue(null);

      vi.spyOn(service, 'getSheetService').mockResolvedValue({} as any);

      await service.removeProductFromSheet(10, 50);

      expect(ordersRepository.deleteSheetProduct).toHaveBeenCalledWith(
        10,
        50,
        prisma,
      );

      expect(ordersRepository.deleteSheetItems).toHaveBeenCalledWith(
        10,
        50,
        prisma,
      );
    });
  });

  describe('saveNightEntriesService', () => {
    const sheet = {
      id: 10,
      group_id: 20,
      order_paper_id: 30,
      order_paper: {
        status: OrderPaperStatus.DRAFT,
      },
    };

    const entries = [
      {
        clientId: 1,
        productId: 2,
        orderedQty: 10,
      },
    ];

    beforeEach(() => {
      ordersRepository.findSheetById.mockResolvedValue(sheet);
    });

    it('rejects an invalid sheet id', async () => {
      await expect(
        service.saveNightEntriesService(0, entries as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate entries before the transaction', async () => {
      validationService.validateNoDuplicates.mockImplementation(() => {
        throw new BadRequestException('duplicate');
      });

      await expect(
        service.saveNightEntriesService(10, entries as any),
      ).rejects.toThrow('duplicate');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when sheet does not exist', async () => {
      ordersRepository.findSheetById.mockResolvedValue(null);

      await expect(
        service.saveNightEntriesService(10, entries as any),
      ).rejects.toThrow('Sheet with ID 10 not found');
    });

    it('rejects when night editing is not allowed', async () => {
      workflowState.canEditNightEntries.mockReturnValue(false);

      await expect(
        service.saveNightEntriesService(10, entries as any),
      ).rejects.toThrow();
    });

    it('rejects an entry with a null orderedQty before saving anything', async () => {
      const entriesWithNullQty = [
        { clientId: 1, productId: 2, orderedQty: null as any },
      ];

      await expect(
        service.saveNightEntriesService(10, entriesWithNullQty),
      ).rejects.toThrow(ERROR_MESSAGES.MISSING_REQUIRED_FIELD('orderedQty'));

      expect(billingService.saveNightEntriesBatch).not.toHaveBeenCalled();
    });

    it('rejects an entry with an undefined orderedQty before saving anything', async () => {
      const entriesWithUndefinedQty = [{ clientId: 1, productId: 2 } as any];

      await expect(
        service.saveNightEntriesService(10, entriesWithUndefinedQty),
      ).rejects.toThrow(ERROR_MESSAGES.MISSING_REQUIRED_FIELD('orderedQty'));

      expect(billingService.saveNightEntriesBatch).not.toHaveBeenCalled();
    });

    it('validates entries and quantities before saving', async () => {
      await service.saveNightEntriesService(10, entries);

      expect(validationService.validateEntriesBatch).toHaveBeenCalledWith(
        entries,
        20,
        prisma,
      );

      expect(billingService.getTrayRulesOnce).toHaveBeenCalledWith(prisma);

      expect(validationService.validateQuantity).toHaveBeenCalledWith(10);

      expect(billingService.saveNightEntriesBatch).toHaveBeenCalledWith(
        prisma,
        sheet,
        expect.anything(),
        10,
        entries,
        expect.anything(),
      );
    });

    it('executes Orders to Client Trays propagation after saving', async () => {
      await service.saveNightEntriesService(10, entries);

      expect(dependencyOrchestrator.execute).toHaveBeenCalledWith(
        DEPENDENCY_MODULES.ORDERS,
        DEPENDENCY_TRIGGERS.ON_SAVE,
        expect.objectContaining({
          paperId: 30,
          sheetId: 10,
          paperStatus: OrderPaperStatus.DRAFT,
          tx: prisma,
        }),
      );
    });

    it('returns the success response', async () => {
      const result = await service.saveNightEntriesService(10, entries);

      expect(result).toEqual({
        success: true,
        message: SUCCESS_MESSAGES.NIGHT_ENTRIES_SAVED,
      });
    });
  });

  describe('saveMorningEntriesService', () => {
    const sheet = {
      id: 10,
      group_id: 20,
      order_paper_id: 30,
      order_paper: {
        status: OrderPaperStatus.NIGHT_SUBMITTED,
      },
    };

    const entries = [
      {
        clientId: 1,
        productId: 2,
        deliveredQty: 8,
      },
    ];

    beforeEach(() => {
      ordersRepository.findSheetById.mockResolvedValue(sheet);
    });

    it('rejects an invalid sheet id', async () => {
      await expect(
        service.saveMorningEntriesService(0, entries as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate entries before the transaction', async () => {
      validationService.validateNoDuplicates.mockImplementation(() => {
        throw new BadRequestException('duplicate');
      });

      await expect(
        service.saveMorningEntriesService(10, entries as any),
      ).rejects.toThrow('duplicate');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when sheet does not exist', async () => {
      ordersRepository.findSheetById.mockResolvedValue(null);

      await expect(
        service.saveMorningEntriesService(10, entries as any),
      ).rejects.toThrow('Sheet with ID 10 not found');
    });

    it('rejects when morning editing is not allowed', async () => {
      workflowState.canEditMorningEntries.mockReturnValue(false);

      await expect(
        service.saveMorningEntriesService(10, entries as any),
      ).rejects.toThrow();
    });

    it('validates quantities and saves morning entries', async () => {
      await service.saveMorningEntriesService(10, entries);

      expect(validationService.validateEntriesBatch).toHaveBeenCalledWith(
        entries,
        20,
        prisma,
      );

      expect(validationService.validateQuantity).toHaveBeenCalledWith(8);

      expect(billingService.saveMorningEntriesBatch).toHaveBeenCalledWith(
        prisma,
        sheet,
        10,
        entries,
      );

      expect(ordersRepository.markOrderMorningEntrySaved).toHaveBeenCalledWith(
        10,
        prisma,
      );
    });

    it('executes Orders to Client Trays propagation after saving', async () => {
      await service.saveMorningEntriesService(10, entries);

      expect(dependencyOrchestrator.execute).toHaveBeenCalledWith(
        DEPENDENCY_MODULES.ORDERS,
        DEPENDENCY_TRIGGERS.ON_SAVE,
        expect.objectContaining({
          paperId: 30,
          sheetId: 10,
          paperStatus: OrderPaperStatus.NIGHT_SUBMITTED,
          tx: prisma,
        }),
      );
    });

    it('returns the success response', async () => {
      const result = await service.saveMorningEntriesService(10, entries);

      expect(result).toEqual({
        success: true,
        message: SUCCESS_MESSAGES.MORNING_ENTRIES_SAVED,
      });
    });
  });
});
