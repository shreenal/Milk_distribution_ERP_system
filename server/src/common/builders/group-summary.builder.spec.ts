import { describe, expect, it } from 'vitest';
import {
  DeliverySession,
  SupplyCategory,
} from '../../generated/prisma/client.js';
import { GroupSummaryBuilder } from './group-summary.builder.js';
import { ProductColumnsBuilder } from './product-columns.builder.js';

describe('GroupSummaryBuilder', () => {
  it('aggregates the same group/product across different distributors', () => {
    const productColumnsBuilder = new ProductColumnsBuilder();
    const builder = new GroupSummaryBuilder(productColumnsBuilder);

    const product = {
      id: 101,
      master_brand: {
        id: 1,
        name: 'Brand A',
      },
      master_product_group: {
        id: 1,
        name: 'Milk',
      },
      master_product_type: {
        id: 1,
        name: 'Milk',
      },
      master_packaging_type: {
        id: 1,
        name: 'Packet',
      },
      packaging_size: 500,
      packaging_unit: 'ML',
    } as any;

    const orderItems = [
      {
        groupId: 12,
        groupName: 'Group 12',
        productId: 101,
        orderedQty: 10,
        distributorId: 4,
        deliverySession: DeliverySession.MORNING,
        category: SupplyCategory.MILK,
        master_product: product,
      },
      {
        groupId: 12,
        groupName: 'Group 12',
        productId: 101,
        orderedQty: 15,
        distributorId: 5,
        deliverySession: DeliverySession.MORNING,
        category: SupplyCategory.MILK,
        master_product: product,
      },
    ];

    const result = builder.build(orderItems, DeliverySession.MORNING);

    expect(result.rows).toHaveLength(1);

    expect(result.rows[0]).toMatchObject({
      groupId: 12,
      groupName: 'Group 12',
      product_101: 25,
    });

    expect(result.totals).toEqual({
      product_101: 25,
    });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe(101);
  });

  it('creates separate rows for different groups and calculates totals correctly', () => {
    const productColumnsBuilder = new ProductColumnsBuilder();
    const builder = new GroupSummaryBuilder(productColumnsBuilder);

    const product101 = {
      id: 101,
      master_brand: {
        id: 1,
        name: 'Brand A',
      },
      master_product_group: {
        id: 1,
        name: 'Milk',
      },
      master_product_type: {
        id: 1,
        name: 'Milk',
      },
      master_packaging_type: {
        id: 1,
        name: 'Packet',
      },
      packaging_size: 500,
      packaging_unit: 'ML',
    } as any;

    const product102 = {
      id: 102,
      master_brand: {
        id: 1,
        name: 'Brand A',
      },
      master_product_group: {
        id: 1,
        name: 'Milk',
      },
      master_product_type: {
        id: 1,
        name: 'Milk',
      },
      master_packaging_type: {
        id: 1,
        name: 'Packet',
      },
      packaging_size: 1,
      packaging_unit: 'L',
    } as any;

    const orderItems = [
      {
        groupId: 12,
        groupName: 'Group 12',
        productId: 101,
        orderedQty: 10,
        distributorId: 4,
        deliverySession: DeliverySession.MORNING,
        category: SupplyCategory.MILK,
        master_product: product101,
      },
      {
        groupId: 12,
        groupName: 'Group 12',
        productId: 102,
        orderedQty: 8,
        distributorId: 5,
        deliverySession: DeliverySession.MORNING,
        category: SupplyCategory.MILK,
        master_product: product102,
      },
      {
        groupId: 20,
        groupName: 'Group 20',
        productId: 101,
        orderedQty: 20,
        distributorId: 4,
        deliverySession: DeliverySession.MORNING,
        category: SupplyCategory.MILK,
        master_product: product101,
      },
    ];

    const result = builder.build(orderItems, DeliverySession.MORNING);

    expect(result.rows).toHaveLength(2);

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId: 12,
          groupName: 'Group 12',
          product_101: 10,
          product_102: 8,
        }),
        expect.objectContaining({
          groupId: 20,
          groupName: 'Group 20',
          product_101: 20,
        }),
      ]),
    );

    expect(result.totals).toEqual({
      product_101: 30,
      product_102: 8,
    });

    expect(result.products).toHaveLength(2);
    expect(result.products.map((product) => product.id)).toEqual(
      expect.arrayContaining([101, 102]),
    );
  });

  it('filters rows and quantities by delivery session', () => {
    const productColumnsBuilder = new ProductColumnsBuilder();
    const builder = new GroupSummaryBuilder(productColumnsBuilder);

    const product101 = {
      id: 101,
      master_brand: {
        id: 1,
        name: 'Brand A',
      },
      master_product_group: {
        id: 1,
        name: 'Milk',
      },
      master_product_type: {
        id: 1,
        name: 'Milk',
      },
      master_packaging_type: {
        id: 1,
        name: 'Packet',
      },
      packaging_size: 500,
      packaging_unit: 'ML',
    } as any;

    const product102 = {
      id: 102,
      master_brand: {
        id: 1,
        name: 'Brand A',
      },
      master_product_group: {
        id: 1,
        name: 'Milk',
      },
      master_product_type: {
        id: 1,
        name: 'Milk',
      },
      master_packaging_type: {
        id: 1,
        name: 'Packet',
      },
      packaging_size: 1,
      packaging_unit: 'L',
    } as any;

    const orderItems = [
      {
        groupId: 12,
        groupName: 'Group 12',
        distributorId: 4,
        category: SupplyCategory.MILK,
        deliverySession: DeliverySession.MORNING,
        productId: 101,
        orderedQty: 10,
        master_product: product101,
      },
      {
        groupId: 12,
        groupName: 'Group 12',
        distributorId: 5,
        category: SupplyCategory.MILK,
        deliverySession: DeliverySession.NIGHT,
        productId: 101,
        orderedQty: 15,
        master_product: product101,
      },
      {
        groupId: 13,
        groupName: 'Group 13',
        distributorId: 4,
        category: SupplyCategory.MILK,
        deliverySession: DeliverySession.MORNING,
        productId: 102,
        orderedQty: 20,
        master_product: product102,
      },
    ];

    const result = builder.build(orderItems, DeliverySession.MORNING);

    expect(result.rows).toEqual([
      {
        groupId: 12,
        groupName: 'Group 12',
        product_101: 10,
      },
      {
        groupId: 13,
        groupName: 'Group 13',
        product_102: 20,
      },
    ]);

    expect(result.totals).toEqual({
      product_101: 10,
      product_102: 20,
    });

    expect(result.products.map((product) => product.id)).toEqual([101, 102]);
  });
});
