// ✅ src/common/types/transaction.types.ts

import { Prisma, PrismaClient } from '@prisma/client/extension';

export type TransactionClient = Prisma.TransactionClient;

export type PrismaOrTransaction = PrismaClient;

export type TrayTransactionEntry = {
  order_sheet_id: number;
  client_id: number;
  tray_type_id: number;
  opening_balance: number;
  trays_taken: number;
  trays_returned: number;
  closing_balance: number;
};
