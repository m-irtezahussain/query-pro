import dns from 'node:dns/promises';
import net from 'node:net';
import { Client as PostgresClient } from 'pg';
import mysql from 'mysql2/promise';
import { z } from 'zod';
import { TableDefinition } from '../types/schema';

export const databaseConnectionSchema = z.strictObject({
  engine: z.enum(['PostgreSQL', 'MySQL']),
  host: z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9._:-]+$/),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().trim().min(1).max(128),
  schema: z.string().trim().min(1).max(128).optional(),
  user: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1024),
  ssl: z.boolean().default(true),
});

export type DatabaseConnectionInput = z.infer<typeof databaseConnectionSchema>;

const blockedAddresses = new net.BlockList();
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('100.64.0.0', 10, 'ipv4');
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('224.0.0.0', 4, 'ipv4');
blockedAddresses.addSubnet('240.0.0.0', 4, 'ipv4');
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');
blockedAddresses.addSubnet('ff00::', 8, 'ipv6');
blockedAddresses.addSubnet('2001:db8::', 32, 'ipv6');

function normalizedHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

function isExplicitlyAllowed(host: string): boolean {
  const allowed = (process.env.DB_CONNECTION_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => normalizedHost(value.trim()))
    .filter(Boolean);
  return allowed.includes(normalizedHost(host));
}

function isBlockedAddress(address: string): boolean {
  const plainAddress = address.split('%')[0];
  if (plainAddress.toLowerCase().startsWith('::ffff:')) {
    return blockedAddresses.check(plainAddress.slice(7), 'ipv4');
  }
  const family = net.isIP(plainAddress);
  if (family === 4) return blockedAddresses.check(plainAddress, 'ipv4');
  if (family === 6) return blockedAddresses.check(plainAddress, 'ipv6');
  return true;
}

async function resolveSafeHost(host: string): Promise<string> {
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error('Database host could not be resolved.');

  if (!isExplicitlyAllowed(host) && addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error(
      'Private or local database hosts must be listed in DB_CONNECTION_ALLOWED_HOSTS.'
    );
  }

  return addresses[0].address;
}

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  column_key?: string;
  constraint_type?: string | null;
  referenced_table_name?: string | null;
  referenced_column_name?: string | null;
};

function rowsToTables(rows: ColumnRow[]): TableDefinition[] {
  const tables = new Map<string, TableDefinition>();

  for (const row of rows) {
    let table = tables.get(row.table_name);
    if (!table) {
      table = {
        id: `tbl-${row.table_name.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        name: row.table_name,
        description: 'Imported from a live database connection',
        columns: [],
        sampleData: [],
      };
      tables.set(row.table_name, table);
    }

    const existing = table.columns.find((column) => column.name === row.column_name);
    if (existing) {
      if (row.constraint_type === 'PRIMARY KEY') existing.isPrimary = true;
      if (row.constraint_type === 'UNIQUE') existing.isUnique = true;
      if (row.referenced_table_name && row.referenced_column_name) {
        existing.references = {
          table: row.referenced_table_name,
          column: row.referenced_column_name,
        };
      }
      continue;
    }

    table.columns.push({
      name: row.column_name,
      type: row.data_type,
      isPrimary: row.column_key === 'PRI' || row.constraint_type === 'PRIMARY KEY',
      isUnique: row.column_key === 'UNI' || row.constraint_type === 'UNIQUE',
      isNullable: row.is_nullable === 'YES',
      defaultValue: row.column_default || undefined,
      references:
        row.referenced_table_name && row.referenced_column_name
          ? { table: row.referenced_table_name, column: row.referenced_column_name }
          : undefined,
    });
  }

  return [...tables.values()];
}

async function introspectPostgres(
  input: DatabaseConnectionInput,
  resolvedHost: string
): Promise<TableDefinition[]> {
  const schema = input.schema || 'public';
  const client = new PostgresClient({
    host: resolvedHost,
    port: input.port || 5432,
    database: input.database,
    user: input.user,
    password: input.password,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'querycraft-schema-import',
    ssl: input.ssl
      ? { rejectUnauthorized: true, servername: normalizedHost(input.host) }
      : false,
  });

  try {
    await client.connect();
    const result = await client.query<ColumnRow>(
      `SELECT
        c.table_name,
        c.column_name,
        CASE
          WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
          WHEN c.character_maximum_length IS NOT NULL
            THEN c.data_type || '(' || c.character_maximum_length || ')'
          ELSE c.data_type
        END AS data_type,
        c.is_nullable,
        c.column_default,
        tc.constraint_type,
        ccu.table_name AS referenced_table_name,
        ccu.column_name AS referenced_column_name
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON kcu.table_schema = c.table_schema
        AND kcu.table_name = c.table_name
        AND kcu.column_name = c.column_name
      LEFT JOIN information_schema.table_constraints tc
        ON tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_schema = tc.constraint_schema
        AND ccu.constraint_name = tc.constraint_name
        AND tc.constraint_type = 'FOREIGN KEY'
      WHERE c.table_schema = $1
      ORDER BY c.table_name, c.ordinal_position`,
      [schema]
    );
    return rowsToTables(result.rows);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function introspectMySql(
  input: DatabaseConnectionInput,
  resolvedHost: string
): Promise<TableDefinition[]> {
  const port = input.port || 3306;
  const connection = await mysql.createConnection({
    host: normalizedHost(input.host),
    port,
    database: input.database,
    user: input.user,
    password: input.password,
    connectTimeout: 10_000,
    stream: () => net.createConnection({ host: resolvedHost, port }),
    ssl: input.ssl
      ? { rejectUnauthorized: true, verifyIdentity: true }
      : undefined,
  });

  try {
    const [rows] = await connection.execute(
      `SELECT
        c.TABLE_NAME AS table_name,
        c.COLUMN_NAME AS column_name,
        c.COLUMN_TYPE AS data_type,
        c.IS_NULLABLE AS is_nullable,
        c.COLUMN_DEFAULT AS column_default,
        c.COLUMN_KEY AS column_key,
        kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
        kcu.REFERENCED_COLUMN_NAME AS referenced_column_name
      FROM information_schema.COLUMNS c
      LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
        ON kcu.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND kcu.TABLE_NAME = c.TABLE_NAME
        AND kcu.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_SCHEMA = ?
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
      [input.database]
    );
    return rowsToTables(rows as ColumnRow[]);
  } finally {
    await connection.end();
  }
}

export async function introspectDatabase(input: DatabaseConnectionInput) {
  const resolvedHost = await resolveSafeHost(input.host);
  const tables =
    input.engine === 'PostgreSQL'
      ? await introspectPostgres(input, resolvedHost)
      : await introspectMySql(input, resolvedHost);

  if (tables.length === 0) {
    throw new Error('No tables were found in the selected database or schema.');
  }

  return { tables };
}
