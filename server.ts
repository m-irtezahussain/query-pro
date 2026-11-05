import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import {
  databaseConnectionSchema,
  introspectDatabase,
} from './src/server/databaseIntrospection';

dotenv.config();

const appRoot = process.cwd();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Container and load-balancer health check. This deliberately does not call
// Workers AI, so the service can be healthy before an AI request is made.
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/introspect-database', async (req: Request, res: Response) => {
  const parsed = databaseConnectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'Invalid database connection details.',
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  try {
    return res.json(await introspectDatabase(parsed.data));
  } catch (error: any) {
    console.error('Database introspection failed:', error?.message || 'unknown error');
    return res.status(502).json({
      error:
        error?.message ===
        'Private or local database hosts must be listed in DB_CONNECTION_ALLOWED_HOSTS.'
          ? error.message
          : 'Unable to connect to or inspect the database. Verify the host, credentials, TLS setting, database, and schema.',
    });
  }
});

type JsonSchema = Record<string, unknown>;

const DEFAULT_CLOUDFLARE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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
  systemInstruction: string,
  userContent: string,
  responseSchema: JsonSchema
): Promise<Record<string, any>> {
  const { apiToken, model, url } = getCloudflareConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
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

  const payload = (await response.json()) as any;
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.error?.message ||
      payload?.error ||
      `Cloudflare Workers AI request failed with status ${response.status}.`;
    throw new Error(String(message));
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'object' && content !== null) return content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Cloudflare Workers AI returned an empty response.');
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Cloudflare Workers AI returned invalid JSON.');
  }
};

// Natural language to SQL query generation
app.post('/api/generate-sql', async (req: Request, res: Response) => {
  try {
    const { prompt, schema, dialect = 'PostgreSQL', context } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'A prompt in English is required.' });
    }

    const systemInstruction = `You are an expert Principal Database Engineer, SQL Architect, and query optimization specialist.
Your mission is to take a natural language request in plain English, and generate accurate, high-performance, and idiomatic SQL queries based strictly on the provided database schema.

Target SQL Dialect: ${dialect}.
Rules:
1. Ground your query strictly in the provided schema (table names, column names, relationships).
2. Adhere strictly to the requested dialect's syntax (${dialect}):
   - PostgreSQL: double quotes for case-sensitive identifiers if needed, ILIKE for case-insensitive, LIMIT/OFFSET, proper DATE/TIMESTAMP casting (e.g. NOW() - INTERVAL '30 days').
   - MySQL: backticks, LIKE, DATE_SUB(NOW(), INTERVAL 30 DAY), LIMIT.
   - SQLite: strftime for dates, simple types, double quotes or backticks, standard joins.
   - SQL Server: TOP N, DATEADD, DATEDIFF, square brackets [col].
3. Produce clean, well-formatted, indented SQL.
4. Explain clearly what the query does, which tables are joined, conditions, and aggregations.
5. Highlight any assumptions made and provide helpful caveats (e.g. NULL handling, LEFT vs INNER JOIN implications).
6. Suggest 2-3 natural follow-up questions the user might ask next.`;

    const contents = `User Request in English: "${prompt}"

Current Database Schema:
${JSON.stringify(schema, null, 2)}

${context ? `Additional Project Context / Instructions: ${context}` : ''}

Generate the SQL query and details. Return strictly a JSON object following the required schema.`;

    const parsed = await requestCloudflareJson(systemInstruction, contents, {
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
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error generating SQL:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate SQL query',
      details: error.toString(),
    });
  }
});

// AI Schema Assistant: Generate or refine schema from English description
app.post('/api/generate-schema', async (req: Request, res: Response) => {
  try {
    const { prompt, dialect = 'PostgreSQL', existingSchema } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const systemInstruction = `You are a database design architect.
Generate a comprehensive, normalized relational database schema (tables, columns, primary keys, foreign keys, data types) and 3 to 5 realistic mock seed rows for each table based on the user's description.
Target SQL Dialect: ${dialect}.`;

    const contents = `User description: "${prompt}"
${existingSchema ? `Existing schema to expand or modify:\n${JSON.stringify(existingSchema, null, 2)}` : ''}

Generate structured tables with columns, types, constraints, and realistic mock seed data rows for testing.`;

    const parsed = await requestCloudflareJson(
      systemInstruction,
      contents,
      schemaResponseSchema
    );
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error generating schema:', error);
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
      return res.status(400).json({ error: 'DDL is required.' });
    }
    if (ddl.length > 1024 * 1024) {
      return res.status(413).json({ error: 'DDL must not exceed 1 MB.' });
    }

    const parsed = await requestCloudflareJson(
      'You are an expert SQL parser. Extract tables, columns, data types, primary keys, foreign keys, and synthesize 3 realistic sample data rows for each table.',
      `Parse this SQL DDL into a structured schema with tables, columns, primary keys, and foreign keys.\nDialect: ${dialect}\n\nDDL:\n${ddl}`,
      {
        type: 'object',
        properties: { tables: { type: 'array', items: tableSchema } },
        required: ['tables'],
      }
    );
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error parsing DDL:', error);
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
      return res.status(400).json({ error: 'SQL is required.' });
    }

    const parsed = await requestCloudflareJson(
      `You are an expert SQL Database Administrator for ${dialect}. Explain the query in plain English and suggest optimizations.`,
      `Explain this SQL query in plain English and provide performance optimization tips:\n\nSQL:\n${sql}\n\nSchema:\n${JSON.stringify(schema, null, 2)}`,
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
    return res.json(parsed);
  } catch (error: any) {
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

  app.listen(port, () => {
    console.log(`QueryCraft server running on port ${port}`);
  });
}

startServer();
