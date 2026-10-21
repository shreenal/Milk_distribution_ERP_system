import { SupplyCategory } from '../../../generated/prisma/client.js';

type LabelledProduct = {
  packaging_size: { toString(): string };
  packaging_unit: string;
  master_brand?: { name: string } | null;
  master_product_group?: { name: string } | null;
  master_product_type?: { name: string } | null;
  master_packaging_type?: { name: string } | null;
};

/** Decision 19: employees see names, never raw product ids. */
export function describeProduct(product: LabelledProduct): string {
  return [
    product.master_brand?.name,
    product.master_product_group?.name,
    product.master_product_type?.name,
    product.master_packaging_type?.name,
    `${product.packaging_size.toString()}${product.packaging_unit}`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function describeVehicle(vehicle: {
  vehicle_name: string | null;
  vehicle_number: string;
}): string {
  return vehicle.vehicle_name ?? vehicle.vehicle_number;
}

type DescribableRow = {
  category: string;
  master_vehicle: { vehicle_name: string | null; vehicle_number: string };
  distributor: { name: string };
  master_product: LabelledProduct;
};

export function describeAllocationRow(row: DescribableRow): string {
  return `${describeVehicle(row.master_vehicle)} / ${row.distributor.name} (${row.category}) / ${describeProduct(row.master_product)}`;
}

/** Key of one required quantity: distributor + category + product. */
export function buildRequirementKey(
  distributorId: number,
  category: SupplyCategory | string,
  productId: number,
): string {
  return `${distributorId}_${category}_${productId}`;
}

export type DistributorConflict = {
  vehicleId: number;
  category: SupplyCategory;
  distributorIds: number[];
};

/** VA-5.10: one distributor per vehicle per category per session. */
export function findDistributorConflicts(
  rows: {
    vehicleId: number;
    distributorId: number;
    category: SupplyCategory;
  }[],
): DistributorConflict[] {
  const groups = new Map<
    string,
    { vehicleId: number; category: SupplyCategory; ids: Set<number> }
  >();

  for (const row of rows) {
    const key = `${row.vehicleId}_${row.category}`;
    const group = groups.get(key) ?? {
      vehicleId: row.vehicleId,
      category: row.category,
      ids: new Set<number>(),
    };
    group.ids.add(row.distributorId);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((g) => g.ids.size > 1)
    .map((g) => ({
      vehicleId: g.vehicleId,
      category: g.category,
      distributorIds: [...g.ids],
    }));
}
