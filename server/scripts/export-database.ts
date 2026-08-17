import 'dotenv/config';
import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

type Column = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
};

type ForeignKey = {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
};

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in .env');
}

const client = new Client({
  connectionString: DATABASE_URL,
});

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
  return value.toLocaleString('sv-SE', {
    timeZone: 'Asia/Calcutta',
  });
}

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

async function getTables(): Promise<string[]> {
  const result = await client.query(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename;
  `);

  return result.rows.map((row) => row.tablename);
}

async function getColumns(tableName: string): Promise<Column[]> {
  const result = await client.query(
    `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position;
    `,
    [tableName],
  );

  return result.rows;
}

async function getForeignKeys(tableName: string): Promise<ForeignKey[]> {
  const result = await client.query(
    `
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
      ORDER BY kcu.ordinal_position;
    `,
    [tableName],
  );

  return result.rows;
}

async function getPrimaryKeyColumns(tableName: string): Promise<string[]> {
  const result = await client.query(
    `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
      ORDER BY kcu.ordinal_position;
    `,
    [tableName],
  );

  return result.rows.map((row) => row.column_name);
}

async function getRows(tableName: string): Promise<Record<string, unknown>[]> {
  const result = await client.query(
    `SELECT * FROM public.${quoteIdentifier(tableName)};`,
  );

  return result.rows;
}

function buildColumnsSection(
  columns: Column[],
  primaryKeys: string[],
): string {
  let output = `| Column | Type | Nullable | Default | Primary Key |\n`;
  output += `|---|---|---|---|---|\n`;

  for (const column of columns) {
    const isPrimaryKey = primaryKeys.includes(column.column_name);

    const type =
      column.udt_name !== column.data_type
        ? `${column.data_type} (${column.udt_name})`
        : column.data_type;

    output += `| ${column.column_name} | ${escapeMarkdown(type)} | ${column.is_nullable} | ${escapeMarkdown(column.column_default ?? '')} | ${isPrimaryKey ? 'YES' : ''} |\n`;
  }

  return output;
}

function buildForeignKeysSection(foreignKeys: ForeignKey[]): string {
  if (foreignKeys.length === 0) {
    return 'None\n';
  }

  let output = `| Constraint | Column | References |\n`;
  output += `|---|---|---|\n`;

  for (const fk of foreignKeys) {
    output += `| ${fk.constraint_name} | ${fk.column_name} | ${fk.foreign_table_name}.${fk.foreign_column_name} |\n`;
  }

  return output;
}

function buildDataSection(
  columns: Column[],
  rows: Record<string, unknown>[],
): string {
  if (rows.length === 0) {
    return '_No rows._\n';
  }

  const columnNames = columns.map((column) => column.column_name);

  let output = `| ${columnNames.join(' | ')} |\n`;
  output += `| ${columnNames.map(() => '---').join(' | ')} |\n`;

  for (const row of rows) {
    const values = columnNames.map((columnName) => {
      const value = formatValue(row[columnName]);
      return escapeMarkdown(value);
    });

    output += `| ${values.join(' | ')} |\n`;
  }

  return output;
}

async function main(): Promise<void> {
  console.log('Connecting to PostgreSQL...');

  await client.connect();

  console.log('Connected.');

const result = await client.query(`
  SELECT
    current_database() AS database,
    current_user AS user,
    inet_server_addr() AS host,
    inet_server_port() AS port,
    pg_backend_pid() AS backend_pid,
    current_setting('TimeZone') AS timezone;
`);

console.log('NODE CONNECTION:', result.rows[0]);

const orderPaper = await client.query(`
  SELECT
    id,
    order_date,
    sale_date,
    status,
    xmin::text,
    ctid
  FROM public.order_paper
  WHERE id = 1;
`);

console.log('NODE ORDER PAPER:', orderPaper.rows[0]);
console.log('NODE POSTGRES RESULT:', result.rows);

  const tables = await getTables();

  console.log(`Found ${tables.length} tables.`);

  let markdown = '';

  markdown += '# Database Snapshot\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += `Total tables: ${tables.length}\n\n`;

  markdown += '## Tables\n\n';

  for (const tableName of tables) {
    markdown += `- [${tableName}](#${tableName.replace(/_/g, '-')})\n`;
  }

  markdown += '\n---\n\n';

  for (const tableName of tables) {
    console.log(`Exporting: ${tableName}`);

    const columns = await getColumns(tableName);
    const primaryKeys = await getPrimaryKeyColumns(tableName);
    const foreignKeys = await getForeignKeys(tableName);
    const rows = await getRows(tableName);

    markdown += `## ${tableName}\n\n`;

    markdown += `**Rows:** ${rows.length}\n\n`;

    markdown += `### Columns\n\n`;
    markdown += buildColumnsSection(columns, primaryKeys);
    markdown += '\n';

    markdown += `### Foreign Keys\n\n`;
    markdown += buildForeignKeysSection(foreignKeys);
    markdown += '\n';

    markdown += `### Data\n\n`;
    markdown += buildDataSection(columns, rows);
    markdown += '\n';

    markdown += '---\n\n';
  }

  const outputPath = path.resolve(process.cwd(), 'database-snapshot.md');

  await writeFile(outputPath, markdown, 'utf8');

  await client.end();

  console.log('');
  console.log('Database export completed.');
  console.log(`Output: ${outputPath}`);
}

main().catch(async (error) => {
  console.error('');
  console.error('Database export failed.');
  console.error(error);

  try {
    await client.end();
  } catch {
    // Ignore connection close errors.
  }

  process.exit(1);
});