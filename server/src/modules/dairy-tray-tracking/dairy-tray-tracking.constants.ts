export const DAIRY_TRAY_TRACKING_ERROR_MESSAGES = {
  PAPER_NOT_FOUND: 'Paper not found',

  DAIRY_TRAY_PAPER_NOT_FOUND:
    'Dairy tray tracking has not been generated for this paper',

  EDIT_NOT_ALLOWED:
    'Dairy tray tracking cannot be edited in the current workflow state',

  DUPLICATE_ENTRY: (vehicleId: number, trayTypeId: number) =>
    `Duplicate tray entry for vehicle ${vehicleId} and tray type ${trayTypeId}`,

  INVALID_VEHICLE: (vehicleId: number) => `Invalid vehicle ${vehicleId}`,

  INVALID_TRAY_TYPE: (trayTypeId: number) => `Invalid tray type ${trayTypeId}`,

  MISSING_ENTRY: (vehicleId: number, trayTypeId: number) =>
    `Missing dairy tray entry for vehicle ${vehicleId} and tray type ${trayTypeId}`,

  CALCULATION_FAILED: 'Failed to calculate dairy tray balances',
} as const;

export const DAIRY_TRAY_TRACKING_SUCCESS_MESSAGES = {
  TRAY_RETURNS_SAVED: 'Dairy tray returns saved successfully',
} as const;
