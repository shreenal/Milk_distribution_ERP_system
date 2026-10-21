// DT-4.1 / DT-5.12: the total returned for one ledger row (vehicle, session,
// tray type) on a paper cannot exceed this, on top of the balance rule.
export const MAX_RETURNED_TRAYS = 2000;

// DT-4.3
export const MAX_SAVE_ENTRIES = 5000;

// DT-11.2: each paper in the window queues a forward propagation job.
export const MAX_RECALCULATION_RANGE_DAYS = 31;

export const STALE_DATA_MESSAGE =
  'Dairy Trays data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

export const DAIRY_TRAYS_ERROR_MESSAGES = {
  PAPER_NOT_FOUND: 'Paper not found',

  DAIRY_TRAY_PAPER_NOT_FOUND:
    'Dairy tray tracking has not been generated for this paper',

  EDIT_NOT_ALLOWED:
    'Dairy tray tracking cannot be edited in the current workflow state',

  INVALID_EXPECTED_UPDATED_AT: 'Invalid expectedUpdatedAt',

  DUPLICATE_ENTRY: (vehicleId: number, trayTypeId: number, session: string) =>
    `Duplicate entry for vehicle ${vehicleId}, tray type ${trayTypeId}, ${session}. Each vehicle, session and tray type can appear only once.`,

  ROW_NOT_FOUND: (vehicleId: number, session: string) =>
    `Dairy tray row not found for vehicle ${vehicleId} (${session})`,

  RETURNS_REJECTED: 'One or more returns were rejected',

  RETURN_EXCEEDS_BALANCE: (
    vehicleName: string,
    session: string,
    trayLabel: string,
    returned: number,
    available: number,
  ) =>
    `Vehicle "${vehicleName}" (${session}): ${returned} ${trayLabel} returned exceeds the outstanding balance of ${available}`,

  RETURN_EXCEEDS_LIMIT: (
    vehicleName: string,
    session: string,
    trayLabel: string,
    returned: number,
  ) =>
    `Vehicle "${vehicleName}" (${session}): ${returned} ${trayLabel} returned exceeds the limit of ${MAX_RETURNED_TRAYS} per row`,

  INACTIVE_READ_ONLY: (
    vehicleName: string,
    session: string,
    trayLabel: string,
  ) =>
    `Vehicle "${vehicleName}" (${session}): ${trayLabel} is inactive (the vehicle or the tray type) and read-only`,

  // DT-5.11: the reconciliation route is only for inactive vehicles / tray types.
  NOT_INACTIVE: (vehicleName: string, session: string, trayLabel: string) =>
    `Vehicle "${vehicleName}" (${session}): ${trayLabel} is active. Use the normal save instead of reconciliation`,

  // DT-6.5: a change that would leave returns above the balance is refused.
  RETURN_DISCREPANCY:
    'This change would leave returned trays higher than the outstanding balance. Correct the returns first, then repeat the change',

  RETURN_DISCREPANCY_DETAIL: (
    saleDate: string,
    vehicleName: string,
    session: string,
    trayLabel: string,
    returned: number,
    available: number,
  ) =>
    `${saleDate}, vehicle "${vehicleName}" (${session}): ${returned} ${trayLabel} returned but only ${available} outstanding`,

  NOT_READY_FOR_SUBMISSION: 'Dairy trays are not ready for submission',

  MISSING_ENTRY: (vehicleName: string, session: string, trayLabel: string) =>
    `Missing dairy tray entry for vehicle "${vehicleName}" (${session}), ${trayLabel}`,

  NEGATIVE_CLOSING: (
    vehicleName: string,
    session: string,
    trayLabel: string,
    closing: number,
  ) =>
    `Vehicle "${vehicleName}" (${session}): ${trayLabel} would close at ${closing}. A closing balance cannot be negative`,

  INVALID_DATE_RANGE: 'fromDate and toDate must be valid YYYY-MM-DD dates',

  DATE_RANGE_ORDER: 'fromDate must not be after toDate',

  DATE_RANGE_TOO_LONG: (maxDays: number) =>
    `The date range cannot exceed ${maxDays} days`,
} as const;

export const DAIRY_TRAY_TRACKING_SUCCESS_MESSAGES = {
  TRAY_RETURNS_SAVED: 'Dairy tray returns saved successfully',
} as const;
