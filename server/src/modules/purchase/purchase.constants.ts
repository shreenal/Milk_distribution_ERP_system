export const PURCHASE_ERROR_MESSAGES = {
  ORDER_PAPER_NOT_FOUND: 'Order paper not found',

  VEHICLE_ALLOCATIONS_REQUIRED:
    'Vehicle allocations must be completed before purchasing',

  NO_VEHICLE_ASSIGNMENTS: 'No vehicle assignments found',

  EDIT_NOT_ALLOWED: 'Purchases cannot be edited in current workflow state',

  NEGATIVE_PURCHASE_QTY: 'Purchased quantity cannot be negative',

  INVALID_PRODUCT: (productId: number) => `Invalid product ${productId}`,

  INVALID_VEHICLE: (vehicleId: number) => `Invalid vehicle ${vehicleId}`,

  INVALID_DISTRIBUTOR: (distributorId: number) =>
    `Invalid distributor ${distributorId}`,

  VEHICLE_DISTRIBUTOR_MISMATCH: (vehicleId: number, distributorId: number) =>
    `Vehicle ${vehicleId} is not assigned to distributor ${distributorId} for this product category`,

  PROCUREMENT_RULE_MISSING: (distributorId: number, productId: number) =>
    `Distributor ${distributorId} cannot procure product ${productId}`,

  ALLOCATION_NOT_FOUND: (vehicleId: number, productId: number) =>
    `Allocation not found for vehicle ${vehicleId} product ${productId}`,

  PURCHASE_EXCEEDS_ALLOCATION: 'Purchased quantity exceeds allocated quantity',

  PURCHASES_NOT_COMPLETED: 'Purchases have not been completed',

  INVALID_ALLOCATION_IDENTIFIERS: 'Vehicle allocation has missing identifiers',

  NO_VEHICLE_ALLOCATIONS: 'No vehicle allocations found',

  PURCHASE_MISSING: (vehicleId: number, productId: number) =>
    `Purchase missing for vehicle ${vehicleId} product ${productId}`,

  INVALID_RATE_IDENTIFIERS: 'Distributor rate contains invalid identifiers',

  VEHICLE_ASSIGNMENT_NOT_FOUND: (vehicleId: number) =>
    `Vehicle assignment not found for vehicle ${vehicleId}`,
} as const;


export const QUANTITY_PRECISION = {
  OPERATIONAL_UNIT_LITRES: 10,
} as const;