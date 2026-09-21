import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';
import { ProductColumnsBuilder } from '../../../common/builders/product-columns.builder.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';

describe('VehicleAllocationBuilder', () => {
  let builder: VehicleAllocationBuilder;
  let productColumnsBuilder: {
    buildGroupedColumns: ReturnType<typeof vi.fn>;
  };

  const milkColumns = [
    {
      field: 'product_1',
      label: 'Product 1',
    },
  ] as any;

  const nonMilkColumns = [
    {
      field: 'product_2',
      label: 'Product 2',
      children: [
        {
          field: 'product_3',
          label: 'Product 3',
        },
      ],
    },
  ] as any;

  const products = [
    {
      id: 1,
      brand_id: 10,
      product_group_id: 20,
    },
    {
      id: 2,
      brand_id: 10,
      product_group_id: 21,
    },
  ] as any;

  beforeEach(() => {
    productColumnsBuilder = {
      buildGroupedColumns: vi.fn(),
    };

    builder = new VehicleAllocationBuilder(
      productColumnsBuilder as unknown as ProductColumnsBuilder,
    );
  });

  describe('buildVehicleRequirementGrids', () => {
    it('should build requirement grids from summaries', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue(milkColumns);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [
            {
              groupId: 1,
              groupName: 'Group 1',
              product_1: 10,
              product_2: 5,
            },
            {
              groupId: 2,
              groupName: 'Group 2',
              product_1: 7,
              product_2: 3,
            },
          ],
        },
      ] as any;

      const result = builder.buildVehicleRequirementGrids(summaries);

      expect(result).toEqual([
        {
          distributor: {
            id: 100,
          },
          category: SupplyCategory.MILK,
          brand: {
            id: 10,
            name: 'Brand A',
          },
          columns: milkColumns,
          rows: summaries[0].rows,
          totals: {
            product_1: 17,
            product_2: 8,
          },
        },
      ]);
    });

    it('should ignore groupId and groupName when calculating totals', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue(milkColumns);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [
            {
              groupId: 123,
              groupName: 'Should Not Be Included',
              product_1: 10,
            },
          ],
        },
      ] as any;

      const result = builder.buildVehicleRequirementGrids(summaries);

      expect(result[0].totals).toEqual({
        product_1: 10,
      });
      expect(result[0].totals).not.toHaveProperty('groupId');
      expect(result[0].totals).not.toHaveProperty('groupName');
    });

    it('should treat missing numeric values as zero', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue(milkColumns);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [
            {
              groupId: 1,
              groupName: 'Group 1',
              product_1: undefined,
            },
            {
              groupId: 2,
              groupName: 'Group 2',
              product_1: 5,
            },
          ],
        },
      ] as any;

      const result = builder.buildVehicleRequirementGrids(summaries);

      expect(result[0].totals).toEqual({
        product_1: 5,
      });
    });

    it('should convert numeric string values to numbers when calculating totals', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue(milkColumns);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [
            {
              groupId: 1,
              groupName: 'Group 1',
              product_1: '10',
            },
            {
              groupId: 2,
              groupName: 'Group 2',
              product_1: '5',
            },
          ],
        },
      ] as any;

      const result = builder.buildVehicleRequirementGrids(summaries);

      expect(result[0].totals).toEqual({
        product_1: 15,
      });
    });

    it('should include packaging columns for non-milk summaries', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue(
        nonMilkColumns,
      );

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.NON_MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [],
        },
      ] as any;

      builder.buildVehicleRequirementGrids(summaries);

      expect(
        productColumnsBuilder.buildGroupedColumns,
      ).toHaveBeenCalledWith(products, true);
    });

    it('should not include packaging columns for milk summaries', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue(milkColumns);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [],
        },
      ] as any;

      builder.buildVehicleRequirementGrids(summaries);

      expect(
        productColumnsBuilder.buildGroupedColumns,
      ).toHaveBeenCalledWith(products, false);
    });

    it('should build one requirement grid per summary', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue(milkColumns);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products: [],
          rows: [],
        },
        {
          distributorId: 200,
          category: SupplyCategory.NON_MILK,
          brandId: 20,
          brandName: 'Brand B',
          products: [],
          rows: [],
        },
      ] as any;

      const result = builder.buildVehicleRequirementGrids(summaries);

      expect(result).toHaveLength(2);
      expect(result[0].distributor.id).toBe(100);
      expect(result[1].distributor.id).toBe(200);
    });
  });

  describe('buildVehicleAllocationGrids', () => {
    const vehicles = [
      {
        id: 1,
        vehicle_name: 'Vehicle 1',
      },
      {
        id: 2,
        vehicle_name: 'Vehicle 2',
      },
    ] as any;

    it('should create one allocation row for every vehicle', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue([
        { field: 'product_1' },
        { field: 'product_2' },
      ] as any);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [
            {
              groupId: 1,
              groupName: 'Group 1',
              product_1: 10,
              product_2: 5,
            },
          ],
        },
      ] as any;

      const result = builder.buildVehicleAllocationGrids(
        summaries,
        vehicles,
      );

      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].rows).toEqual([
        {
          vehicleId: 1,
          vehicleName: 'Vehicle 1',
          product_1: 0,
          product_2: 0,
        },
        {
          vehicleId: 2,
          vehicleName: 'Vehicle 2',
          product_1: 0,
          product_2: 0,
        },
      ]);
    });

    it('should initialize every product field to zero', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue([
        {
          label: 'Group',
          children: [
            { field: 'product_1' },
            {
              label: 'Nested',
              children: [{ field: 'product_2' }],
            },
          ],
        },
      ] as any);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [],
        },
      ] as any;

      const result = builder.buildVehicleAllocationGrids(
        summaries,
        vehicles.slice(0, 1),
      );

      expect(result.allocations[0].rows[0]).toEqual({
        vehicleId: 1,
        vehicleName: 'Vehicle 1',
        product_1: 0,
        product_2: 0,
      });
    });

    it('should create independent product field objects for each vehicle', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue([
        { field: 'product_1' },
      ] as any);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [],
        },
      ] as any;

      const result = builder.buildVehicleAllocationGrids(
        summaries,
        vehicles,
      );

      result.allocations[0].rows[0].product_1 = 50;

      expect(result.allocations[0].rows[1].product_1).toBe(0);
    });

    it('should calculate allocation totals from summary rows', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue([
        { field: 'product_1' },
        { field: 'product_2' },
      ] as any);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products,
          rows: [
            {
              groupId: 1,
              groupName: 'Group 1',
              product_1: 10,
              product_2: 5,
            },
            {
              groupId: 2,
              groupName: 'Group 2',
              product_1: 3,
              product_2: 7,
            },
          ],
        },
      ] as any;

      const result = builder.buildVehicleAllocationGrids(
        summaries,
        vehicles,
      );

      expect(result.allocations[0].totals).toEqual({
        product_1: 13,
        product_2: 12,
      });
    });

    it('should build one allocation grid per summary', () => {
      productColumnsBuilder.buildGroupedColumns.mockReturnValue([
        { field: 'product_1' },
      ] as any);

      const summaries = [
        {
          distributorId: 100,
          category: SupplyCategory.MILK,
          brandId: 10,
          brandName: 'Brand A',
          products: [],
          rows: [],
        },
        {
          distributorId: 200,
          category: SupplyCategory.NON_MILK,
          brandId: 20,
          brandName: 'Brand B',
          products: [],
          rows: [],
        },
      ] as any;

      const result = builder.buildVehicleAllocationGrids(
        summaries,
        vehicles,
      );

      expect(result.allocations).toHaveLength(2);
    });
  });

  describe('applyVehicleAllocations', () => {
    const allocationGrid = {
      allocations: [
        {
          distributor: { id: 100 },
          category: SupplyCategory.MILK,
          brand: { id: 10, name: 'Brand A' },
          columns: [{ field: 'product_1' }],
          rows: [
            {
              vehicleId: 1,
              vehicleName: 'Vehicle 1',
              product_1: 0,
            },
            {
              vehicleId: 2,
              vehicleName: 'Vehicle 2',
              product_1: 0,
            },
          ],
          totals: {
            product_1: 10,
          },
        },
      ],
    } as any;

    it('should apply saved allocation to the matching vehicle and product', () => {
      const savedAllocations = [
        {
          vehicle_id: 2,
          distributor_id: 100,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: 7,
        },
      ] as any;

      const result = builder.applyVehicleAllocations(
        allocationGrid,
        savedAllocations,
      );

      expect(result.allocations[0].rows[0].product_1).toBe(0);
      expect(result.allocations[0].rows[1].product_1).toBe(7);
    });

    it('should convert saved allocation quantity to a number', () => {
      const savedAllocations = [
        {
          vehicle_id: 1,
          distributor_id: 100,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: '12',
        },
      ] as any;

      const result = builder.applyVehicleAllocations(
        allocationGrid,
        savedAllocations,
      );

      expect(result.allocations[0].rows[0].product_1).toBe(12);
      expect(typeof result.allocations[0].rows[0].product_1).toBe('number');
    });

    it('should ignore a saved allocation when the matching grid does not exist', () => {
      const savedAllocations = [
        {
          vehicle_id: 1,
          distributor_id: 999,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: 10,
        },
      ] as any;

      const result = builder.applyVehicleAllocations(
        allocationGrid,
        savedAllocations,
      );

      expect(result).toEqual(allocationGrid);
    });

    it('should ignore a saved allocation when the matching vehicle does not exist', () => {
      const savedAllocations = [
        {
          vehicle_id: 999,
          distributor_id: 100,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: 10,
        },
      ] as any;

      const result = builder.applyVehicleAllocations(
        allocationGrid,
        savedAllocations,
      );

      expect(result).toEqual(allocationGrid);
    });

    it('should ignore a saved allocation when the product field does not exist', () => {
      // PLAN §8 AMBIGUITY C (backend-testing-plan.md §7.6 / §8):
      // "VehicleAllocationBuilder.applyVehicleAllocations silently drops a
      // saved allocation for a product no longer present in the current
      // demand grid, with no equivalent of Purchase's orphanedEntries
      // surfacing mechanism. Confirm whether silent drop is acceptable
      // here or whether Vehicle Allocation should also surface orphaned
      // rows."
      //
      // This test pins the CURRENTLY OBSERVED behavior (silent drop via
      // `continue` in applyVehicleAllocations, production source line: the
      // `if (!grid) { continue; }` / row-lookup-miss branch) pending
      // product/business sign-off per the plan's Acceptance Criteria #10.
      // It is not an endorsement that silent drop is the *correct*
      // long-term behavior — only that it is the current, intentional
      // implementation and any change to it should be a deliberate,
      // reviewed decision rather than an accidental regression.
      const savedAllocations = [
        {
          vehicle_id: 1,
          distributor_id: 100,
          category: SupplyCategory.MILK,
          product_id: 999,
          allocated_qty: 10,
        },
      ] as any;

      const result = builder.applyVehicleAllocations(
        allocationGrid,
        savedAllocations,
      );

      expect(result).toEqual(allocationGrid);
    });

    it('should match allocations by distributor, category and product', () => {
      const grid = {
        allocations: [
          {
            distributor: { id: 100 },
            category: SupplyCategory.MILK,
            brand: { id: 10, name: 'Brand A' },
            columns: [{ field: 'product_1' }],
            rows: [
              {
                vehicleId: 1,
                vehicleName: 'Vehicle 1',
                product_1: 0,
              },
            ],
            totals: {},
          },
          {
            distributor: { id: 200 },
            category: SupplyCategory.MILK,
            brand: { id: 20, name: 'Brand B' },
            columns: [{ field: 'product_1' }],
            rows: [
              {
                vehicleId: 1,
                vehicleName: 'Vehicle 1',
                product_1: 0,
              },
            ],
            totals: {},
          },
        ],
      } as any;

      const result = builder.applyVehicleAllocations(grid, [
        {
          vehicle_id: 1,
          distributor_id: 200,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: 8,
        },
      ] as any);

      expect(result.allocations[0].rows[0].product_1).toBe(0);
      expect(result.allocations[1].rows[0].product_1).toBe(8);
    });

    it('should not mutate the original allocation grid', () => {
      const original = structuredClone(allocationGrid);

      builder.applyVehicleAllocations(allocationGrid, [
        {
          vehicle_id: 1,
          distributor_id: 100,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: 25,
        },
      ] as any);

      expect(allocationGrid).toEqual(original);
    });

    it('should apply multiple saved allocations', () => {
      const savedAllocations = [
        {
          vehicle_id: 1,
          distributor_id: 100,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: 3,
        },
        {
          vehicle_id: 2,
          distributor_id: 100,
          category: SupplyCategory.MILK,
          product_id: 1,
          allocated_qty: 7,
        },
      ] as any;

      const result = builder.applyVehicleAllocations(
        allocationGrid,
        savedAllocations,
      );

      expect(result.allocations[0].rows).toEqual([
        {
          vehicleId: 1,
          vehicleName: 'Vehicle 1',
          product_1: 3,
        },
        {
          vehicleId: 2,
          vehicleName: 'Vehicle 2',
          product_1: 7,
        },
      ]);
    });
  });

  describe('buildVehicleAssignmentGrid', () => {
    const vehicles = [
      {
        id: 1,
        vehicle_name: 'Vehicle 1',
      },
      {
        id: 2,
        vehicle_name: 'Vehicle 2',
      },
    ] as any;

    const distributors = [
      {
        id: 100,
        name: 'Distributor A',
      },
      {
        id: 200,
        name: 'Distributor B',
      },
    ] as any;

    it('should create an assignment row for every vehicle', () => {
      const result = builder.buildVehicleAssignmentGrid(
        vehicles,
        distributors,
      );

      expect(result.assignments).toEqual([
        {
          vehicleId: 1,
          vehicleName: 'Vehicle 1',
          milkDistributorId: null,
          nonMilkDistributorId: null,
        },
        {
          vehicleId: 2,
          vehicleName: 'Vehicle 2',
          milkDistributorId: null,
          nonMilkDistributorId: null,
        },
      ]);
    });

    it('should include every distributor with id and name', () => {
      const result = builder.buildVehicleAssignmentGrid(
        vehicles,
        distributors,
      );

      expect(result.distributors).toEqual([
        {
          id: 100,
          name: 'Distributor A',
        },
        {
          id: 200,
          name: 'Distributor B',
        },
      ]);
    });

    it('should return empty assignments when there are no vehicles', () => {
      const result = builder.buildVehicleAssignmentGrid([], distributors);

      expect(result.assignments).toEqual([]);
      expect(result.distributors).toHaveLength(2);
    });

    it('should return empty distributors when there are no distributors', () => {
      const result = builder.buildVehicleAssignmentGrid(vehicles, []);

      expect(result.assignments).toHaveLength(2);
      expect(result.distributors).toEqual([]);
    });
  });

  describe('applyVehicleAssignments', () => {
    const assignmentGrid = {
      assignments: [
        {
          vehicleId: 1,
          vehicleName: 'Vehicle 1',
          milkDistributorId: null,
          nonMilkDistributorId: null,
        },
        {
          vehicleId: 2,
          vehicleName: 'Vehicle 2',
          milkDistributorId: null,
          nonMilkDistributorId: null,
        },
      ],
      distributors: [
        {
          id: 100,
          name: 'Distributor A',
        },
        {
          id: 200,
          name: 'Distributor B',
        },
      ],
    } as any;

    it('should apply a milk distributor assignment', () => {
      const result = builder.applyVehicleAssignments(assignmentGrid, [
        {
          vehicle_id: 1,
          category: SupplyCategory.MILK,
          distributor_id: 100,
        },
      ] as any);

      expect(result.assignments[0].milkDistributorId).toBe(100);
      expect(result.assignments[0].nonMilkDistributorId).toBeNull();
    });

    it('should apply a non-milk distributor assignment', () => {
      const result = builder.applyVehicleAssignments(assignmentGrid, [
        {
          vehicle_id: 1,
          category: SupplyCategory.NON_MILK,
          distributor_id: 200,
        },
      ] as any);

      expect(result.assignments[0].nonMilkDistributorId).toBe(200);
      expect(result.assignments[0].milkDistributorId).toBeNull();
    });

    it('should apply both categories to the same vehicle', () => {
      const result = builder.applyVehicleAssignments(assignmentGrid, [
        {
          vehicle_id: 1,
          category: SupplyCategory.MILK,
          distributor_id: 100,
        },
        {
          vehicle_id: 1,
          category: SupplyCategory.NON_MILK,
          distributor_id: 200,
        },
      ] as any);

      expect(result.assignments[0]).toEqual({
        vehicleId: 1,
        vehicleName: 'Vehicle 1',
        milkDistributorId: 100,
        nonMilkDistributorId: 200,
      });
    });

    it('should ignore assignments for unknown vehicles', () => {
      const result = builder.applyVehicleAssignments(assignmentGrid, [
        {
          vehicle_id: 999,
          category: SupplyCategory.MILK,
          distributor_id: 100,
        },
      ] as any);

      expect(result).toEqual(assignmentGrid);
    });

    it('should ignore unsupported categories', () => {
      const result = builder.applyVehicleAssignments(assignmentGrid, [
        {
          vehicle_id: 1,
          category: 'UNKNOWN',
          distributor_id: 100,
        },
      ] as any);

      expect(result).toEqual(assignmentGrid);
    });

    it('should not mutate the original assignment grid', () => {
      const original = structuredClone(assignmentGrid);

      builder.applyVehicleAssignments(assignmentGrid, [
        {
          vehicle_id: 1,
          category: SupplyCategory.MILK,
          distributor_id: 100,
        },
      ] as any);

      expect(assignmentGrid).toEqual(original);
    });

    it('should apply multiple assignments to multiple vehicles', () => {
      const result = builder.applyVehicleAssignments(assignmentGrid, [
        {
          vehicle_id: 1,
          category: SupplyCategory.MILK,
          distributor_id: 100,
        },
        {
          vehicle_id: 2,
          category: SupplyCategory.NON_MILK,
          distributor_id: 200,
        },
      ] as any);

      expect(result.assignments).toEqual([
        {
          vehicleId: 1,
          vehicleName: 'Vehicle 1',
          milkDistributorId: 100,
          nonMilkDistributorId: null,
        },
        {
          vehicleId: 2,
          vehicleName: 'Vehicle 2',
          milkDistributorId: null,
          nonMilkDistributorId: 200,
        },
      ]);
    });
  });
});