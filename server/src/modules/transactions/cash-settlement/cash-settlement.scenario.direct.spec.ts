/**
 * Cash Settlement – direct collections.
 * Scenarios: S-80 .. S-87   (spec: CS-8, CS-5.7, DQ2)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MSG,
  ok,
  directEntry,
  createCashTestContext,
  type CashCtx,
} from '../../../../test/helper/cash-settlement-harness.js';

describe('Cash Settlement – direct collections', () => {
  let ctx: CashCtx;
  beforeAll(async () => {
    ctx = await createCashTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.cs.cleanup();
  });

  const cs = () => ctx.cs;
  const save = async (
    paperId: number,
    rows: unknown[],
    extra: Record<string, unknown> = {},
  ) =>
    cs().save('direct', paperId, rows, await cs().paperToken(paperId), {
      extra,
    });

  it('S-80 a non-zero entry for an active employee with no row creates the row', async () => {
    const s = await cs().scene();
    const body = ok(
      await save(s.paperId, [
        directEntry(s.employee.id, { note500: 2, coins: 5 }),
      ]),
    );
    const rows = await cs().directRows(s.paperId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employee_id: s.employee.id, note_500: 2 });
    expect(body.directCollections[0]).toMatchObject({
      employeeId: s.employee.id,
      collectionAmount: 1005,
    });
  });

  it('S-81 an all-zero entry with no row creates nothing; with a stored row it removes the row (a change)', async () => {
    const s = await cs().scene();
    const before = await cs().paperToken(s.paperId);
    const none = ok(
      await cs().save(
        'direct',
        s.paperId,
        [directEntry(s.employee.id)],
        before,
      ),
    );
    expect(none.changed).toBe(false);
    expect(await cs().directRows(s.paperId)).toHaveLength(0);
    expect(await cs().paperToken(s.paperId)).toBe(before);

    await cs().seed('direct', s.paperId, [
      directEntry(s.employee.id, { note100: 1 }),
    ]);
    const removed = ok(await save(s.paperId, [directEntry(s.employee.id)]));
    expect(removed.changed).toBe(true);
    expect(await cs().directRows(s.paperId)).toHaveLength(0);
  });

  it('S-82 employees that are not in the payload are untouched', async () => {
    const s = await cs().scene();
    const second = await cs().addEmployee();
    await cs().seed('direct', s.paperId, [
      directEntry(s.employee.id, { note100: 1 }),
      directEntry(second.id, { note100: 2 }),
    ]);
    ok(await save(s.paperId, [directEntry(s.employee.id, { note100: 9 })]));
    const rows = await cs().directRows(s.paperId);
    expect(rows.find((r) => r.employee_id === s.employee.id)!.note_100).toBe(9);
    expect(rows.find((r) => r.employee_id === second.id)!.note_100).toBe(2);
  });

  it('S-83 deleting an employee with no row on this paper, or saving and deleting the same employee, is 400', async () => {
    const s = await cs().scene();
    const noRow = await save(s.paperId, [], {
      deletedEmployeeIds: [s.employee.id],
    });
    expect(noRow.status).toBe(400);
    await cs().seed('direct', s.paperId, [
      directEntry(s.employee.id, { note100: 1 }),
    ]);
    const both = await save(
      s.paperId,
      [directEntry(s.employee.id, { note100: 2 })],
      { deletedEmployeeIds: [s.employee.id] },
    );
    expect(both.status).toBe(400);
    expect((await cs().directRows(s.paperId))[0].note_100).toBe(1);
  });

  it("S-83b deletedEmployeeIds removes that employee's row", async () => {
    const s = await cs().scene();
    await cs().seed('direct', s.paperId, [
      directEntry(s.employee.id, { note100: 1 }),
    ]);
    ok(await save(s.paperId, [], { deletedEmployeeIds: [s.employee.id] }));
    expect(await cs().directRows(s.paperId)).toHaveLength(0);
  });

  it('S-84 a non-zero entry for a nonexistent employee is 400 with details', async () => {
    const s = await cs().scene();
    const res = await save(s.paperId, [
      directEntry(2147483647, { note100: 1 }),
    ]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(MSG.INVALID_ENTRIES);
    expect(res.body.details.join(' ')).toContain('Employee(s) not found');
  });

  it('S-85 an inactive employee cannot get a NEW row (400) but an employee that already has a row stays updatable', async () => {
    const s = await cs().scene();
    const inactive = await cs().addEmployee({ active: false });
    const res = await save(s.paperId, [
      directEntry(inactive.id, { note100: 1 }),
    ]);
    expect(res.status).toBe(400);
    expect(res.body.details.join(' ')).toContain('Inactive employee');

    await cs().seed('direct', s.paperId, [
      directEntry(s.employee.id, { note100: 1 }),
    ]);
    await cs().setEmployeeActive(s.employee.id, false);
    ok(await save(s.paperId, [directEntry(s.employee.id, { note100: 4 })]));
    expect((await cs().directRows(s.paperId))[0].note_100).toBe(4);
  });

  it('S-86 an all-zero entry for a nonexistent or inactive employee with no row is ignored (200, changed false); non-zero is still 400 (DQ2)', async () => {
    const s = await cs().scene();
    const inactive = await cs().addEmployee({ active: false });
    const before = await cs().paperToken(s.paperId);
    for (const id of [2147483647, inactive.id]) {
      const zero = ok(
        await cs().save('direct', s.paperId, [directEntry(id)], before),
      );
      expect(zero.changed, String(id)).toBe(false);
      const nonZero = await cs().save(
        'direct',
        s.paperId,
        [directEntry(id, { note10: 1 })],
        before,
      );
      expect(nonZero.status, String(id)).toBe(400);
    }
    expect(await cs().paperToken(s.paperId)).toBe(before);
    expect(await cs().directRows(s.paperId)).toHaveLength(0);
  });

  it('S-87 the same employee twice in one request is 400', async () => {
    const s = await cs().scene();
    const res = await save(s.paperId, [
      directEntry(s.employee.id, { note10: 1 }),
      directEntry(s.employee.id, { note10: 2 }),
    ]);
    expect(res.status).toBe(400);
    expect(await cs().directRows(s.paperId)).toHaveLength(0);
  });
});
