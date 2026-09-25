export const VEHICLE_ALLOCATION_ERROR_MESSAGES = {
  ORDER_PAPER_NOT_FOUND: 'Order paper not found',

  EDIT_NOT_ALLOWED:
    'Vehicle allocations cannot be edited in current workflow state',

  DISTRIBUTOR_MISMATCH_WITHIN_CATEGORY: (
    vehicleId: number,
    category: 'MILK' | 'NON_MILK',
    distributorIds: number[],
  ) =>
    `Vehicle ${vehicleId} has ${category} allocations split across multiple distributors (${distributorIds.join(', ')}). Each vehicle can only source a category from a single distributor per session.`,
} as const;
