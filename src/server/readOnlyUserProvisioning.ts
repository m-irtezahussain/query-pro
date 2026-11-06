import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { Client as PostgresClient } from 'pg';
import mysql from 'mysql2/promise';
import type { DatabaseConnectionInput } from './databaseIntrospection';
import { logger, serializeError } from './logger';

export type ProvisionedDatabaseUser = {
  engine: DatabaseConnectionInput['engine'];
  username: string;
};

export type ProvisionedDatabaseConnection = {
  connection: DatabaseConnectionInput;
  user: ProvisionedDatabaseUser;
};

function normalizedHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

function postgresIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function postgresLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function postgresSsl(input: DatabaseConnectionInput) {
  if (input.tlsMode === 'disable') return false;
  if (input.tlsMode === 'verify-full') {
    return {
      rejectUnauthorized: true,
      servername: normalizedHost(input.host),
      minVersion: 'TLSv1.2' as const,
    };
  }
  return { rejectUnauthorized: false, minVersion: 'TLSv1.2' as const };
}

function mysqlSsl(input: DatabaseConnectionInput) {
  if (input.tlsMode === 'disable') return undefined;
  if (input.tlsMode === 'verify-full') {
    return { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
  }
  return { rejectUnauthorized: false, verifyIdentity: false, minVersion: 'TLSv1.2' };
}

async function connectPostgres(input: DatabaseConnectionInput, resolvedHost: string) {
  const client = new PostgresClient({
    host: resolvedHost,
    port: input.port || 5432,
    database: input.database,
    user: input.user,
    password: input.password,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'querycraft-user-provisioning',
    ssl: postgresSsl(input),
  });
  await client.connect();
  return client;
}

async function connectMySql(input: DatabaseConnectionInput, resolvedHost: string) {
  const port = input.port || 3306;
  return mysql.createConnection({
    host: normalizedHost(input.host),
    port,
    database: input.database,
    user: input.user,
    password: input.password,
    connectTimeout: 10_000,
    stream: () => net.createConnection({ host: resolvedHost, port }),
    multipleStatements: false,
    ssl: mysqlSsl(input),
  });
}

async function provisionPostgres(
  input: DatabaseConnectionInput,
  resolvedHost: string,
  username: string,
  password: string
): Promise<void> {
  const client = await connectPostgres(input, resolvedHost);
  const role = postgresIdentifier(username);
  const database = postgresIdentifier(input.database);
  const schema = postgresIdentifier(input.schema || 'public');
  const validUntil = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  let roleCreated = false;

  try {
    await client.query(
      `CREATE ROLE ${role} LOGIN PASSWORD ${postgresLiteral(password)} ` +
        'NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION ' +
        `CONNECTION LIMIT 5 VALID UNTIL ${postgresLiteral(validUntil)}`
    );
    roleCreated = true;
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT ON TABLES TO ${role}`
    );
    await client.query(`ALTER ROLE ${role} SET default_transaction_read_only = on`);
    await client.query(`ALTER ROLE ${role} SET statement_timeout = '15s'`);
  } catch (error) {
    if (roleCreated) {
      await client.query(`DROP OWNED BY ${role}`).catch(() => undefined);
      await client.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function provisionMySql(
  input: DatabaseConnectionInput,
  resolvedHost: string,
  username: string,
  password: string
): Promise<void> {
  const connection = await connectMySql(input, resolvedHost);
  const account = `${mysql.escape(username)}@'%'`;
  const database = mysql.escapeId(input.database);
  let userCreated = false;

  try {
    const requireTls = input.tlsMode === 'disable' ? '' : ' REQUIRE SSL';
    await connection.query(
      `CREATE USER ${account} IDENTIFIED BY ${mysql.escape(password)}${requireTls}`
    );
    userCreated = true;
    await connection.query(`GRANT SELECT, SHOW VIEW ON ${database}.* TO ${account}`);
    await connection.query(`ALTER USER ${account} WITH MAX_USER_CONNECTIONS 5`);
  } catch (error) {
    if (userCreated) await connection.query(`DROP USER IF EXISTS ${account}`).catch(() => undefined);
    throw error;
  } finally {
    await connection.end().catch(() => undefined);
  }
}

export async function provisionReadOnlyUser(
  adminConnection: DatabaseConnectionInput,
  resolvedHost: string
): Promise<ProvisionedDatabaseConnection> {
  const suffix = randomBytes(6).toString('hex');
  const username =
    adminConnection.engine === 'PostgreSQL'
      ? `querycraft_read_${suffix}`
      : `querycraft_r_${suffix}`;
  const password = randomBytes(32).toString('base64url');
  const startedAt = performance.now();

  logger.info('database.read_only_user.provisioning_started', {
    engine: adminConnection.engine,
    host: normalizedHost(adminConnection.host),
    database: adminConnection.database,
    username,
  });

  try {
    if (adminConnection.engine === 'PostgreSQL') {
      await provisionPostgres(adminConnection, resolvedHost, username, password);
    } else {
      await provisionMySql(adminConnection, resolvedHost, username, password);
    }
    logger.info('database.read_only_user.provisioning_succeeded', {
      engine: adminConnection.engine,
      database: adminConnection.database,
      username,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return {
      connection: { ...adminConnection, user: username, password },
      user: { engine: adminConnection.engine, username },
    };
  } catch (error) {
    logger.error('database.read_only_user.provisioning_failed', {
      engine: adminConnection.engine,
      database: adminConnection.database,
      username,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ...serializeError(error),
    });
    throw error;
  }
}

export async function revokeReadOnlyUser(
  adminConnection: DatabaseConnectionInput,
  resolvedHost: string,
  user: ProvisionedDatabaseUser
): Promise<void> {
  const startedAt = performance.now();
  logger.info('database.read_only_user.revocation_started', {
    engine: user.engine,
    database: adminConnection.database,
    username: user.username,
  });

  try {
    if (user.engine === 'PostgreSQL') {
      const client = await connectPostgres(adminConnection, resolvedHost);
      const role = postgresIdentifier(user.username);
      try {
        await client.query(`DROP OWNED BY ${role}`).catch(() => undefined);
        await client.query(`DROP ROLE IF EXISTS ${role}`);
      } finally {
        await client.end().catch(() => undefined);
      }
    } else {
      const connection = await connectMySql(adminConnection, resolvedHost);
      try {
        const account = `${mysql.escape(user.username)}@'%'`;
        await connection.query(`DROP USER IF EXISTS ${account}`);
      } finally {
        await connection.end().catch(() => undefined);
      }
    }
    logger.info('database.read_only_user.revocation_succeeded', {
      engine: user.engine,
      database: adminConnection.database,
      username: user.username,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  } catch (error) {
    logger.error('database.read_only_user.revocation_failed', {
      engine: user.engine,
      database: adminConnection.database,
      username: user.username,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ...serializeError(error),
    });
    throw error;
  }
}
