export const CLIENT_TRAY_ERROR_MESSAGES = {
  SHEET_NOT_FOUND: 'Sheet not found',

  NEGATIVE_RETURNED_TRAYS: 'Returned trays cannot be negative',

  TRAY_ROW_NOT_FOUND: (clientId: number) =>
    `Tray row not found for client ${clientId}`,

  INCOMPLETE_TRAY_RETURNS: (clientName: string) =>
    `Tray returns incomplete for client "${clientName}"`,

  TRAY_EDIT_NOT_ALLOWED: 'Tray cannot be edited in the current workflow state',

  CALCULATION_FAILED: 'Tray calculation failed',
} as const;

export const CLIENT_TRAY_SUCCESS_MESSAGES = {
  TRAY_RETURNS_SAVED: 'Tray returns saved successfully',
} as const;
