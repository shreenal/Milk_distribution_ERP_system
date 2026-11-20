/**
 * Cash Settlement test harness. A thin layer over orders-harness: it reuses the app bootstrap, the world builder
 * (groups, clients, users, tokens) and adds Cash Settlement helpers under `ctx.cs`. Nothing in orders-harness changes.
 *
 * Mounts CashSettlementModule + PaperModule (readiness / revert / reopen / no-operation endpoints). CollectionsModule is
 * already mounted by orders-harness (used for the CD-7.2 token coupling, S-120 / S-121).
 *
 * Route cash is seeded straight into client_collection.cash_collection (CS-3.1); settlements, expenses, direct
 * collections and deposits are seeded either through the API (`seed`) or straight into the DB (`seedSettlement`, ...).
 */
import { expect, vi } from 'vitest';
import {
  createOrdersTestContext,
  type OrdersCtx,
  type TSheet,
} from './orders-harness.js';
import { CashSettlementModule } from '../../src/modules/transactions/cash-settlement/cash-settlement.module.js';
import { PaperModule } from '../../src/modules/transactions/paper/paper.module.js';
import { CashSettlementValidationService } from '../../src/modules/transactions/cash-settlement/services/cash-settlement-validation.service.js';
import { CashSettlementRepository } from '../../src/modules/transactions/cash-settlement/cash-settlement.repository.js';

export type Section = 'expenses' | 'denominations' | 'direct' | 'deposits';
export const SECTIONS: Section[] = [
  'expenses',
  'denominations',
  'direct',
  'deposits',
];

const PATH: Record<Section, string> = {
  expenses: 'route-expenses',
  denominations: 'route-denominations',
  direct: 'direct-collections',
  deposits: 'bank-deposits',
};
const KEY: Record<Section, string> = {
  expenses: 'expenses',
  denominations: 'denominations',
  direct: 'directCollections',
  deposits: 'bankDeposits',
};
export const DELETED_KEY: Partial<Record<Section, string>> = {
  expenses: 'deletedExpenseIds',
  direct: 'deletedEmployeeIds',
  deposits: 'deletedDepositIds',
};

// Messages are copied from the approved decision file (CS-2.3, CS-4.5, CS-10, CS-12).
export const MSG = {
  STALE:
    'Cash Settlement data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.',
  NOT_ALLOWED: 'Cash settlement editing not allowed',
  PAPER_NOT_FOUND: 'Paper not found',
  INVALID_TOKEN: 'Invalid expectedUpdatedAt',
  RETRY:
    'Your request conflicted with another update and could not be completed. Please retry.',
  TIMEOUT: 'The request took too long and nothing was saved. Please retry.',
  NOT_READY: 'Cash settlement is not ready for submission',
  INVALID_ENTRIES: 'Invalid cash settlement entries',
  mismatch: (route: string, expected: number, received: number) =>
    `Route ${route} cash mismatch. Expected ${expected}, received ${received}`,
  exceedsCash: (available: number, deposited: number) =>
    `Bank deposits exceed available office cash. Available: ${available}, Deposited: ${deposited}`,
  exceedsDenomination: (label: string, available: number, deposited: number) =>
    `Bank deposit ${label} count exceeds available cash. Available: ${available}, Deposited: ${deposited}`,
};

export const DENOM_FIELDS = [
  'note2000',
  'note500',
  'note200',
  'note100',
  'note50',
  'note20',
  'note10',
  'coins',
] as const;
export type DenomValues = Record<(typeof DENOM_FIELDS)[number], number>;
export const Z: DenomValues = {
  note2000: 0,
  note500: 0,
  note200: 0,
  note100: 0,
  note50: 0,
  note20: 0,
  note10: 0,
  coins: 0,
};
export const den = (o: Partial<DenomValues> = {}): DenomValues => ({
  ...Z,
  ...o,
});
export const amountOf = (o: Partial<DenomValues>) =>
  2000 * (o.note2000 ?? 0) +
  500 * (o.note500 ?? 0) +
  200 * (o.note200 ?? 0) +
  100 * (o.note100 ?? 0) +
  50 * (o.note50 ?? 0) +
  20 * (o.note20 ?? 0) +
  10 * (o.note10 ?? 0) +
  (o.coins ?? 0);
const snake = (o: Partial<DenomValues> = {}) => ({
  note_2000: o.note2000 ?? 0,
  note_500: o.note500 ?? 0,
  note_200: o.note200 ?? 0,
  note_100: o.note100 ?? 0,
  note_50: o.note50 ?? 0,
  note_20: o.note20 ?? 0,
  note_10: o.note10 ?? 0,
  coins: o.coins ?? 0,
});

// --- one request entry -------------------------------------------------------------------------------------------
export const expense = (
  sheetId: number,
  expenseTypeId: number,
  amount: unknown,
  id?: number,
) => ({
  ...(id === undefined ? {} : { id }),
  sheetId,
  expenseTypeId,
  amount,
});
export const denomination = (
  sheetId: number,
  o: Partial<DenomValues> = {},
) => ({ sheetId, ...den(o) });
export const directEntry = (
  employeeId: number,
  o: Partial<DenomValues> = {},
) => ({ employeeId, ...den(o) });
export const depositEntry = (
  bankId: number,
  o: Partial<DenomValues> = {},
  id?: number,
) => ({
  ...(id === undefined ? {} : { id }),
  bankId,
  ...den(o),
});

export const ok = (res: { status: number; body: any }) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};
export const SUBMISSION_KEYS = ['ready', 'routeMismatches', 'depositProblems'];
export const VIEW_KEYS = [
  'routeSettlements',
  'routeExpenses',
  'routeDenominations',
  'directCollections',
  'bankDeposits',
  'summary',
  'submission',
];

export type Route = {
  sheetId: number;
  group: { id: number; name: string };
  client: { id: number; name: string };
  name: string;
};

function buildCs(ctx: OrdersCtx) {
  const db = ctx.db;
  const sfx = ctx.world.sfx;
  let seq = 0;
  const created = {
    types: [] as number[],
    banks: [] as number[],
    employees: [] as number[],
  };

  // --- master data -----------------------------------------------------------------------------------------------
  const addExpenseType = async (o: { active?: boolean } = {}) => {
    const t = await db.master_expense_type.create({
      data: { name: `T-exp-${sfx}-${++seq}`, is_active: o.active ?? true },
    });
    created.types.push(t.id);
    return t;
  };
  const addBank = async (o: { active?: boolean } = {}) => {
    const b = await db.master_bank.create({
      data: { name: `T-bank-${sfx}-${++seq}`, is_active: o.active ?? true },
    });
    created.banks.push(b.id);
    return b;
  };
  const addEmployee = async (o: { active?: boolean } = {}) => {
    const e = await db.master_employee.create({
      data: { name: `T-emp-${sfx}-${++seq}`, is_active: o.active ?? true },
    });
    created.employees.push(e.id);
    return e;
  };
  const setTypeActive = (id: number, is_active: boolean) =>
    db.master_expense_type.update({ where: { id }, data: { is_active } });
  const setBankActive = (id: number, is_active: boolean) =>
    db.master_bank.update({ where: { id }, data: { is_active } });
  const setEmployeeActive = (id: number, is_active: boolean) =>
    db.master_employee.update({ where: { id }, data: { is_active } });
  const setGroupActive = (id: number, is_active: boolean) =>
    db.master_group.update({ where: { id }, data: { is_active } });

  // --- DB seams --------------------------------------------------------------------------------------------------
  /** Route cash of one client (CS-3.1: only cash_collection counts). `extra` seeds the columns that must NOT count. */
  const seedCash = (
    sheetId: number,
    clientId: number,
    cash: number,
    category: 'MILK' | 'NON_MILK' = 'MILK',
    extra: Record<string, number> = {},
  ) =>
    db.client_collection.create({
      data: {
        order_sheet_id: sheetId,
        client_id: clientId,
        category,
        cash_collection: cash,
        ...extra,
      },
    });

  const seedSettlement = (sheetId: number, o: Partial<DenomValues> = {}) =>
    db.cash_route_settlement.upsert({
      where: { order_sheet_id: sheetId },
      update: snake(o),
      create: { order_sheet_id: sheetId, ...snake(o) },
    });
  const seedExpense = async (
    sheetId: number,
    expenseTypeId: number,
    amount: number,
  ) => {
    const s = await seedSettlement(sheetId);
    return db.cash_route_expense.create({
      data: {
        cash_route_settlement_id: s.id,
        expense_type_id: expenseTypeId,
        amount,
      },
    });
  };
  const seedDirect = (
    paperId: number,
    employeeId: number,
    o: Partial<DenomValues> = {},
  ) =>
    db.cash_direct_collection.create({
      data: { order_paper_id: paperId, employee_id: employeeId, ...snake(o) },
    });
  const seedDeposit = (
    paperId: number,
    bankId: number,
    o: Partial<DenomValues> = {},
  ) =>
    db.cash_bank_deposit.create({
      data: { order_paper_id: paperId, bank_id: bankId, ...snake(o) },
    });

  const settlement = (sheetId: number) =>
    db.cash_route_settlement.findUnique({ where: { order_sheet_id: sheetId } });
  const settlements = (paperId: number) =>
    db.cash_route_settlement.findMany({
      where: { order_sheet: { order_paper_id: paperId } },
      orderBy: { id: 'asc' },
    });
  const expenses = (paperId: number) =>
    db.cash_route_expense.findMany({
      where: { route_settlement: { order_sheet: { order_paper_id: paperId } } },
      orderBy: { id: 'asc' },
    });
  const directRows = (paperId: number) =>
    db.cash_direct_collection.findMany({
      where: { order_paper_id: paperId },
      orderBy: { id: 'asc' },
    });
  const depositRows = (paperId: number) =>
    db.cash_bank_deposit.findMany({
      where: { order_paper_id: paperId },
      orderBy: { id: 'asc' },
    });

  const paperToken = async (paperId: number) =>
    (
      await db.order_paper.findUniqueOrThrow({
        where: { id: paperId },
        select: { updated_at: true },
      })
    ).updated_at.toISOString();
  const setStatus = (paperId: number, status: string) =>
    ctx.setStatus({ paperId }, status as never);

  // --- scenes ----------------------------------------------------------------------------------------------------
  const attachRoute = async (
    paperId: number,
    o: {
      cash?: number;
      nonMilkCash?: number;
      groupActive?: boolean;
      sheet?: TSheet;
    } = {},
  ): Promise<Route> => {
    let group: { id: number; name: string };
    let sheetId: number;
    if (o.sheet) {
      group = o.sheet.group;
      sheetId = o.sheet.sheetId;
    } else {
      group = await ctx.world.addGroup();
      sheetId = (
        await db.order_sheet.create({
          data: {
            order_paper_id: paperId,
            group_id: group.id,
            delivery_session: 'NIGHT',
          },
        })
      ).id;
    }
    if (o.groupActive === false) await setGroupActive(group.id, false);
    const client = await ctx.world.addClient({ group });
    if (o.cash) await seedCash(sheetId, client.id, o.cash);
    if (o.nonMilkCash)
      await seedCash(sheetId, client.id, o.nonMilkCash, 'NON_MILK');
    return { sheetId, group, client, name: group.name };
  };

  /**
   * One paper (default NIGHT_SUBMITTED) with one route per spec (default two empty routes) and an active expense
   * type, bank and employee. Routes: `s.routes[i]`.
   */
  const scene = async (
    o: {
      status?: string;
      routes?: { cash?: number; nonMilkCash?: number; groupActive?: boolean }[];
    } = {},
  ) => {
    const first = await ctx.world.newSheet({
      status: (o.status ?? 'NIGHT_SUBMITTED') as never,
    });
    const specs = o.routes ?? [{}, {}];
    const routes: Route[] = [
      await attachRoute(first.paperId, { ...specs[0], sheet: first }),
    ];
    for (const spec of specs.slice(1))
      routes.push(await attachRoute(first.paperId, spec));
    const [type, bank, employee] = [
      await addExpenseType(),
      await addBank(),
      await addEmployee(),
    ];
    return {
      paperId: first.paperId,
      saleDate: first.saleDate,
      routes,
      type,
      bank,
      employee,
    };
  };
  type Scene = Awaited<ReturnType<typeof scene>>;

  /** One valid entry of a section. For `expenses` `v.amount` is the amount; otherwise `v` holds the denominations. */
  const entryFor = (
    section: Section,
    s: Scene,
    v: Partial<DenomValues> & { amount?: number } = {},
  ) => {
    switch (section) {
      case 'expenses':
        return expense(s.routes[0].sheetId, s.type.id, v.amount ?? 10);
      case 'denominations':
        return denomination(s.routes[0].sheetId, v);
      case 'direct':
        return directEntry(s.employee.id, v);
      case 'deposits':
        return depositEntry(s.bank.id, v);
    }
  };
  /** A valid entry that CHANGES data (non-zero). */
  const changing = (section: Section, s: Scene) =>
    entryFor(
      section,
      s,
      section === 'expenses' ? { amount: 10 } : { note100: 1 },
    );

  // --- API -------------------------------------------------------------------------------------------------------
  const get = (
    paperId: number | string,
    token: string | null = ctx.tokens.emp,
  ) => ctx.call('get', `/cash-settlement/${paperId}`, token);

  /** Raw POST, body exactly as given. token null = no Authorization header. */
  const raw = (
    section: Section,
    paperId: number | string,
    body: unknown,
    token: string | null = ctx.tokens.emp,
  ) =>
    ctx.call(
      'post',
      `/cash-settlement/${paperId}/${PATH[section]}`,
      token,
      body,
    );

  /** Well-formed POST. `expected === undefined` omits expectedUpdatedAt from the body. */
  const save = (
    section: Section,
    paperId: number | string,
    rows: unknown,
    expected: string | null | undefined,
    o: { token?: string | null; extra?: Record<string, unknown> } = {},
  ) =>
    raw(
      section,
      paperId,
      { [KEY[section]]: rows, expectedUpdatedAt: expected, ...(o.extra ?? {}) },
      o.token === undefined ? ctx.tokens.emp : o.token,
    );

  /** Save with the CURRENT token; throws unless 200. Returns the response body. */
  const seed = async (
    section: Section,
    paperId: number,
    rows: unknown,
    extra: Record<string, unknown> = {},
  ) =>
    ok(
      await save(section, paperId, rows, await paperToken(paperId), { extra }),
    );

  const readiness = (paperId: number, token: string | null = ctx.tokens.emp) =>
    ctx.call('get', `/papers/${paperId}/readiness`, token);

  /** The submission gate itself (what Paper calls at morning submit): null when it passes, else { status, message, details }. */
  const gate = async (paperId: number) => {
    const svc = ctx.app.get(CashSettlementValidationService, { strict: false });
    try {
      await ctx.prisma.$transaction((tx) =>
        svc.validateMorningSubmitReadiness(paperId, tx),
      );
      return null;
    } catch (e: any) {
      const body = e.getResponse?.() ?? {};
      return {
        status: e.getStatus?.() as number,
        message: body.message as string,
        details: (body.details ?? []) as string[],
      };
    }
  };

  const repo = () => ctx.app.get(CashSettlementRepository, { strict: false });

  // --- Collections (CD-7.2 coupling) -----------------------------------------------------------------------------
  const collectionsToken = async (sheetId: number) =>
    (
      await db.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
        select: { collections_updated_at: true },
      })
    ).collections_updated_at?.toISOString() ?? null;
  /** Milk morning save of one client (cash / cheque), with the current Collections token. */
  const collectionsMorning = async (
    sheetId: number,
    clientId: number,
    cash: number,
    cheque = 0,
  ) =>
    ctx.call(
      'post',
      `/collections/sheet/${sheetId}/milk/morning-save`,
      ctx.tokens.emp,
      {
        entries: [{ clientId, cashCollection: cash, chequeCollection: cheque }],
        expectedUpdatedAt: await collectionsToken(sheetId),
      },
    );

  /** Call from afterEach: restores mocks, removes papers (cascades every cash row) and the master rows made here. */
  const cleanup = async () => {
    vi.restoreAllMocks();
    await ctx.world.deletePapers();
    const run = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* leftovers must not hide the real failure */
      }
    };
    await run(() =>
      db.master_expense_type.deleteMany({
        where: { id: { in: created.types.splice(0) } },
      }),
    );
    await run(() =>
      db.master_bank.deleteMany({
        where: { id: { in: created.banks.splice(0) } },
      }),
    );
    await run(() =>
      db.master_employee.deleteMany({
        where: { id: { in: created.employees.splice(0) } },
      }),
    );
  };

  return {
    addExpenseType,
    addBank,
    addEmployee,
    setTypeActive,
    setBankActive,
    setEmployeeActive,
    setGroupActive,
    seedCash,
    seedSettlement,
    seedExpense,
    seedDirect,
    seedDeposit,
    settlement,
    settlements,
    expenses,
    directRows,
    depositRows,
    paperToken,
    setStatus,
    attachRoute,
    scene,
    entryFor,
    changing,
    get,
    raw,
    save,
    seed,
    readiness,
    gate,
    repo,
    collectionsToken,
    collectionsMorning,
    cleanup,
  };
}

export type CashCtx = OrdersCtx & { cs: ReturnType<typeof buildCs> };

export async function createCashTestContext(
  opts: Parameters<typeof createOrdersTestContext>[0] = {},
): Promise<CashCtx> {
  const ctx = await createOrdersTestContext({
    ...opts,
    modules: [
      CashSettlementModule,
      PaperModule,
      ...((opts.modules ?? []) as never[]),
    ],
  });
  return Object.assign(ctx, { cs: buildCs(ctx) });
}
