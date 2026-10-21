import { SupplyCategory } from '../../../generated/prisma/client.js';

// Decision 2 / CT-15.6: the total returned for one ledger row (client, tray
// type, category) on a sheet cannot exceed this, on top of the
// outstanding-balance restriction. A save sets the row's total, so the
// limit holds across saves.
export const MAX_RETURNED_TRAYS = 2000;

// Upper bound on the administrative recalculation window. Each paper in the
// window queues a forward propagation job, so the work grows quickly.
export const MAX_RECALCULATION_RANGE_DAYS = 31;

export const CLIENT_TRAY_ERROR_MESSAGES = {
  SHEET_NOT_FOUND: 'Sheet not found',

  NEGATIVE_RETURNED_TRAYS: 'Returned trays cannot be negative',

  TRAY_ROW_NOT_FOUND: (clientId: number) =>
    `Tray row not found for client ${clientId}`,

  TRAY_EDIT_NOT_ALLOWED: 'Tray cannot be edited in the current workflow state',

  CALCULATION_FAILED: 'Tray calculation failed',

  DUPLICATE_ENTRY: (
    clientId: number,
    trayTypeId: number,
    category: SupplyCategory,
  ) =>
    `Duplicate entry for client ${clientId}, tray type ${trayTypeId}, ${category}. Each client, tray type and category can appear only once.`,

  RETURNS_REJECTED: 'One or more returns were rejected',

  RETURN_EXCEEDS_BALANCE: (
    clientName: string,
    trayLabel: string,
    returned: number,
    available: number,
  ) =>
    `Client "${clientName}": ${returned} ${trayLabel} returned exceeds the outstanding balance of ${available}`,

  TRAY_TYPE_INACTIVE: (clientName: string, trayLabel: string) =>
    `Client "${clientName}": ${trayLabel} is inactive and read-only`,

  // CT-15.5: the reconciliation route is only for inactive tray types.
  TRAY_TYPE_NOT_INACTIVE: (clientName: string, trayLabel: string) =>
    `Client "${clientName}": ${trayLabel} is active. Use the normal save instead of reconciliation`,

  // CT-15.6: the limit is on the row's total return, not on one save.
  RETURN_EXCEEDS_LIMIT: (
    clientName: string,
    trayLabel: string,
    returned: number,
  ) =>
    `Client "${clientName}": ${returned} ${trayLabel} returned exceeds the limit of ${MAX_RETURNED_TRAYS} per row`,

  // CT-15.1 / CT-15.2: a quantity change that would leave returns above the
  // balance is refused. Returns are never capped or dropped to make it fit.
  RETURN_DISCREPANCY:
    'This change would leave returned trays higher than the outstanding balance. Correct the returns first, then repeat the change',

  RETURN_DISCREPANCY_DETAIL: (
    saleDate: string,
    clientName: string,
    trayLabel: string,
    returned: number,
    available: number,
  ) =>
    `${saleDate}, client "${clientName}": ${returned} ${trayLabel} returned but only ${available} outstanding`,

  INVALID_EXPECTED_UPDATED_AT: 'Invalid expectedUpdatedAt',

  INVALID_DATE_RANGE: 'fromDate and toDate must be valid YYYY-MM-DD dates',

  DATE_RANGE_ORDER: 'fromDate must not be after toDate',

  DATE_RANGE_TOO_LONG: (maxDays: number) =>
    `The date range cannot exceed ${maxDays} days`,
} as const;

export const CLIENT_TRAY_SUCCESS_MESSAGES = {
  TRAY_RETURNS_SAVED: 'Tray returns saved successfully',
} as const;
