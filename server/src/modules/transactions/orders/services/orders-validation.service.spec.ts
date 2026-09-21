import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { OrdersValidationService } from './orders-validation.service.js';
import { ERROR_MESSAGES } from '../orders.constants.js';

describe('OrdersValidationService', () => {
  let service: OrdersValidationService;

  const db = {
    master_product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    master_client: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const ordersRepository = {
    getSheetItems: vi.fn(),
    getMorningValidationItems: vi.fn(),
    getQuantityValidationItems: vi.fn(),
  };

  const trayCalculationService = {
    resolveTrayRule: vi.fn(),
    getProductTrayRules: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrdersValidationService(
      ordersRepository as any,
      trayCalculationService as any,
    );
  });

  describe('validateProduct', () => {
    it('returns the product when it exists and is active', async () => {
      const product = {
        id: 10,
        is_active: true,
      };

      db.master_product.findUnique.mockResolvedValue(product);

      await expect(service.validateProduct(10, db as any)).resolves.toEqual(
        product,
      );

      expect(db.master_product.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
        select: {
          id: true,
          is_active: true,
        },
      });
    });

    it('rejects when the product does not exist', async () => {
      db.master_product.findUnique.mockResolvedValue(null);

      await expect(
        service.validateProduct(10, db as any),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PRODUCT_NOT_FOUND(10)),
      );
    });

    it('rejects when the product is inactive', async () => {
      db.master_product.findUnique.mockResolvedValue({
        id: 10,
        is_active: false,
      });

      await expect(
        service.validateProduct(10, db as any),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PRODUCT_INACTIVE('10')),
      );
    });
  });

  describe('validateClient', () => {
    it('returns the client when it exists and is active', async () => {
      const client = {
        id: 20,
        name: 'Client A',
        is_active: true,
      };

      db.master_client.findUnique.mockResolvedValue(client);

      await expect(service.validateClient(20, db as any)).resolves.toEqual(
        client,
      );

      expect(db.master_client.findUnique).toHaveBeenCalledWith({
        where: { id: 20 },
        select: {
          id: true,
          name: true,
          is_active: true,
        },
      });
    });

    it('rejects when the client does not exist', async () => {
      db.master_client.findUnique.mockResolvedValue(null);

      await expect(
        service.validateClient(20, db as any),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.CLIENT_NOT_FOUND(20)),
      );
    });

    it('rejects when the client is inactive', async () => {
      db.master_client.findUnique.mockResolvedValue({
        id: 20,
        name: 'Client A',
        is_active: false,
      });

      await expect(
        service.validateClient(20, db as any),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.CLIENT_INACTIVE('Client A')),
      );
    });
  });

  describe('validateClientInGroup', () => {
    it('returns the client when it belongs to the requested group', async () => {
      const client = {
        id: 20,
        delivery_group_id: 5,
      };

      db.master_client.findUnique.mockResolvedValue(client);

      await expect(
        service.validateClientInGroup(20, 5, db as any),
      ).resolves.toEqual(client);
    });

    it('rejects when the client does not exist', async () => {
      db.master_client.findUnique.mockResolvedValue(null);

      await expect(
        service.validateClientInGroup(20, 5, db as any),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.CLIENT_NOT_FOUND(20)),
      );
    });

    it('rejects when the client belongs to a different group', async () => {
      db.master_client.findUnique.mockResolvedValue({
        id: 20,
        delivery_group_id: 7,
      });

      await expect(
        service.validateClientInGroup(20, 5, db as any),
      ).rejects.toThrow(
        new BadRequestException(
          ERROR_MESSAGES.CLIENT_NOT_IN_GROUP(20, 5),
        ),
      );
    });
  });

  describe('validateClientCanBuyProductCategory', () => {
    it('returns true when the client is authorized for the product category', async () => {
      db.master_client.findUnique.mockResolvedValue({
        id: 20,
        name: 'Client A',
        categories: [
          { category: 'DAIRY' },
          { category: 'MILK' },
        ],
      });

      db.master_product.findUnique.mockResolvedValue({
        id: 10,
        master_product_group: {
          category: 'DAIRY',
        },
      });

      await expect(
        service.validateClientCanBuyProductCategory(20, 10, db as any),
      ).resolves.toBe(true);
    });

    it('rejects when the client does not exist', async () => {
      db.master_client.findUnique.mockResolvedValue(null);

      await expect(
        service.validateClientCanBuyProductCategory(20, 10, db as any),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.CLIENT_NOT_FOUND(20)),
      );

      expect(db.master_product.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when the product does not exist', async () => {
      db.master_client.findUnique.mockResolvedValue({
        id: 20,
        name: 'Client A',
        categories: [{ category: 'DAIRY' }],
      });

      db.master_product.findUnique.mockResolvedValue(null);

      await expect(
        service.validateClientCanBuyProductCategory(20, 10, db as any),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PRODUCT_NOT_FOUND(10)),
      );
    });

    it('rejects when the client is not authorized for the product category', async () => {
      db.master_client.findUnique.mockResolvedValue({
        id: 20,
        name: 'Client A',
        categories: [{ category: 'DAIRY' }],
      });

      db.master_product.findUnique.mockResolvedValue({
        id: 10,
        master_product_group: {
          category: 'ICE_CREAM',
        },
      });

      await expect(
        service.validateClientCanBuyProductCategory(20, 10, db as any),
      ).rejects.toThrow(
        new BadRequestException(
          'Client "Client A" is not authorized to purchase ICE_CREAM products',
        ),
      );
    });
  });

  describe('validateNoDuplicates', () => {
    it('accepts entries with unique client/product pairs', () => {
      expect(() =>
        service.validateNoDuplicates([
          { clientId: 1, productId: 10 },
          { clientId: 1, productId: 11 },
          { clientId: 2, productId: 10 },
        ]),
      ).not.toThrow();
    });

    it('rejects duplicate client/product pairs', () => {
      expect(() =>
        service.validateNoDuplicates([
          { clientId: 1, productId: 10 },
          { clientId: 1, productId: 10 },
        ]),
      ).toThrow(
        new BadRequestException(
          ERROR_MESSAGES.DUPLICATE_ENTRIES(['1-10']),
        ),
      );
    });

    it('treats different clients with the same product as different entries', () => {
      expect(() =>
        service.validateNoDuplicates([
          { clientId: 1, productId: 10 },
          { clientId: 2, productId: 10 },
        ]),
      ).not.toThrow();
    });

    it('reports every duplicate key encountered', () => {
      expect(() =>
        service.validateNoDuplicates([
          { clientId: 1, productId: 10 },
          { clientId: 1, productId: 10 },
          { clientId: 2, productId: 20 },
          { clientId: 2, productId: 20 },
        ]),
      ).toThrow(
        new BadRequestException(
          ERROR_MESSAGES.DUPLICATE_ENTRIES(['1-10', '2-20']),
        ),
      );
    });
  });

  describe('validateOrderedQuantity', () => {
    const product = {
      id: 10,
      brand_id: 1,
      product_group_id: 2,
      product_type_id: 3,
      packaging_type_id: 4,
    };

    const trayRules = [];

    it('accepts zero quantity for a tray product', () => {
      trayCalculationService.resolveTrayRule.mockReturnValue({
        tray_type_id: 1,
      });

      expect(() =>
        service.validateOrderedQuantity(0, product as any, trayRules),
      ).not.toThrow();
    });

    it.each([0.5, 1, 1.5, 10, 10.5, 100])(
      'accepts valid two-decimal quantity %s for a tray product',
      (qty) => {
        trayCalculationService.resolveTrayRule.mockReturnValue({
          tray_type_id: 1,
        });

        expect(() =>
          service.validateOrderedQuantity(qty, product as any, trayRules),
        ).not.toThrow();
      },
    );

    it('rejects negative quantities', () => {
      trayCalculationService.resolveTrayRule.mockReturnValue({
        tray_type_id: 1,
      });

      expect(() =>
        service.validateOrderedQuantity(-0.5, product as any, trayRules),
      ).toThrow(
        new BadRequestException(
          ERROR_MESSAGES.QUANTITY_NEGATIVE('ordered quantity', -0.5),
        ),
      );
    });

    it.each([10.001, 10.005, 10.123])(
      'rejects quantity %s beyond two decimal places',
      (qty) => {
        trayCalculationService.resolveTrayRule.mockReturnValue({
          tray_type_id: 1,
        });

        expect(() =>
          service.validateOrderedQuantity(qty, product as any, trayRules),
        ).toThrow(
          new BadRequestException(
            ERROR_MESSAGES.INVALID_QUANTITY_PRECISION(qty, 0.01),
          ),
        );
      },
    );

    it('allows non-tray products without tray quantity precision validation', () => {
      trayCalculationService.resolveTrayRule.mockReturnValue(null);

      expect(() =>
        service.validateOrderedQuantity(10.123, product as any, trayRules),
      ).not.toThrow();
    });

    it('resolves the tray rule using the supplied product and rules', () => {
      trayCalculationService.resolveTrayRule.mockReturnValue(null);

      service.validateOrderedQuantity(10, product as any, trayRules);

      expect(
        trayCalculationService.resolveTrayRule,
      ).toHaveBeenCalledWith(product, trayRules);
    });
  });

  describe('validateDeliveredQuantity', () => {
    it('accepts zero delivered quantity for a tray item', () => {
      expect(() =>
        service.validateDeliveredQuantity(0, { tray_type_id: 1 }),
      ).not.toThrow();
    });

    it.each([0.5, 1, 1.5, 10.5])(
      'accepts valid two-decimal delivered quantity %s',
      (qty) => {
        expect(() =>
          service.validateDeliveredQuantity(qty, { tray_type_id: 1 }),
        ).not.toThrow();
      },
    );

    it('rejects negative delivered quantities', () => {
      expect(() =>
        service.validateDeliveredQuantity(-1, { tray_type_id: 1 }),
      ).toThrow(
        new BadRequestException(
          ERROR_MESSAGES.QUANTITY_NEGATIVE('delivered quantity', -1),
        ),
      );
    });

    it('rejects delivered quantities beyond two decimal places', () => {
      expect(() =>
        service.validateDeliveredQuantity(10.123, { tray_type_id: 1 }),
      ).toThrow(
        new BadRequestException(
          ERROR_MESSAGES.INVALID_QUANTITY_PRECISION(10.123, 0.01),
        ),
      );
    });

    it('allows any decimal quantity for a non-tray item', () => {
      expect(() =>
        service.validateDeliveredQuantity(10.123, { tray_type_id: null }),
      ).not.toThrow();
    });
  });

  describe('validateNightEntriesComplete', () => {
    it('accepts a sheet containing at least one item', async () => {
      ordersRepository.getSheetItems.mockResolvedValue([
        { id: 1 },
      ]);

      await expect(
        service.validateNightEntriesComplete(100, 'Morning', db as any),
      ).resolves.toBeUndefined();
    });

    it('rejects an empty sheet', async () => {
      ordersRepository.getSheetItems.mockResolvedValue([]);

      await expect(
        service.validateNightEntriesComplete(100, 'Morning', db as any),
      ).rejects.toThrow(
        new BadRequestException(
          ERROR_MESSAGES.NO_ORDERS_IN_SHEET('Morning'),
        ),
      );
    });

    it('passes the sheet id and db to the repository', async () => {
      ordersRepository.getSheetItems.mockResolvedValue([{ id: 1 }]);

      await service.validateNightEntriesComplete(
        100,
        'Morning',
        db as any,
      );

      expect(
        ordersRepository.getSheetItems,
      ).toHaveBeenCalledWith(100, db);
    });
  });

  describe('validateMorningEntriesComplete', () => {
    it('accepts an empty result', async () => {
      ordersRepository.getMorningValidationItems.mockResolvedValue([]);

      await expect(
        service.validateMorningEntriesComplete(100, db as any),
      ).resolves.toBeUndefined();
    });

    it('accepts items when every delivered quantity is present', async () => {
      ordersRepository.getMorningValidationItems.mockResolvedValue([
        {
          delivered_qty: 10,
          master_product: { code: 'P001' },
        },
        {
          delivered_qty: 0,
          master_product: { code: 'P002' },
        },
      ]);

      await expect(
        service.validateMorningEntriesComplete(100, db as any),
      ).resolves.toBeUndefined();
    });

    it('rejects when delivered quantity is null', async () => {
      ordersRepository.getMorningValidationItems.mockResolvedValue([
        {
          delivered_qty: null,
          master_product: { code: 'P001' },
        },
      ]);

      await expect(
        service.validateMorningEntriesComplete(100, db as any),
      ).rejects.toThrow(
        new BadRequestException(
          'Delivered quantity missing for: P001',
        ),
      );
    });

    it('rejects when delivered quantity is undefined', async () => {
      ordersRepository.getMorningValidationItems.mockResolvedValue([
        {
          delivered_qty: undefined,
          master_product: { code: 'P001' },
        },
      ]);

      await expect(
        service.validateMorningEntriesComplete(100, db as any),
      ).rejects.toThrow(
        new BadRequestException(
          'Delivered quantity missing for: P001',
        ),
      );
    });

    it('reports all incomplete product codes', async () => {
      ordersRepository.getMorningValidationItems.mockResolvedValue([
        {
          delivered_qty: null,
          master_product: { code: 'P001' },
        },
        {
          delivered_qty: 10,
          master_product: { code: 'P002' },
        },
        {
          delivered_qty: undefined,
          master_product: { code: 'P003' },
        },
      ]);

      await expect(
        service.validateMorningEntriesComplete(100, db as any),
      ).rejects.toThrow(
        new BadRequestException(
          'Delivered quantity missing for: P001, P003',
        ),
      );
    });
  });

  describe('validateQuantitySanity', () => {
    it('accepts normal quantities', async () => {
      ordersRepository.getQuantityValidationItems.mockResolvedValue([
        {
          ordered_qty: 10,
          delivered_qty: 10,
          master_product: { code: 'P001' },
        },
      ]);

      await expect(
        service.validateQuantitySanity(100, db as any),
      ).resolves.toBeUndefined();
    });

    it('rejects negative delivered quantities', async () => {
      ordersRepository.getQuantityValidationItems.mockResolvedValue([
        {
          ordered_qty: 10,
          delivered_qty: -1,
          master_product: { code: 'P001' },
        },
      ]);

      await expect(
        service.validateQuantitySanity(100, db as any),
      ).rejects.toThrow(
        new BadRequestException(
          'Negative quantities not allowed: P001',
        ),
      );
    });

    it('reports all products with negative delivered quantities', async () => {
      ordersRepository.getQuantityValidationItems.mockResolvedValue([
        {
          ordered_qty: 10,
          delivered_qty: -1,
          master_product: { code: 'P001' },
        },
        {
          ordered_qty: 5,
          delivered_qty: -2,
          master_product: { code: 'P002' },
        },
      ]);

      await expect(
        service.validateQuantitySanity(100, db as any),
      ).rejects.toThrow(
        new BadRequestException(
          'Negative quantities not allowed: P001, P002',
        ),
      );
    });

    it('does not reject extreme over-delivery', async () => {
      ordersRepository.getQuantityValidationItems.mockResolvedValue([
        {
          ordered_qty: 10,
          delivered_qty: 16,
          master_product: { code: 'P001' },
        },
      ]);

      await expect(
        service.validateQuantitySanity(100, db as any),
      ).resolves.toBeUndefined();
    });

    it('does not classify exactly 150 percent as extreme', async () => {
      ordersRepository.getQuantityValidationItems.mockResolvedValue([
        {
          ordered_qty: 10,
          delivered_qty: 15,
          master_product: { code: 'P001' },
        },
      ]);

      await expect(
        service.validateQuantitySanity(100, db as any),
      ).resolves.toBeUndefined();
    });

    it('passes the sheet id and db to the repository', async () => {
      ordersRepository.getQuantityValidationItems.mockResolvedValue([]);

      await service.validateQuantitySanity(100, db as any);

      expect(
        ordersRepository.getQuantityValidationItems,
      ).toHaveBeenCalledWith(100, db);
    });
  });

  describe('validateEntriesBatch', () => {
    it('accepts valid entries', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: true,
          delivery_group_id: 5,
          categories: [{ category: 'DAIRY' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([
        {
          id: 10,
          is_active: true,
          master_product_group: {
            category: 'DAIRY',
          },
        },
      ]);

      await expect(
        service.validateEntriesBatch(
          [{ clientId: 1, productId: 10 }],
          5,
          db as any,
        ),
      ).resolves.toEqual(
        expect.any(Map),
      );
    });

    it('deduplicates client ids before querying', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: true,
          delivery_group_id: 5,
          categories: [{ category: 'DAIRY' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([
        {
          id: 10,
          is_active: true,
          master_product_group: {
            category: 'DAIRY',
          },
        },
      ]);

      await service.validateEntriesBatch(
        [
          { clientId: 1, productId: 10 },
          { clientId: 1, productId: 10 },
        ],
        5,
        db as any,
      );

      expect(db.master_client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [1] } },
        }),
      );

      expect(db.master_product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [10] } },
        }),
      );
    });

    it('rejects an unknown client', async () => {
      db.master_client.findMany.mockResolvedValue([]);
      db.master_product.findMany.mockResolvedValue([]);

      await expect(
        service.validateEntriesBatch(
          [{ clientId: 1, productId: 10 }],
          5,
          db as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.CLIENT_NOT_FOUND(1)),
      );
    });

    it('rejects an inactive client', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: false,
          delivery_group_id: 5,
          categories: [{ category: 'DAIRY' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([]);

      await expect(
        service.validateEntriesBatch(
          [{ clientId: 1, productId: 10 }],
          5,
          db as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          ERROR_MESSAGES.CLIENT_INACTIVE('Client A'),
        ),
      );
    });

    it('rejects a client outside the requested group', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: true,
          delivery_group_id: 7,
          categories: [{ category: 'DAIRY' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([]);

      await expect(
        service.validateEntriesBatch(
          [{ clientId: 1, productId: 10 }],
          5,
          db as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          ERROR_MESSAGES.CLIENT_NOT_IN_GROUP(1, 5),
        ),
      );
    });

    it('rejects an unknown product', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: true,
          delivery_group_id: 5,
          categories: [{ category: 'DAIRY' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([]);

      await expect(
        service.validateEntriesBatch(
          [{ clientId: 1, productId: 10 }],
          5,
          db as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PRODUCT_NOT_FOUND(10)),
      );
    });

    it('rejects an inactive product', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: true,
          delivery_group_id: 5,
          categories: [{ category: 'DAIRY' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([
        {
          id: 10,
          is_active: false,
          master_product_group: {
            category: 'DAIRY',
          },
        },
      ]);

      await expect(
        service.validateEntriesBatch(
          [{ clientId: 1, productId: 10 }],
          5,
          db as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(ERROR_MESSAGES.PRODUCT_INACTIVE('10')),
      );
    });

    it('rejects when the client is not authorized for the product category', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: true,
          delivery_group_id: 5,
          categories: [{ category: 'DAIRY' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([
        {
          id: 10,
          is_active: true,
          master_product_group: {
            category: 'ICE_CREAM',
          },
        },
      ]);

      await expect(
        service.validateEntriesBatch(
          [{ clientId: 1, productId: 10 }],
          5,
          db as any,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Client "Client A" is not authorized to purchase ICE_CREAM products',
        ),
      );
    });

    it('validates multiple entries against the fetched maps', async () => {
      db.master_client.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Client A',
          is_active: true,
          delivery_group_id: 5,
          categories: [{ category: 'DAIRY' }],
        },
        {
          id: 2,
          name: 'Client B',
          is_active: true,
          delivery_group_id: 5,
          categories: [{ category: 'ICE_CREAM' }],
        },
      ]);

      db.master_product.findMany.mockResolvedValue([
        {
          id: 10,
          is_active: true,
          master_product_group: {
            category: 'DAIRY',
          },
        },
        {
          id: 20,
          is_active: true,
          master_product_group: {
            category: 'ICE_CREAM',
          },
        },
      ]);

      await expect(
        service.validateEntriesBatch(
          [
            { clientId: 1, productId: 10 },
            { clientId: 2, productId: 20 },
          ],
          5,
          db as any,
        ),
      ).resolves.toEqual(expect.any(Map));
    });
  });
});