import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  databaseConnectionSchema,
  closeLiveDatabaseConnections,
  disconnectLiveDatabaseConnection,
  executeReadQuery,
  introspectDatabase,
  ReadQueryError,
} from './src/server/databaseIntrospection';
import {
  isResultPayloadLoggingEnabled,
  logger,
  serializeError,
  withRequestContext,
} from './src/server/logger';
import { compactSchemaForPrompt } from './src/server/schemaCompaction';
import { quotePostgresSchemaIdentifiers } from './src/server/sqlIdentifierQuoting';

dotenv.config({ quiet: true });

const appRoot = process.cwd();

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  const incomingRequestId = req.header('x-request-id');
  const requestId =
    incomingRequestId && /^[a-zA-Z0-9._:-]{1,100}$/.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();
  const startedAt = performance.now();
  res.setHeader('x-request-id', requestId);

  withRequestContext(requestId, () => {
    logger.info('http.request.started', {
      method: req.method,
      path: req.path,
      sourceIp: req.socket.remoteAddress,
      userAgent: req.header('user-agent'),
      contentLength: req.header('content-length'),
    });
    res.on('finish', () => {
      logger.info('http.request.completed', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        contentLength: res.getHeader('content-length'),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    });
    next();
  });
});

app.use(express.json({ limit: '10mb' }));

// Container and load-balancer health check. This deliberately does not call
// Workers AI, so the service can be healthy before an AI request is made.
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/introspect-database', async (req: Request, res: Response) => {
  const parsed = databaseConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('database.introspection.validation_failed', {
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code,
      })),
    });
    return res.status(422).json({
      error: 'Invalid database connection details.',
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    const result = await introspectDatabase(parsed.data);
    return res.json(result);
  } catch (error: any) {
    if (
      parsed.data.engine === 'PostgreSQL' &&
      error?.code === '42501' &&
      /create role/i.test(String(error?.message))
    ) {
      return res.status(403).json({
        error:
          'The supplied PostgreSQL account cannot create the temporary read-only role. For DigitalOcean, connect with the cluster doadmin account, or ask the database administrator to provide a provisioning account with CREATEROLE and permission to grant access to this database and schema.',
        code: 'DATABASE_ROLE_PROVISIONING_DENIED',
      });
    }
    return res.status(502).json({
      error:
        error?.message ===
        'Private or local database hosts must be listed in DB_CONNECTION_ALLOWED_HOSTS.'
          ? error.message
          : 'Unable to connect to or inspect the database. Verify the host, credentials, TLS setting, database, and schema.',
    });
  }
});

const executeReadQuerySchema = z.strictObject({
  connectionId: z.uuid(),
  sql: z.string().trim().min(1).max(100_000),
});

app.post('/api/execute-read-query', async (req: Request, res: Response) => {
  const parsed = executeReadQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('database.read_query.validation_failed', {
      fields: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), code: issue.code })),
    });
    return res.status(422).json({ error: 'A valid connection and SQL query are required.' });
  }

  try {
    return res.json(await executeReadQuery(parsed.data.connectionId, parsed.data.sql));
  } catch (error) {
    if (error instanceof ReadQueryError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(502).json({
      error: 'The read query could not be executed. Check the backend logs using the request ID.',
    });
  }
});

const disconnectDatabaseSchema = z.strictObject({ connectionId: z.uuid() });

app.post('/api/disconnect-database', async (req: Request, res: Response) => {
  const parsed = disconnectDatabaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: 'A valid connection ID is required.' });
  }

  try {
    const disconnected = await disconnectLiveDatabaseConnection(parsed.data.connectionId);
    return res.json({ disconnected });
  } catch (error) {
    logger.error('database.disconnect.failed', serializeError(error));
    return res.status(502).json({
      error: 'The saved project was removed, but its temporary database user could not be revoked automatically.',
    });
  }
});

type JsonSchema = Record<string, unknown>;

const DEFAULT_CLOUDFLARE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

const columnSchema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string' },
    isPrimary: { type: 'boolean' },
    isNullable: { type: 'boolean' },
    isUnique: { type: 'boolean' },
    defaultValue: { type: 'string' },
    references: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        column: { type: 'string' },
      },
      required: ['table', 'column'],
    },
  },
  required: ['name', 'type'],
};

const tableSchema: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    columns: { type: 'array', items: columnSchema },
    sampleData: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  },
  required: ['id', 'name', 'columns', 'sampleData'],
};

const schemaResponseSchema: JsonSchema = {
  type: 'object',
  properties: {
    projectName: { type: 'string' },
    projectDescription: { type: 'string' },
    tables: { type: 'array', items: tableSchema },
  },
  required: ['tables'],
};

const getCloudflareConfig = () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must both be configured.'
    );
  }

  return {
    apiToken,
    model: process.env.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_MODEL,
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
  };
};

async function requestCloudflareJson(
  operation: string,
  systemInstruction: string,
  userContent: string,
  responseSchema: JsonSchema
): Promise<Record<string, any>> {
  const startedAt = performance.now();
  const { apiToken, model, url } = getCloudflareConfig();
  const configuredMaxTokens = Number(process.env.CLOUDFLARE_AI_MAX_TOKENS);
  const maxTokens =
    Number.isInteger(configuredMaxTokens) &&
    configuredMaxTokens >= 256 &&
    configuredMaxTokens <= 8192
      ? configuredMaxTokens
      : DEFAULT_MAX_OUTPUT_TOKENS;
  logger.info('cloudflare.ai.request.started', {
    operation,
    model,
    systemInstructionLength: systemInstruction.length,
    userContentLength: userContent.length,
    maxTokens,
  });

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: responseSchema,
        },
      }),
    });
  } catch (error) {
    logger.error('cloudflare.ai.request.network_failed', {
      operation,
      model,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ...serializeError(error),
    });
    throw error;
  }

  const responseText = await response.text();
  let payload: any;
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    logger.error('cloudflare.ai.response.invalid_envelope', {
      operation,
      model,
      statusCode: response.status,
      responseLength: responseText.length,
      cfRay: response.headers.get('cf-ray'),
      ...serializeError(error),
    });
    throw new Error('Cloudflare Workers AI returned a non-JSON response.');
  }

  logger.info('cloudflare.ai.response.received', {
    operation,
    model,
    statusCode: response.status,
    responseLength: responseText.length,
    cfRay: response.headers.get('cf-ray'),
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.error?.message ||
      payload?.error ||
      `Cloudflare Workers AI request failed with status ${response.status}.`;
    logger.error('cloudflare.ai.request.failed', {
      operation,
      model,
      statusCode: response.status,
      providerError: String(message),
      cfRay: response.headers.get('cf-ray'),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    throw new Error(String(message));
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'object' && content !== null) {
    logger.result('cloudflare.ai.request.succeeded', content, {
      operation,
      model,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return content;
  }
  if (typeof content !== 'string' || !content.trim()) {
    logger.error('cloudflare.ai.response.empty', { operation, model });
    throw new Error('Cloudflare Workers AI returned an empty response.');
  }

  try {
    const result = JSON.parse(content);
    logger.result('cloudflare.ai.request.succeeded', result, {
      operation,
      model,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
    return result;
  } catch (error) {
    logger.error('cloudflare.ai.response.invalid_content', {
      operation,
      model,
      contentLength: content.length,
      ...serializeError(error),
    });
    throw new Error('Cloudflare Workers AI returned invalid JSON.');
  }
};

// Natural language to SQL query generation
app.post('/api/generate-sql', async (req: Request, res: Response) => {
  try {
    const { prompt, schema, dialect = 'PostgreSQL', context } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      logger.warn('api.generate_sql.validation_failed', { reason: 'prompt_required' });
      return res.status(400).json({ error: 'A prompt in English is required.' });
    }
    if (prompt.length > 10_000 || !Array.isArray(schema)) {
      logger.warn('api.generate_sql.validation_failed', {
        reason: prompt.length > 10_000 ? 'prompt_too_large' : 'schema_must_be_array',
      });
      return res.status(422).json({ error: 'Prompt or schema is invalid.' });
    }

    const compacted = compactSchemaForPrompt(prompt, schema);
    logger.info('ai.schema.compacted', {
      operation: 'generate_sql',
      ...compacted.stats,
    });

    const systemInstruction = `You are an expert Principal Database Engineer, SQL Architect, and query optimization specialist.
Your mission is to take a natural language request in plain English, and generate accurate, high-performance, and idiomatic SQL queries based strictly on the provided database schema.

Target SQL Dialect: ${dialect}.
Rules:
1. Ground your query strictly in the provided schema (table names, column names, relationships).
2. Adhere strictly to the requested dialect's syntax (${dialect}):
   - PostgreSQL: preserve every table and column name exactly as supplied. Always double-quote any identifier containing uppercase letters or other case-sensitive characters. Use ILIKE for case-insensitive matching, LIMIT/OFFSET, and proper DATE/TIMESTAMP casting (e.g. NOW() - INTERVAL '30 days').
   - MySQL: backticks, LIKE, DATE_SUB(NOW(), INTERVAL 30 DAY), LIMIT.
   - SQLite: strftime for dates, simple types, double quotes or backticks, standard joins.
   - SQL Server: TOP N, DATEADD, DATEDIFF, square brackets [col].
3. Produce clean, well-formatted, indented SQL.
4. Explain clearly what the query does, which tables are joined, conditions, and aggregations.
5. Highlight any assumptions made and provide helpful caveats (e.g. NULL handling, LEFT vs INNER JOIN implications).
6. Suggest 2-3 natural follow-up questions the user might ask next.`;

    const contents = `User Request in English: "${prompt}"

Current Database Schema:
${JSON.stringify(compacted.schema)}

${context ? `Additional Project Context / Instructions: ${String(context).slice(0, 4000)}` : ''}

Generate the SQL query and details. Return strictly a JSON object following the required schema.`;

    const parsed = await requestCloudflareJson('generate_sql', systemInstruction, contents, {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The complete, formatted SQL query.' },
        explanation: { type: 'string', description: 'A concise explanation of the query.' },
        dialect: { type: 'string' },
        tablesUsed: { type: 'array', items: { type: 'string' } },
        columnsUsed: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
        caveats: { type: 'string' },
        suggestedIndexes: { type: 'array', items: { type: 'string' } },
        followUpQuestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['sql', 'explanation', 'tablesUsed'],
    });
    if (dialect === 'PostgreSQL' && typeof parsed.sql === 'string') {
      parsed.sql = quotePostgresSchemaIdentifiers(parsed.sql, schema);
    }
    logger.result('api.generate_sql.succeeded', parsed, { dialect });
    return res.json(parsed);
  } catch (error: any) {
    logger.error('api.generate_sql.failed', serializeError(error));
    return res.status(500).json({
      error: error.message || 'Failed to generate SQL query',
    });
  }
});

// AI Schema Assistant: Generate or refine schema from English description
app.post('/api/generate-schema', async (req: Request, res: Response) => {
  try {
    const { prompt, dialect = 'PostgreSQL', existingSchema } = req.body;

    if (!prompt) {
      logger.warn('api.generate_schema.validation_failed', { reason: 'prompt_required' });
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const systemInstruction = `You are a database design architect.
Generate a comprehensive, normalized relational database schema (tables, columns, primary keys, foreign keys, data types) and 3 to 5 realistic mock seed rows for each table based on the user's description.
Target SQL Dialect: ${dialect}.`;

    const compactedExistingSchema = Array.isArray(existingSchema)
      ? compactSchemaForPrompt(String(prompt), existingSchema)
      : undefined;
    if (compactedExistingSchema) {
      logger.info('ai.schema.compacted', {
        operation: 'generate_schema',
        ...compactedExistingSchema.stats,
      });
    }

    const contents = `User description: "${String(prompt).slice(0, 10_000)}"
${compactedExistingSchema ? `Existing schema to expand or modify:\n${JSON.stringify(compactedExistingSchema.schema)}` : ''}

Generate structured tables with columns, types, constraints, and realistic mock seed data rows for testing.`;

    const parsed = await requestCloudflareJson(
      'generate_schema',
      systemInstruction,
      contents,
      schemaResponseSchema
    );
    logger.result('api.generate_schema.succeeded', parsed, { dialect });
    return res.json(parsed);
  } catch (error: any) {
    logger.error('api.generate_schema.failed', serializeError(error));
    return res.status(500).json({
      error: error.message || 'Failed to generate schema',
    });
  }
});

// Parse DDL SQL to structured schema
app.post('/api/parse-ddl', async (req: Request, res: Response) => {
  try {
    const { ddl, dialect = 'PostgreSQL' } = req.body;
    if (!ddl || typeof ddl !== 'string') {
      logger.warn('api.parse_ddl.validation_failed', { reason: 'ddl_required' });
      return res.status(400).json({ error: 'DDL is required.' });
    }
    if (ddl.length > 1024 * 1024) {
      logger.warn('api.parse_ddl.validation_failed', {
        reason: 'ddl_too_large',
        ddlLength: ddl.length,
      });
      return res.status(413).json({ error: 'DDL must not exceed 1 MB.' });
    }
    if (ddl.length > 60_000) {
      logger.warn('api.parse_ddl.validation_failed', {
        reason: 'ddl_exceeds_ai_context_budget',
        ddlLength: ddl.length,
      });
      return res.status(413).json({
        error: 'DDL is too large for one AI request. Split it into files under 60,000 characters.',
      });
    }

    const parsed = await requestCloudflareJson(
      'parse_ddl',
      'You are an expert SQL parser. Extract tables, columns, data types, primary keys, foreign keys, and synthesize 3 realistic sample data rows for each table.',
      `Parse this SQL DDL into a structured schema with tables, columns, primary keys, and foreign keys.\nDialect: ${dialect}\n\nDDL:\n${ddl}`,
      {
        type: 'object',
        properties: { tables: { type: 'array', items: tableSchema } },
        required: ['tables'],
      }
    );
    logger.result('api.parse_ddl.succeeded', parsed, { dialect, ddlLength: ddl.length });
    return res.json(parsed);
  } catch (error: any) {
    logger.error('api.parse_ddl.failed', serializeError(error));
    return res.status(500).json({
      error: error.message || 'Failed to parse DDL',
    });
  }
});

// Explain or optimize SQL
app.post('/api/explain-sql', async (req: Request, res: Response) => {
  try {
    const { sql, schema, dialect = 'PostgreSQL' } = req.body;
    if (!sql) {
      logger.warn('api.explain_sql.validation_failed', { reason: 'sql_required' });
      return res.status(400).json({ error: 'SQL is required.' });
    }

    const compacted = Array.isArray(schema)
      ? compactSchemaForPrompt(String(sql), schema)
      : { schema: [], stats: undefined };
    if (compacted.stats) {
      logger.info('ai.schema.compacted', {
        operation: 'explain_sql',
        ...compacted.stats,
      });
    }

    const parsed = await requestCloudflareJson(
      'explain_sql',
      `You are an expert SQL Database Administrator for ${dialect}. Explain the query in plain English and suggest optimizations.`,
      `Explain this SQL query in plain English and provide performance optimization tips:\n\nSQL:\n${String(sql).slice(0, 30_000)}\n\nSchema:\n${JSON.stringify(compacted.schema)}`,
      {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          stepByStep: { type: 'array', items: { type: 'string' } },
          optimizedSql: { type: 'string' },
          optimizationNotes: { type: 'string' },
          complexityRating: { type: 'string' },
        },
        required: ['summary', 'stepByStep'],
      }
    );
    logger.result('api.explain_sql.succeeded', parsed, {
      dialect,
      sqlLength: typeof sql === 'string' ? sql.length : undefined,
    });
    return res.json(parsed);
  } catch (error: any) {
    logger.error('api.explain_sql.failed', serializeError(error));
    return res.status(500).json({ error: error.message || 'Failed to explain SQL' });
  }
});

// Mount Vite or static server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(appRoot, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(appRoot, 'dist', 'index.html'));
    });
  }

  app.use((error: unknown, req: Request, res: Response, next: express.NextFunction) => {
    logger.error('http.request.unhandled_error', {
      method: req.method,
      path: req.path,
      ...serializeError(error),
    });
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  const server = app.listen(port, () => {
    logger.info('server.started', {
      port: Number(port),
      nodeVersion: process.version,
      resultPayloadLogging: isResultPayloadLoggingEnabled(),
    });
  });

  const shutdown = (signal: string) => {
    logger.info('server.shutdown.started', { signal });
    server.close(async (error) => {
      await closeLiveDatabaseConnections();
      if (error) {
        logger.error('server.shutdown.failed', serializeError(error));
        process.exitCode = 1;
      } else {
        logger.info('server.shutdown.completed', { signal });
      }
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (error) => {
  logger.error('process.unhandled_rejection', serializeError(error));
});

process.on('uncaughtException', (error) => {
  logger.error('process.uncaught_exception', serializeError(error));
  process.exit(1);
});

startServer().catch((error) => {
  logger.error('server.startup.failed', serializeError(error));
  process.exitCode = 1;
});
