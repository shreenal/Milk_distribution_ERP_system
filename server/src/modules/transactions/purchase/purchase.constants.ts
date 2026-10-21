// PD-27 / PD-60: one place for the purchase input limits.
export const PURCHASE_LIMITS = {
  MAX_PURCHASED_QTY: 10000,
  QTY_DECIMAL_PLACES: 2,
  MAX_ENTRIES: 5000,
  MAX_ID: 2147483647,
} as const;

export const STALE_DATA_MESSAGE =
  'Purchase data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

export const PURCHASE_ERROR_MESSAGES = {
  // PD-55: a missing paper is 404, as in every other module.
  ORDER_PAPER_NOT_FOUND: 'Order paper not found',

  EDIT_NOT_ALLOWED: 'Purchases cannot be edited in current workflow state',

  INVALID_EXPECTED_UPDATED_AT: 'Invalid expectedUpdatedAt',

  INVALID_ENTRIES: 'Invalid purchase entries',

  INVALID_PRODUCT: (productId: number) => `Invalid product ${productId}`,

  INVALID_VEHICLE: (vehicleId: number) => `Invalid vehicle ${vehicleId}`,

  INVALID_DISTRIBUTOR: (distributorId: number) =>
    `Invalid distributor ${distributorId}`,

  LINK_MISSING: (distributor: string, product: string) =>
    `${distributor} does not have an active product link for ${product}`,

  DUPLICATE_ENTRY: (label: string) => `Duplicate purchase entry: ${label}`,

  ALLOCATION_NOT_FOUND: (label: string) => `Allocation not found: ${label}`,

  // PD-4
  ALLOCATION_CHANGED: (label: string) =>
    `Allocation modified or removed: ${label}. Reload the purchase data and try again`,

  ECHO_REQUIRED: (label: string) =>
    `${label}: sourceAllocationId and sourceAllocatedQty must be echoed for a saved entry`,

  PURCHASE_EXCEEDS_ALLOCATION: (
    label: string,
    purchased: number,
    allocated: number,
  ) =>
    `${label}: purchased quantity ${purchased} exceeds allocated quantity ${allocated}`,

  QUANTITY_PRECISION: (label: string, qty: number) =>
    `${label}: quantity ${qty} is invalid. Quantity must be specified to at most ${PURCHASE_LIMITS.QTY_DECIMAL_PLACES} decimal places`,

  ENTRY_ALSO_DELETED: (label: string) =>
    `${label}: the same entry cannot be saved and deleted in one request`,

  DELETE_ID_UNKNOWN: (ids: number[]) =>
    `Purchase entry id(s) ${ids.join(', ')} do not belong to this paper`,

  EMPTY_ENTRIES_GUARDED:
    'entries is empty but purchases are already saved. Send deletedEntryIds to delete specific entries, or purgeAll with purgeScope "PAPER" (ADMIN) to delete everything',

  PURGE_FORBIDDEN: 'Only an administrator can purge purchases',
  PURGE_SCOPE_REQUIRED: 'purgeAll requires purgeScope "PAPER"',
  PURGE_CONFLICT:
    'purgeAll cannot be combined with entries, deletedEntryIds or reevaluateTrays. Deletion, saving and tray re-evaluation are separate operations',
  REEVALUATE_FORBIDDEN: 'Only an administrator can re-evaluate tray types',

  RATE_MISSING: (label: string, date: string) =>
    `${label}: no purchase rate found for ${date}`,
  ORDER_UNIT_MISSING: (label: string) =>
    `${label}: order unit configuration is missing`,

  PURCHASES_NOT_COMPLETED: 'Purchases have not been completed',

  RECALC_ONLY_REOPENED:
    'Rates can only be recalculated while the paper is REOPENED',
  RECALC_FAILED: 'Rate recalculation failed. Nothing was changed',

  SIGNOFF_ALLOCATIONS_EXIST:
    'Zero-allocation sign-off is only possible when no vehicle allocation exists for this paper',
} as const;
