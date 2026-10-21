import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
it('pglite works', async () => {
  const db = new PGlite();
  const r = await db.query('select 1 as x');
  expect(r.rows[0]).toEqual({ x: 1 });
  const tz = await db.query('show timezone');
  console.log(tz.rows);
});
