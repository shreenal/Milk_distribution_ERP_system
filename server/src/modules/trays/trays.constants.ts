export const TRAY_ERROR_MESSAGES = {
  SHEET_NOT_FOUND: 'Sheet not found',

  NEGATIVE_RETURNED_TRAYS: 'Returned trays cannot be negative',

  TRAY_ROW_NOT_FOUND: (clientId: number) =>
    `Tray row not found for client ${clientId}`,

  INCOMPLETE_TRAY_RETURNS: (clientName: string) =>
    `Tray returns incomplete for client "${clientName}"`,

  VALIDATION_FAILED: (sheetId: number, reason: string) =>
    `Tray validation failed for sheet ${sheetId}: ${reason}`,

  TRAY_EDIT_NOT_ALLOWED: 'Tray cannot be edited in the current workflow state',

  UNKNOWN_VALIDATION_ERROR: 'Unknown error',

  CALCULATION_FAILED: 'Tray calculation failed',
} as const;

export const TRAY_SUCCESS_MESSAGES = {
  TRAY_RETURNS_SAVED: 'Tray returns saved successfully',
} as const;
