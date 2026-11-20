/**
 * Collections test harness. A thin layer over orders-harness: it reuses the app bootstrap, the world
 * builder (scenes, groups, clients, users, tokens) and adds Collections helpers under `ctx.col`.
 * Nothing in orders-harness is changed.
 *
 * Assumes (from how the Orders specs use the harness):
 *  - ctx.call(method, path, token | undefined, body?) -> { status, body }
 *  - ctx.world.scene({ clients, clientOpts }) -> { sheet: { sheetId, paperId }, group, clients, products }
 *  - clients created by the world buy BOTH categories by default
 *  - ctx.setStatus(sheet, status), ctx.tokens.{emp, emp2, admin}, ctx.tokenFor(user, opts), ctx.users, ctx.db
 */
import { createOrdersTestContext, type OrdersCtx } from './orders-harness.js';
import { CollectionsModule } from '../../src/modules/transactions/collections/collections.module.js';
import { PaperModule } from '../../src/modules/transactions/paper/paper.module.js';

export type Cat = 'MILK' | 'NON_MILK';
export type Phase = 'night' | 'morning' | 'admin';
export type AmountCol =
  | 'office_cash_collection'
  | 'cash_collection'
  | 'cheque_collection'
  | 'online_collection'
  | 'bank_deposit';

export const CATS: Cat[] = ['MILK', 'NON_MILK'];
export const PHASES: Phase[] = ['night', 'morning', 'admin'];

// Messages are copied from the approved decision file (CD-2.3, CD-4, CD-6.2, CD-6.3, CD-9).
export const STALE_MESSAGE =
  'Collections data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';
export const EXHAUSTED_MESSAGE =
  'Your request conflicted with another update and could not be completed. Please retry.';
export const TIMEOUT_MESSAGE =
  'The request took too long and nothing was saved. Please retry.';
export const SUCCESS_MESSAGE: Record<Phase, string> = {
  night: 'Night collections saved successfully',
  morning: 'Morning collections saved successfully',
  admin: 'Admin collections saved successfully',
};
export const NIGHT_NOT_ALLOWED =
  'Night collections cannot be edited in the current workflow state';
export const ADMIN_NOT_ALLOWED =
  'Admin collections cannot be edited in current workflow state';
export const MORNING_NOT_ALLOWED = (status: string) =>
  `Cannot edit morning collections when paper is ${status}. Allowed statuses: NIGHT_SUBMITTED, REOPENED`;
export const NOT_IN_CATEGORY = (id: number, cat: Cat) =>
  `Client ${id} does not belong to ${cat} category.`;

/** The columns each phase owns (CD-1.1, CD-6.5). */
export const PHASE_FIELDS: Record<
  Phase,
  { api: [string, string?]; db: [AmountCol, AmountCol?] }
> = {
  night: { api: ['officeCashCollection'], db: ['office_cash_collection'] },
  morning: {
    api: ['cashCollection', 'chequeCollection'],
    db: ['cash_collection', 'cheque_collection'],
  },
  admin: {
    api: ['onlineCollection', 'bankDeposit'],
    db: ['online_collection', 'bank_deposit'],
  },
};

type ClientRef = number | { id: number };
const idOf = (c: ClientRef) => (typeof c === 'number' ? c : c.id);

/** One submitted row. `undefined` amounts are omitted from the JSON body. */
export const entry = (phase: Phase, c: ClientRef, a?: unknown, b?: unknown) => {
  const [fa, fb] = PHASE_FIELDS[phase].api;
  const e: Record<string, unknown> = { clientId: idOf(c) };
  if (a !== undefined) e[fa] = a;
  if (fb && b !== undefined) e[fb] = b;
  return e;
};

const segment = (c: Cat) => (c === 'MILK' ? 'milk' : 'non-milk');
export const savePath = (sheetId: number | string, cat: Cat, phase: Phase) =>
  `/collections/sheet/${sheetId}/${segment(cat)}/${phase}-save`;

export type ColumnNode = {
  field?: string;
  headerName: string;
  children?: ColumnNode[];
};
export const leaves = (cols: ColumnNode[]): ColumnNode[] =>
  cols.flatMap((c) => (c.children?.length ? leaves(c.children) : [c]));
export const leafFields = (cols: ColumnNode[]) =>
  leaves(cols)
    .map((c) => c.field)
    .filter((f): f is string => !!f);

export const gridOf = (body: any, cat: Cat) =>
  body[cat === 'MILK' ? 'milkCollectionGrid' : 'nonMilkCollectionGrid'];
export const rowOf = (body: any, cat: Cat, clientId: number) =>
  gridOf(body, cat).rows.find((r: any) => r.clientId === clientId);

export const num = (v: unknown) => Number(v);
export const uniq = () => Math.random().toString(36).slice(2, 7);

function buildCol(ctx: OrdersCtx) {
  const tokenFor = (phase: Phase) =>
    phase === 'admin' ? ctx.tokens.admin : ctx.tokens.emp;

  /** GET the sheet. `token: null` sends no Authorization header. */
  const get = (
    sheetId: number | string,
    token: string | null = ctx.tokens.emp,
  ) => ctx.call('get', `/collections/sheet/${sheetId}`, token ?? undefined);

  /** Raw POST, body exactly as given (for malformed-body scenarios). */
  const raw = (
    phase: Phase,
    cat: Cat,
    sheetId: number | string,
    body: unknown,
    token: string | null = tokenFor(phase),
  ) =>
    ctx.call('post', savePath(sheetId, cat, phase), token ?? undefined, body);

  /** Well-formed POST. `expected === undefined` omits expectedUpdatedAt. */
  const save = (
    phase: Phase,
    cat: Cat,
    sheetId: number | string,
    entries: unknown,
    expected: string | null | undefined,
    token: string | null = tokenFor(phase),
  ) =>
    raw(
      phase,
      cat,
      sheetId,
      expected === undefined
        ? { entries }
        : { entries, expectedUpdatedAt: expected },
      token,
    );

  const tokenOf = async (sheetId: number) =>
    (
      await ctx.db.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
        select: { collections_updated_at: true },
      })
    ).collections_updated_at?.toISOString() ?? null;

  const rows = (sheetId: number) =>
    ctx.db.client_collection.findMany({
      where: { order_sheet_id: sheetId },
      orderBy: { id: 'asc' },
    });

  const row = (sheetId: number, clientId: number, category: Cat = 'MILK') =>
    ctx.db.client_collection.findUnique({
      where: {
        order_sheet_id_client_id_category: {
          order_sheet_id: sheetId,
          client_id: clientId,
          category,
        },
      },
    });

  /** DB seam: a stored row WITHOUT touching the token (also used for values the API cannot write). */
  const seedRow = (
    sheetId: number,
    clientId: number,
    category: Cat,
    values: Partial<Record<AmountCol, number>> = {},
  ) =>
    ctx.db.client_collection.create({
      data: {
        order_sheet_id: sheetId,
        client_id: clientId,
        category,
        ...values,
      },
    });

  /** Save through the API with the CURRENT token; throws unless 200. Returns the new token. */
  const seed = async (
    phase: Phase,
    cat: Cat,
    sheetId: number,
    entries: unknown,
  ): Promise<string | null> => {
    const res = await save(
      phase,
      cat,
      sheetId,
      entries,
      await tokenOf(sheetId),
    );
    if (res.status !== 200) {
      throw new Error(
        `seed ${phase}/${cat} failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.collectionsUpdatedAt as string | null;
  };

  const paperUpdatedAt = async (sheet: { paperId: number }) =>
    (
      await ctx.db.order_paper.findUniqueOrThrow({
        where: { id: sheet.paperId },
        select: { updated_at: true },
      })
    ).updated_at;

  const setCode = (clientId: number, code: string | null) =>
    ctx.db.master_client.update({ where: { id: clientId }, data: { code } });

  return {
    tokenFor,
    get,
    raw,
    save,
    tokenOf,
    rows,
    row,
    seedRow,
    seed,
    paperUpdatedAt,
    setCode,
  };
}

export type CollectionsCtx = OrdersCtx & { col: ReturnType<typeof buildCol> };

export async function createCollectionsTestContext(
  opts: Parameters<typeof createOrdersTestContext>[0] = {},
): Promise<CollectionsCtx> {
  // orders-harness mounts only Auth, Orders, VehicleAllocation and Purchase; Collections is added here, and
  // Paper too (S-59 revert, S-112b..S-117 readiness / submit-night go through the Paper endpoints).
  const ctx = await createOrdersTestContext({
    ...opts,
    modules: [
      CollectionsModule,
      PaperModule,
      ...((opts.modules ?? []) as never[]),
    ],
  });
  return Object.assign(ctx, { col: buildCol(ctx) });
}
