export const VEHICLE_ALLOCATION_ERROR_MESSAGES = {
  ORDER_PAPER_NOT_FOUND: 'Order paper not found',

  EDIT_NOT_ALLOWED:
    'Vehicle allocations cannot be edited in current workflow state',

  VEHICLE_ALLOCATIONS_NOT_FOUND: 'Vehicle allocations not found',

  VEHICLE_NOT_FOUND: (id: number) => `Vehicle ${id} does not exist`,

  DISTRIBUTOR_NOT_FOUND: (id: number) => `Distributor ${id} does not exist`,

  DUPLICATE_VEHICLE_ASSIGNMENT: (id: number) =>
    `Vehicle ${id} assigned multiple times`,

  VEHICLE_WITHOUT_DISTRIBUTOR: (id: number) =>
    `Vehicle ${id} has allocations but no distributor assignment`,

  DISTRIBUTOR_CANNOT_PROCURE_PRODUCT: (
    distributorId: number,
    productId: number,
  ) => `Distributor ${distributorId} cannot procure product ${productId}`,

  ALLOCATION_MISMATCH: (
    productId: number,
    required: number,
    allocated: number,
  ) =>
    `Product ${productId} allocation mismatch. Required: ${required}, Allocated: ${allocated}`,
} as const;
