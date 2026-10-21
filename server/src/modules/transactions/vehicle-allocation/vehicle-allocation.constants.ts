import {
  DeliverySession,
  OrderPaperStatus,
  VehicleAllocationAnomalyReason,
} from '../../../generated/prisma/client.js';

// VA-4.1 / VA-4.3 / VA-8.2
export const VEHICLE_ALLOCATION_LIMITS = {
  MAX_ALLOCATED_QTY: 10000,
  QTY_DECIMAL_PLACES: 2,
  MAX_ENTRIES: 5000,
  // Decision 9: the approved submission tolerance, unchanged.
  COVERAGE_TOLERANCE: 0.005,
} as const;

export const STALE_DATA_MESSAGE =
  'Vehicle allocation data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

export const VEHICLE_ALLOCATION_ERROR_MESSAGES = {
  // VA-3.1 / VA-10: a missing paper is 404 (NotFoundException).
  ORDER_PAPER_NOT_FOUND: 'Order paper not found',

  INVALID_EXPECTED_UPDATED_AT: 'Invalid expectedUpdatedAt',

  // VA-2.3: workflow-specific feedback, tells the user which session is open.
  SESSION_NOT_EDITABLE: (
    requested: DeliverySession,
    status: OrderPaperStatus,
    editable: DeliverySession[],
  ) =>
    editable.length > 0
      ? `The ${requested} allocation can no longer be edited because the paper is now ${status}. The session currently open for editing is ${editable.join(' and ')}. Refresh the allocation data and try again.`
      : `The ${requested} allocation cannot be edited because the paper is ${status}. No allocation session is open for editing. Refresh the allocation data.`,

  VEHICLE_NOT_FOUND: (vehicleId: number) =>
    `Vehicle ${vehicleId} does not exist`,

  VEHICLE_INACTIVE: (vehicleName: string) =>
    `Vehicle "${vehicleName}" is inactive and cannot receive allocations`,

  LINK_MISSING: (distributorName: string, productName: string) =>
    `${distributorName} does not have an active link to ${productName}`,

  NOT_REQUIRED: (
    distributorName: string,
    category: string,
    productName: string,
  ) =>
    `${distributorName} (${category}): ${productName} is not required in this session's orders, so it cannot be allocated`,

  DUPLICATE_ENTRY: (
    vehicleName: string,
    distributorName: string,
    category: string,
    productName: string,
  ) => `${vehicleName} / ${distributorName} (${category}) / ${productName}`,

  // VA-5.10: the dairy gatepass identifies exactly one distributor per vehicle.
  DISTRIBUTOR_MISMATCH_WITHIN_CATEGORY: (
    vehicleName: string,
    category: string,
    distributorNames: string[],
  ) =>
    `Vehicle "${vehicleName}" has ${category} allocations split across multiple distributors (${distributorNames.join(', ')}). A vehicle can take a category from only one distributor per session, because its gatepass identifies a single distributor.`,

  DELETIONS_NEED_CONFIRMATION:
    'Saving would remove existing vehicle allocations that are missing from the submitted data (they were neither kept nor set to 0). Confirm deletion to proceed.',

  NOT_READY_FOR_SUBMISSION: (session: DeliverySession) =>
    `Vehicle allocation for the ${session} session is not ready for submission`,
} as const;

export const ANOMALY_REASON_MESSAGES: Record<
  VehicleAllocationAnomalyReason,
  string
> = {
  VEHICLE_INACTIVE: 'the vehicle is no longer active',
  NOT_REQUIRED:
    'the product is no longer required from this distributor in this session',
  LINK_INACTIVE: 'the distributor no longer has an active link to this product',
};
