import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { BillingService } from './billing.service.js';
import { ERROR_MESSAGES } from '../orders.constants.js';

describe('BillingService', () => {
  let service: BillingService;

  const ordersRepository = {
    findSheetItemsByProductBatch: vi.fn(),
    getSheetProductLinksBatch: vi.fn(),
    createSheetProduct: vi.fn(),
    getProductsWithPackagingBatch: vi.fn(),
    getSellingRatesBatch: vi.fn(),
    upsertSheetEntry: vi.fn(),
  };

  const orderCommercialService = {
    resolve: vi.fn(),
  };

  const nightBillingService = {
    calculate: vi.fn(),
  };

  const finalBillingService = {
    calculate: vi.fn(),
  };

  const trayCalculationService = {
    getProductTrayRules: vi.fn(),
    resolveTrayRule: vi.fn(),
  };

  const tx = {
    master_product_link: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    order_sheet_items: {
      update: vi.fn(),
    },
  } as any;

  const sheet = {
    id: 100,
    group_id: 5,
    order_paper: {
      sale_date: new Date('2026-09-13T00:00:00.000Z'),
    },
  } as any;

  const supplyRules = {
    milkDistributorId: 101,
    nonMilkDistributorId: 202,
  };

  const trayRules = [
    {
      product_id: 10,
      tray_type_id: 7,
    },
  ] as any;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new BillingService(
      ordersRepository as any,
      orderCommercialService as any,
      nightBillingService as any,
      finalBillingService as any,
      trayCalculationService as any,
    );
  });

  describe('getTrayRulesOnce', () => {
    it('delegates tray-rule loading to TrayCalculationService', async () => {
      trayCalculationService.getProductTrayRules.mockResolvedValue(
        trayRules,
      );

      await expect(
        service.getTrayRulesOnce(tx),
      ).resolves.toEqual(trayRules);

      expect(
        trayCalculationService.getProductTrayRules,
      ).toHaveBeenCalledWith(tx);
    });
  });

  describe('saveNightEntriesBatch', () => {
    const product = {
      id: 10,
      gst_percentage: 18,
      master_packaging_type: {
        unit_multiplier: 1,
      },
    };

    const existingItem = {
      product_link_id: 501,
      product_link: {
        distributor_id: 101,
      },
      master_product: product,
    };

    beforeEach(() => {
      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map(),
      );

      ordersRepository.getSheetProductLinksBatch.mockResolvedValue(
        new Map(),
      );

      ordersRepository.getProductsWithPackagingBatch.mockResolvedValue(
        new Map([[10, product]]),
      );

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_501', 100]]),
      );

      ordersRepository.upsertSheetEntry.mockResolvedValue(undefined);

      nightBillingService.calculate.mockReturnValue({
        nightBillAmount: 1000,
      });

      trayCalculationService.resolveTrayRule.mockReturnValue({
        tray_type_id: 7,
      });

      orderCommercialService.resolve.mockResolvedValue({
        distributorId: 101,
        productLinkId: 501,
        gstPercentage: 18,
        gstInclusive: true,
        resolvedViaFallback: false,
      });

      ordersRepository.createSheetProduct.mockResolvedValue({
        product_link_id: 501,
      });
    });

    it('skips a new entry whose ordered quantity is zero', async () => {
      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 0,
          },
        ] as any,
        trayRules,
      );

      expect(
        orderCommercialService.resolve,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.createSheetProduct,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.upsertSheetEntry,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.getProductsWithPackagingBatch,
      ).toHaveBeenCalledWith([], tx);
    });

    it('reuses the existing item product link and does not resolve commercial data again', async () => {
      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map([
          ['1_10', existingItem],
        ]),
      );

      ordersRepository.getProductsWithPackagingBatch.mockResolvedValue(
        new Map([[10, product]]),
      );

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_501', 100]]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        orderCommercialService.resolve,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.createSheetProduct,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.getSellingRatesBatch,
      ).toHaveBeenCalledWith(
        [{ clientId: 1, productLinkId: 501 }],
        sheet.order_paper.sale_date,
        tx,
      );
    });

    it('does not recalculate the tray type for an existing item', async () => {
      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map([
          ['1_10', existingItem],
        ]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        trayCalculationService.resolveTrayRule,
      ).not.toHaveBeenCalled();

      expect(ordersRepository.upsertSheetEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          tray_type_id: undefined,
        }),
        tx,
      );
    });

    it('resolves and pins commercial data for a new product', async () => {
      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        orderCommercialService.resolve,
      ).toHaveBeenCalledWith(
        5,
        10,
        supplyRules,
        tx,
      );

      expect(
        ordersRepository.createSheetProduct,
      ).toHaveBeenCalledWith(
        {
          order_sheet_id: 100,
          product_id: 10,
          product_link_id: 501,
          resolvedViaFallback: false,
        },
        tx,
      );
    });

    it('reuses an existing sheet-level product link without commercial resolution', async () => {
      ordersRepository.getSheetProductLinksBatch.mockResolvedValue(
        new Map([
          [
            10,
            {
              product_link_id: 700,
            },
          ],
        ]),
      );

      tx.master_product_link.findUnique.mockResolvedValue({
        id: 700,
        distributor_id: 303,
      });

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_700', 125]]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        orderCommercialService.resolve,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.createSheetProduct,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.getSellingRatesBatch,
      ).toHaveBeenCalledWith(
        [{ clientId: 1, productLinkId: 700 }],
        sheet.order_paper.sale_date,
        tx,
      );
    });

    it('rejects an invalid sheet-level product link', async () => {
      ordersRepository.getSheetProductLinksBatch.mockResolvedValue(
        new Map([
          [
            10,
            {
              product_link_id: 700,
            },
          ],
        ]),
      );

      tx.master_product_link.findUnique.mockResolvedValue(null);

      await expect(
        service.saveNightEntriesBatch(
          tx,
          sheet,
          supplyRules,
          100,
          [
            {
              clientId: 1,
              productId: 10,
              orderedQty: 12,
            },
          ] as any,
          trayRules,
        ),
      ).rejects.toThrow(
        new BadRequestException('Invalid sheet product link'),
      );
    });

    it('persists resolvedViaFallback when commercial resolution falls back', async () => {
      orderCommercialService.resolve.mockResolvedValue({
        distributorId: 303,
        productLinkId: 701,
        gstPercentage: 18,
        gstInclusive: true,
        resolvedViaFallback: true,
      });

      ordersRepository.createSheetProduct.mockResolvedValue({
        product_link_id: 701,
      });

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_701', 100]]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        ordersRepository.createSheetProduct,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedViaFallback: true,
        }),
        tx,
      );
    });

    it('uses the actual pinned link when createSheetProduct returns a different link', async () => {
      orderCommercialService.resolve.mockResolvedValue({
        distributorId: 101,
        productLinkId: 501,
        gstPercentage: 18,
        gstInclusive: true,
        resolvedViaFallback: false,
      });

      ordersRepository.createSheetProduct.mockResolvedValue({
        product_link_id: 999,
      });

      tx.master_product_link.findUniqueOrThrow.mockResolvedValue({
        distributor_id: 404,
      });

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_999', 100]]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        tx.master_product_link.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { id: 999 },
        select: { distributor_id: true },
      });

      expect(
        ordersRepository.getSellingRatesBatch,
      ).toHaveBeenCalledWith(
        [{ clientId: 1, productLinkId: 999 }],
        sheet.order_paper.sale_date,
        tx,
      );
    });

    it('resolves the same product only once when multiple clients use it', async () => {
      ordersRepository.getProductsWithPackagingBatch.mockResolvedValue(
        new Map([[10, product]]),
      );

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([
          ['1_501', 100],
          ['2_501', 100],
        ]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 10,
          },
          {
            clientId: 2,
            productId: 10,
            orderedQty: 20,
          },
        ] as any,
        trayRules,
      );

      expect(
        orderCommercialService.resolve,
      ).toHaveBeenCalledTimes(1);

      expect(
        ordersRepository.createSheetProduct,
      ).toHaveBeenCalledTimes(1);

      expect(
        ordersRepository.upsertSheetEntry,
      ).toHaveBeenCalledTimes(2);
    });

    it('batch fetches products using unique active product ids', async () => {
      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([
          ['1_501', 100],
          ['2_501', 100],
        ]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 10,
          },
          {
            clientId: 2,
            productId: 10,
            orderedQty: 20,
          },
        ] as any,
        trayRules,
      );

      expect(
        ordersRepository.getProductsWithPackagingBatch,
      ).toHaveBeenCalledWith([10], tx);
    });

    it('rejects when no selling rate exists', async () => {
      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map(),
      );

      await expect(
        service.saveNightEntriesBatch(
          tx,
          sheet,
          supplyRules,
          100,
          [
            {
              clientId: 1,
              productId: 10,
              orderedQty: 10,
            },
          ] as any,
          trayRules,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(
        ordersRepository.upsertSheetEntry,
      ).not.toHaveBeenCalled();
    });

    it('rejects when the resolved product is missing from the product map', async () => {
      ordersRepository.getProductsWithPackagingBatch.mockResolvedValue(
        new Map(),
      );

      await expect(
        service.saveNightEntriesBatch(
          tx,
          sheet,
          supplyRules,
          100,
          [
            {
              clientId: 1,
              productId: 10,
              orderedQty: 10,
            },
          ] as any,
          trayRules,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          ERROR_MESSAGES.PRODUCT_NOT_FOUND(10),
        ),
      );
    });

    it('resolves the tray rule only for a new item', async () => {
      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 10,
          },
        ] as any,
        trayRules,
      );

      expect(
        trayCalculationService.resolveTrayRule,
      ).toHaveBeenCalledWith(product, trayRules);

      expect(
        ordersRepository.upsertSheetEntry,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tray_type_id: 7,
        }),
        tx,
      );
    });

    it('delegates night billing calculation with ordered quantity, rate, and multiplier', async () => {
      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_501', 125]]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        nightBillingService.calculate,
      ).toHaveBeenCalledWith(
        12,
        125,
        1,
      );
    });

    it('writes zeroed final billing fields for an existing zero-quantity item', async () => {
      const zeroProduct = {
        ...product,
        gst_percentage: 5,
      };

      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map([
          ['1_10', existingItem],
        ]),
      );

      ordersRepository.getProductsWithPackagingBatch.mockResolvedValue(
        new Map([[10, zeroProduct]]),
      );

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_501', 100]]),
      );

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 0,
          },
        ] as any,
        trayRules,
      );

      expect(
        ordersRepository.upsertSheetEntry,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          delivered_qty: 0,
          final_selling_rate: 100,
          final_gst_percentage: 5,
          final_gst_amount: 0,
          final_taxable_amount: 0,
          final_bill_amount: 0,
        }),
        tx,
      );
    });

    it('passes night billing amount to upsertSheetEntry', async () => {
      nightBillingService.calculate.mockReturnValue({
        nightBillAmount: 1234.5,
      });

      await service.saveNightEntriesBatch(
        tx,
        sheet,
        supplyRules,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            orderedQty: 12,
          },
        ] as any,
        trayRules,
      );

      expect(
        ordersRepository.upsertSheetEntry,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          ordered_qty: 12,
          night_selling_rate: 100,
          night_bill_amount: 1234.5,
          product_link_id: 501,
        }),
        tx,
      );
    });
  });

  describe('saveMorningEntriesBatch', () => {
    const existingItem = {
      product_link_id: 501,
      product_link: {
        distributor_id: 101,
      },
      master_product: {
        id: 10,
        gst_percentage: 18,
        is_gst_inclusive: true,
        master_packaging_type: {
          unit_multiplier: 1,
        },
      },
    };

    beforeEach(() => {
      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map([
          ['1_10', existingItem],
        ]),
      );

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([['1_501', 100]]),
      );

      finalBillingService.calculate.mockReturnValue({
        gstAmount: 18,
        taxableAmount: 100,
        finalBillAmount: 118,
      });

      tx.order_sheet_items.update.mockResolvedValue({});
    });

    it('updates an existing item with delivered quantity and final billing values', async () => {
      await service.saveMorningEntriesBatch(
        tx,
        sheet,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            deliveredQty: 8,
          },
        ] as any,
      );

      expect(
        tx.order_sheet_items.update,
      ).toHaveBeenCalledWith({
        where: {
          order_sheet_id_client_id_product_link_id: {
            order_sheet_id: 100,
            client_id: 1,
            product_link_id: 501,
          },
        },
        data: {
          delivered_qty: 8,
          final_selling_rate: 100,
          final_gst_percentage: 18,
          final_gst_amount: 18,
          final_taxable_amount: 100,
          final_bill_amount: 118,
        },
      });
    });

    it('skips a missing item when delivered quantity is zero', async () => {
      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map(),
      );

      await service.saveMorningEntriesBatch(
        tx,
        sheet,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            deliveredQty: 0,
          },
        ] as any,
      );

      expect(
        ordersRepository.getSellingRatesBatch,
      ).not.toHaveBeenCalled();

      expect(
        tx.order_sheet_items.update,
      ).not.toHaveBeenCalled();
    });

    it('rejects a missing item when delivered quantity is positive', async () => {
      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map(),
      );

      await expect(
        service.saveMorningEntriesBatch(
          tx,
          sheet,
          100,
          [
            {
              clientId: 1,
              productId: 10,
              deliveredQty: 5,
            },
          ] as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          ERROR_MESSAGES.NO_ORDERED_QUANTITY(1, 10),
        ),
      );

      expect(
        ordersRepository.getSellingRatesBatch,
      ).not.toHaveBeenCalled();
    });

    it('returns without doing anything when every entry is skipped', async () => {
      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map(),
      );

      await service.saveMorningEntriesBatch(
        tx,
        sheet,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            deliveredQty: 0,
          },
          {
            clientId: 2,
            productId: 20,
            deliveredQty: 0,
          },
        ] as any,
      );

      expect(
        ordersRepository.getSellingRatesBatch,
      ).not.toHaveBeenCalled();

      expect(
        tx.order_sheet_items.update,
      ).not.toHaveBeenCalled();
    });

    it('uses the existing pinned product link when fetching the selling rate', async () => {
      await service.saveMorningEntriesBatch(
        tx,
        sheet,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            deliveredQty: 8,
          },
        ] as any,
      );

      expect(
        ordersRepository.getSellingRatesBatch,
      ).toHaveBeenCalledWith(
        [
          {
            clientId: 1,
            productLinkId: 501,
          },
        ],
        sheet.order_paper.sale_date,
        tx,
      );
    });

    it('rejects when the selling rate is missing', async () => {
      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map(),
      );

      await expect(
        service.saveMorningEntriesBatch(
          tx,
          sheet,
          100,
          [
            {
              clientId: 1,
              productId: 10,
              deliveredQty: 8,
            },
          ] as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'No rate configured for client 1 product 10',
        ),
      );

      expect(
        tx.order_sheet_items.update,
      ).not.toHaveBeenCalled();
    });

    it('delegates final billing calculation with delivered quantity and product values', async () => {
      await service.saveMorningEntriesBatch(
        tx,
        sheet,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            deliveredQty: 8,
          },
        ] as any,
      );

      expect(
        finalBillingService.calculate,
      ).toHaveBeenCalledWith(
        8,
        100,
        18,
        true,
        1,
      );
    });

    it('uses zero when the product GST percentage is null', async () => {
      const itemWithoutGst = {
        ...existingItem,
        master_product: {
          ...existingItem.master_product,
          gst_percentage: null,
        },
      };

      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map([
          ['1_10', itemWithoutGst],
        ]),
      );

      await service.saveMorningEntriesBatch(
        tx,
        sheet,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            deliveredQty: 8,
          },
        ] as any,
      );

      expect(
        finalBillingService.calculate,
      ).toHaveBeenCalledWith(
        8,
        100,
        0,
        true,
        1,
      );
    });

    it('processes multiple active morning entries using their pinned product links', async () => {
      const secondItem = {
        product_link_id: 502,
        product_link: {
          distributor_id: 102,
        },
        master_product: {
          id: 20,
          gst_percentage: 5,
          is_gst_inclusive: false,
          master_packaging_type: {
            unit_multiplier: 2,
          },
        },
      };

      ordersRepository.findSheetItemsByProductBatch.mockResolvedValue(
        new Map([
          ['1_10', existingItem],
          ['2_20', secondItem],
        ]),
      );

      ordersRepository.getSellingRatesBatch.mockResolvedValue(
        new Map([
          ['1_501', 100],
          ['2_502', 200],
        ]),
      );

      finalBillingService.calculate
        .mockReturnValueOnce({
          gstAmount: 18,
          taxableAmount: 100,
          finalBillAmount: 118,
        })
        .mockReturnValueOnce({
          gstAmount: 20,
          taxableAmount: 200,
          finalBillAmount: 220,
        });

      await service.saveMorningEntriesBatch(
        tx,
        sheet,
        100,
        [
          {
            clientId: 1,
            productId: 10,
            deliveredQty: 8,
          },
          {
            clientId: 2,
            productId: 20,
            deliveredQty: 4,
          },
        ] as any,
      );

      expect(
        ordersRepository.getSellingRatesBatch,
      ).toHaveBeenCalledWith(
        [
          { clientId: 1, productLinkId: 501 },
          { clientId: 2, productLinkId: 502 },
        ],
        sheet.order_paper.sale_date,
        tx,
      );

      expect(
        tx.order_sheet_items.update,
      ).toHaveBeenCalledTimes(2);
    });
  });
});