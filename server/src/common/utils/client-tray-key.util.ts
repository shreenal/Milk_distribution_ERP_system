import { SupplyCategory } from '../../generated/prisma/client.js';

/**
 * Decision 9: milk and non-milk tray balances are separate ledgers, so the
 * ledger key is (client, tray type, category), not (client, tray type).
 */
export type ClientTrayKey = {
  clientId: number;
  trayTypeId: number;
  category: SupplyCategory;
};

export function buildClientTrayKey(key: ClientTrayKey): string {
  return `${key.clientId}_${key.trayTypeId}_${key.category}`;
}

// The category (NON_MILK) contains an underscore, so everything after the
// second separator is the category.
export function parseClientTrayKey(key: string): ClientTrayKey {
  const [clientId, trayTypeId, ...category] = key.split('_');
  return {
    clientId: Number(clientId),
    trayTypeId: Number(trayTypeId),
    category: category.join('_') as SupplyCategory,
  };
}
