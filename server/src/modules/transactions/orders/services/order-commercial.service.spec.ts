import { BadRequestException } from '@nestjs/common';
import { SupplyCategory } from '../../../../generated/prisma/client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderCommercialService } from './order-commercial.service.js';

describe('OrderCommercialService', () => {
  let service: OrderCommercialService;

  const ordersRepository = {
    getProductWithGroup: vi.fn(),
    getEligibleDistributorsForProduct: vi.fn(),
    getProductLinksBatch: vi.fn(),
  };

  const tx = {} as any;

  const product = {
    id: 10,
    brand_id: 100,
    product_group_id: 200,
    gst_percentage: 18,
    is_gst_inclusive: true,
    master_product_group: {
      category: SupplyCategory.MILK,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrderCommercialService(
      ordersRepository as any,
    );
  });

  describe('resolve', () => {
    it('uses the milk distributor supply rule for MILK products', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([[101, { id: 501 }]]),
      );

      const result = await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(
        ordersRepository.getEligibleDistributorsForProduct,
      ).toHaveBeenCalledWith(
        5,
        10,
        100,
        200,
        SupplyCategory.MILK,
        101,
        tx,
      );

      expect(result).toEqual({
        distributorId: 101,
        productLinkId: 501,
        gstPercentage: 18,
        gstInclusive: true,
        resolvedViaFallback: false,
      });
    });

    it('uses the non-milk distributor supply rule for non-MILK products', async () => {
      const nonMilkProduct = {
        ...product,
        master_product_group: {
          category: SupplyCategory.NON_MILK,
        },
      };

      ordersRepository.getProductWithGroup.mockResolvedValue(
        nonMilkProduct,
      );

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 202,
          priority: 1,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([[202, { id: 502 }]]),
      );

      const result = await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(
        ordersRepository.getEligibleDistributorsForProduct,
      ).toHaveBeenCalledWith(
        5,
        10,
        100,
        200,
        SupplyCategory.NON_MILK,
        202,
        tx,
      );

      expect(result.distributorId).toBe(202);
      expect(result.productLinkId).toBe(502);
      expect(result.resolvedViaFallback).toBe(false);
    });

    it('rejects when the milk distributor supply rule is missing', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      await expect(
        service.resolve(
          5,
          10,
          {
            milkDistributorId: null,
            nonMilkDistributorId: 202,
          },
          tx,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          `Missing ${SupplyCategory.MILK} distributor supply rule for group 5`,
        ),
      );

      expect(
        ordersRepository.getEligibleDistributorsForProduct,
      ).not.toHaveBeenCalled();

      expect(
        ordersRepository.getProductLinksBatch,
      ).not.toHaveBeenCalled();
    });

    it('rejects when the non-milk distributor supply rule is missing', async () => {
      const nonMilkProduct = {
        ...product,
        master_product_group: {
          category: SupplyCategory.NON_MILK,
        },
      };

      ordersRepository.getProductWithGroup.mockResolvedValue(
        nonMilkProduct,
      );

      await expect(
        service.resolve(
          5,
          10,
          {
            milkDistributorId: 101,
            nonMilkDistributorId: null,
          },
          tx,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          `Missing ${SupplyCategory.NON_MILK} distributor supply rule for group 5`,
        ),
      );
    });

    it('rejects when there are no eligible distributors', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue(
        [],
      );

      await expect(
        service.resolve(
          5,
          10,
          {
            milkDistributorId: 101,
            nonMilkDistributorId: 202,
          },
          tx,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'No eligible distributor found for product 10 in group 5',
        ),
      );

      expect(
        ordersRepository.getProductLinksBatch,
      ).not.toHaveBeenCalled();
    });

    it('selects the primary distributor when its product link exists', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
        {
          distributorId: 102,
          priority: 2,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([
          [101, { id: 501 }],
          [102, { id: 502 }],
        ]),
      );

      const result = await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(result).toEqual({
        distributorId: 101,
        productLinkId: 501,
        gstPercentage: 18,
        gstInclusive: true,
        resolvedViaFallback: false,
      });
    });

    it('falls back when the primary distributor has no product link', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
        {
          distributorId: 102,
          priority: 2,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([
          [102, { id: 502 }],
        ]),
      );

      const result = await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(result).toEqual({
        distributorId: 102,
        productLinkId: 502,
        gstPercentage: 18,
        gstInclusive: true,
        resolvedViaFallback: true,
      });
    });

    it('selects the first eligible distributor with a product link', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
        {
          distributorId: 102,
          priority: 2,
        },
        {
          distributorId: 103,
          priority: 3,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([
          [102, { id: 502 }],
          [103, { id: 503 }],
        ]),
      );

      const result = await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(result.distributorId).toBe(102);
      expect(result.productLinkId).toBe(502);
      expect(result.resolvedViaFallback).toBe(true);
    });

    it('rejects when no eligible distributor has a product link', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
        {
          distributorId: 102,
          priority: 2,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(new Map());

      await expect(
        service.resolve(
          5,
          10,
          {
            milkDistributorId: 101,
            nonMilkDistributorId: 202,
          },
          tx,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'No product link found for any eligible distributor for product 10 in group 5',
        ),
      );
    });

    it('passes all eligible distributor ids to getProductLinksBatch', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
        {
          distributorId: 102,
          priority: 2,
        },
        {
          distributorId: 103,
          priority: 3,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([[103, { id: 503 }]]),
      );

      await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(
        ordersRepository.getProductLinksBatch,
      ).toHaveBeenCalledWith(
        [101, 102, 103],
        10,
        tx,
        true,
      );
    });

    it('uses the product GST values in the returned commercial context', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue({
        ...product,
        gst_percentage: 5,
        is_gst_inclusive: false,
      });

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([[101, { id: 501 }]]),
      );

      const result = await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(result.gstPercentage).toBe(5);
      expect(result.gstInclusive).toBe(false);
    });

    it('converts a null GST percentage to zero', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue({
        ...product,
        gst_percentage: null,
      });

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([[101, { id: 501 }]]),
      );

      const result = await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(result.gstPercentage).toBe(0);
    });

    it('passes the transaction client through to repository calls', async () => {
      ordersRepository.getProductWithGroup.mockResolvedValue(product);

      ordersRepository.getEligibleDistributorsForProduct.mockResolvedValue([
        {
          distributorId: 101,
          priority: 1,
        },
      ]);

      ordersRepository.getProductLinksBatch.mockResolvedValue(
        new Map([[101, { id: 501 }]]),
      );

      await service.resolve(
        5,
        10,
        {
          milkDistributorId: 101,
          nonMilkDistributorId: 202,
        },
        tx,
      );

      expect(
        ordersRepository.getProductWithGroup,
      ).toHaveBeenCalledWith(10, tx);

      expect(
        ordersRepository.getEligibleDistributorsForProduct,
      ).toHaveBeenCalledWith(
        5,
        10,
        100,
        200,
        SupplyCategory.MILK,
        101,
        tx,
      );

      expect(
        ordersRepository.getProductLinksBatch,
      ).toHaveBeenCalledWith(
        [101],
        10,
        tx,
        true,
      );
    });
  });
});