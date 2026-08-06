import { CashSettlementRepository } from '../modules/transactions/cash-settlement/cash-settlement.repository.js';

export type DenominationRow = {
  note_2000?: number | string | { toString(): string } | null;
  note_500?: number | string | { toString(): string } | null;
  note_200?: number | string | { toString(): string } | null;
  note_100?: number | string | { toString(): string } | null;
  note_50?: number | string | { toString(): string } | null;
  note_20?: number | string | { toString(): string } | null;
  note_10?: number | string | { toString(): string } | null;
  coins?: number | string | { toString(): string } | null;
};

export type DenominationTotals = {
  note2000: number;
  note500: number;
  note200: number;
  note100: number;
  note50: number;
  note20: number;
  note10: number;
  coins: number;
};

export type RouteCashSheet = NonNullable<
  Awaited<ReturnType<CashSettlementRepository['getCashSettlementData']>>
>['order_sheet'][number];
