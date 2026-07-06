// ✅ src/common/types/transaction.types.ts

import { Prisma } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export type TransactionClient = Prisma.TransactionClient;

export type PrismaOrTransaction = PrismaService | Prisma.TransactionClient;

export type TrayTransactionEntry = {
  order_sheet_id: number;
  client_id: number;
  tray_type_id: number;
  opening_balance: number;
  trays_taken: number;
  trays_returned: number;
  closing_balance: number;
};
