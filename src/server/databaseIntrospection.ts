import dns from 'node:dns/promises';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { Client as PostgresClient } from 'pg';
import mysql from 'mysql2/promise';
import nodeSqlParser from 'node-sql-parser';
import { z } from 'zod';
import { TableDefinition } from '../types/schema';
import { logger, serializeError } from './logger';
import {
  provisionReadOnlyUser,
  ProvisionedDatabaseUser,
  revokeReadOnlyUser,
} from './readOnlyUserProvisioning';

export const databaseConnectionSchema = z.strictObject({
  engine: z.enum(['PostgreSQL', 'MySQL']),
  host: z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9._:-]+$/),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().trim().min(1).max(128),
  schema: z.string().trim().min(1).max(128).optional(),
  user: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1024),
  tlsMode: z.enum(['require', 'verify-full', 'disable']).default('require'),
});

export type DatabaseConnectionInput = z.infer<typeof databaseConnectionSchema>;

type RegisteredConnection = {
  connection: DatabaseConnectionInput;
  adminConnection: DatabaseConnectionInput;
  provisionedUser: ProvisionedDatabaseUser;
  resolvedHost: string;
  expiresAt: number;
};

const connectionRegistry = new Map<string, RegisteredConnection>();
const parser = new nodeSqlParser.Parser();
const connectionTtlMs = 8 * 60 * 60 * 1000;
const maxResultRows = 500;

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of connectionRegistry) {
    if (entry.expiresAt <= now) {
      connectionRegistry.delete(id);
      void revokeReadOnlyUser(
        entry.adminConnection,
        entry.resolvedHost,
        entry.provisionedUser
      ).catch(() => undefined);
    }
  }
}, 15 * 60 * 1000).unref();

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
  const startedAt = performance.now();
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  logger.debug('database.dns.resolved', {
    host: normalizedHost(host),
    addressCount: addresses.length,
    families: [...new Set(addresses.map(({ family }) => family))],
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });
  if (addresses.length === 0) throw new Error('Database host could not be resolved.');

  if (!isExplicitlyAllowed(host) && addresses.some(({ address }) => isBlockedAddress(address))) {
    logger.warn('database.destination.blocked', {
      host: normalizedHost(host),
      reason: 'private_or_local_address_not_allowlisted',
    });
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
  const ssl =
    input.tlsMode === 'disable'
      ? false
      : input.tlsMode === 'verify-full'
        ? {
            rejectUnauthorized: true,
            servername: normalizedHost(input.host),
            minVersion: 'TLSv1.2' as const,
          }
        : { rejectUnauthorized: false, minVersion: 'TLSv1.2' as const };
  const client = new PostgresClient({
    host: resolvedHost,
    port: input.port || 5432,
    database: input.database,
    user: input.user,
    password: input.password,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'querycraft-schema-import',
    ssl,
  });

  try {
    const connectionStartedAt = performance.now();
    logger.debug('database.connection.started', {
      engine: 'PostgreSQL',
      host: normalizedHost(input.host),
      port: input.port || 5432,
      database: input.database,
      schema,
      tlsMode: input.tlsMode,
    });
    await client.connect();
    logger.info('database.connection.succeeded', {
      engine: 'PostgreSQL',
      host: normalizedHost(input.host),
      database: input.database,
      durationMs: Math.round((performance.now() - connectionStartedAt) * 100) / 100,
    });
    const queryStartedAt = performance.now();
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
    logger.debug('database.metadata.query.succeeded', {
      engine: 'PostgreSQL',
      rowCount: result.rowCount,
      durationMs: Math.round((performance.now() - queryStartedAt) * 100) / 100,
    });
    return rowsToTables(result.rows);
  } finally {
    await client.end().catch(() => undefined);
    logger.debug('database.connection.closed', { engine: 'PostgreSQL' });
  }
}

async function introspectMySql(
  input: DatabaseConnectionInput,
  resolvedHost: string
): Promise<TableDefinition[]> {
  const port = input.port || 3306;
  const connectionStartedAt = performance.now();
  logger.debug('database.connection.started', {
    engine: 'MySQL',
    host: normalizedHost(input.host),
    port,
    database: input.database,
    tlsMode: input.tlsMode,
  });
  const connection = await mysql.createConnection({
    host: normalizedHost(input.host),
    port,
    database: input.database,
    user: input.user,
    password: input.password,
    connectTimeout: 10_000,
    stream: () => net.createConnection({ host: resolvedHost, port }),
    ssl:
      input.tlsMode === 'disable'
        ? undefined
        : input.tlsMode === 'verify-full'
          ? { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' }
          : { rejectUnauthorized: false, verifyIdentity: false, minVersion: 'TLSv1.2' },
  });

  try {
    logger.info('database.connection.succeeded', {
      engine: 'MySQL',
      host: normalizedHost(input.host),
      database: input.database,
      durationMs: Math.round((performance.now() - connectionStartedAt) * 100) / 100,
    });
    const queryStartedAt = performance.now();
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
    logger.debug('database.metadata.query.succeeded', {
      engine: 'MySQL',
      rowCount: Array.isArray(rows) ? rows.length : undefined,
      durationMs: Math.round((performance.now() - queryStartedAt) * 100) / 100,
    });
    return rowsToTables(rows as ColumnRow[]);
  } finally {
    await connection.end();
    logger.debug('database.connection.closed', { engine: 'MySQL' });
  }
}

export async function introspectDatabase(input: DatabaseConnectionInput) {
  const startedAt = performance.now();
  logger.info('database.introspection.started', {
    engine: input.engine,
    host: normalizedHost(input.host),
    port: input.port || (input.engine === 'PostgreSQL' ? 5432 : 3306),
    database: input.database,
    schema: input.schema,
    tlsMode: input.tlsMode,
  });

  let provisioned:
    | { connection: DatabaseConnectionInput; user: ProvisionedDatabaseUser }
    | undefined;
  let resolvedHost: string | undefined;
  try {
    resolvedHost = await resolveSafeHost(input.host);
    provisioned = await provisionReadOnlyUser(input, resolvedHost);
    const tables =
      input.engine === 'PostgreSQL'
        ? await introspectPostgres(provisioned.connection, resolvedHost)
        : await introspectMySql(provisioned.connection, resolvedHost);

    if (tables.length === 0) {
      throw new Error('No tables were found in the selected database or schema.');
    }

    const connectionId = randomUUID();
    const connectionExpiresAt = Date.now() + connectionTtlMs;
    connectionRegistry.set(connectionId, {
      connection: provisioned.connection,
      adminConnection: { ...input },
      provisionedUser: provisioned.user,
      resolvedHost,
      expiresAt: connectionExpiresAt,
    });
    const result = { tables, connectionId, connectionExpiresAt };
    logger.result('database.introspection.succeeded', result, {
      engine: input.engine,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return result;
  } catch (error) {
    if (provisioned && resolvedHost) {
      await revokeReadOnlyUser(input, resolvedHost, provisioned.user).catch(() => undefined);
    }
    logger.error('database.introspection.failed', {
      engine: input.engine,
      host: normalizedHost(input.host),
      database: input.database,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ...serializeError(error),
    });
    throw error;
  }
}

export class ReadQueryError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'ReadQueryError';
  }
}

function assertReadOnlySql(sql: string, engine: 'PostgreSQL' | 'MySQL') {
  let ast: any;
  try {
    ast = parser.astify(sql, { database: engine === 'PostgreSQL' ? 'Postgresql' : 'MySQL' });
  } catch {
    throw new ReadQueryError('The query could not be parsed safely. Only SELECT queries are allowed.');
  }
  const statements = Array.isArray(ast) ? ast : [ast];
  const forbiddenTypes = new Set([
    'alter', 'create', 'delete', 'drop', 'insert', 'replace', 'truncate', 'update',
  ]);
  const containsForbiddenNode = (value: unknown, seen = new WeakSet<object>()): boolean => {
    if (!value || typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (
      'type' in value &&
      typeof (value as { type?: unknown }).type === 'string' &&
      forbiddenTypes.has((value as { type: string }).type.toLowerCase())
    ) {
      return true;
    }
    return Object.values(value).some((child) => containsForbiddenNode(child, seen));
  };
  if (
    statements.length !== 1 ||
    statements[0]?.type !== 'select' ||
    containsForbiddenNode(statements[0])
  ) {
    throw new ReadQueryError('Only one SELECT or WITH ... SELECT statement is allowed.');
  }
}

function getRegisteredConnection(connectionId: string) {
  const entry = connectionRegistry.get(connectionId);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) {
      connectionRegistry.delete(connectionId);
      void revokeReadOnlyUser(
        entry.adminConnection,
        entry.resolvedHost,
        entry.provisionedUser
      ).catch(() => undefined);
    }
    throw new ReadQueryError('The live database connection has expired. Reconnect the database.', 410);
  }
  return entry.connection;
}

export async function closeLiveDatabaseConnections(): Promise<void> {
  const entries = [...connectionRegistry.values()];
  connectionRegistry.clear();
  if (entries.length === 0) return;

  logger.info('database.live_connections.closing', { connectionCount: entries.length });
  await Promise.allSettled(
    entries.map((entry) =>
      revokeReadOnlyUser(entry.adminConnection, entry.resolvedHost, entry.provisionedUser)
    )
  );
  logger.info('database.live_connections.closed', { connectionCount: entries.length });
}

export async function executeReadQuery(connectionId: string, sql: string) {
  const startedAt = performance.now();
  const input = getRegisteredConnection(connectionId);
  assertReadOnlySql(sql, input.engine);
  const cleanSql = sql.trim().replace(/;+\s*$/, '');
  const limitedSql = `SELECT * FROM (${cleanSql}) AS querycraft_result LIMIT ${maxResultRows + 1}`;
  const resolvedHost = await resolveSafeHost(input.host);

  logger.info('database.read_query.started', {
    engine: input.engine,
    host: normalizedHost(input.host),
    database: input.database,
    sqlLength: sql.length,
    rowLimit: maxResultRows,
  });

  try {
    let rows: Record<string, any>[];
    let columns: string[];
    if (input.engine === 'PostgreSQL') {
      const ssl =
        input.tlsMode === 'disable'
          ? false
          : input.tlsMode === 'verify-full'
            ? { rejectUnauthorized: true, servername: normalizedHost(input.host), minVersion: 'TLSv1.2' as const }
            : { rejectUnauthorized: false, minVersion: 'TLSv1.2' as const };
      const client = new PostgresClient({
        host: resolvedHost,
        port: input.port || 5432,
        database: input.database,
        user: input.user,
        password: input.password,
        ssl,
        connectionTimeoutMillis: 10_000,
        application_name: 'querycraft-read-query',
      });
      try {
        await client.connect();
        await client.query('BEGIN TRANSACTION READ ONLY');
        await client.query("SET LOCAL statement_timeout = '15000ms'");
        const result = await client.query(limitedSql);
        rows = result.rows;
        columns = result.fields.map((field) => field.name);
        await client.query('ROLLBACK');
      } finally {
        await client.end().catch(() => undefined);
      }
    } else {
      const port = input.port || 3306;
      const connection = await mysql.createConnection({
        host: normalizedHost(input.host),
        port,
        database: input.database,
        user: input.user,
        password: input.password,
        connectTimeout: 10_000,
        stream: () => net.createConnection({ host: resolvedHost, port }),
        multipleStatements: false,
        ssl:
          input.tlsMode === 'disable'
            ? undefined
            : input.tlsMode === 'verify-full'
              ? { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' }
              : { rejectUnauthorized: false, verifyIdentity: false, minVersion: 'TLSv1.2' },
      });
      try {
        await connection.query('SET SESSION MAX_EXECUTION_TIME = 15000');
        await connection.query('START TRANSACTION READ ONLY');
        const [resultRows, fields] = await connection.query(limitedSql);
        rows = resultRows as Record<string, any>[];
        columns = (fields || []).map((field: any) => field.name);
        await connection.rollback();
      } finally {
        await connection.end();
      }
    }

    const truncated = rows.length > maxResultRows;
    if (truncated) rows = rows.slice(0, maxResultRows);
    const result = {
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      truncated,
      executionTimeMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
    logger.result('database.read_query.succeeded', result, {
      engine: input.engine,
      rowCount: rows.length,
      truncated,
      durationMs: result.executionTimeMs,
    });
    return result;
  } catch (error) {
    logger.error('database.read_query.failed', {
      engine: input.engine,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ...serializeError(error),
    });
    throw error;
  }
}
