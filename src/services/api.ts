import { Project, SqlDialect, TableDefinition } from '../types/schema';

export interface GenerateSqlResponse {
  sql: string;
  explanation: string;
  dialect: string;
  tablesUsed: string[];
  columnsUsed?: string[];
  assumptions?: string[];
  caveats?: string;
  suggestedIndexes?: string[];
  followUpQuestions?: string[];
}

export interface GenerateSchemaResponse {
  projectName?: string;
  projectDescription?: string;
  tables: TableDefinition[];
}

export interface ExplainSqlResponse {
  summary: string;
  stepByStep: string[];
  optimizedSql?: string;
  optimizationNotes?: string;
  complexityRating?: string;
}

export interface DatabaseConnectionRequest {
  engine: 'PostgreSQL' | 'MySQL';
  host: string;
  port?: number;
  database: string;
  schema?: string;
  user: string;
  password: string;
  tlsMode: 'require' | 'verify-full' | 'disable';
}

export async function requestSqlGeneration(
  prompt: string,
  schema: TableDefinition[],
  dialect: SqlDialect = 'PostgreSQL',
  context?: string
): Promise<GenerateSqlResponse> {
  const response = await fetch('/api/generate-sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, schema, dialect, context }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate SQL query');
  }
  return data;
}

export async function requestSchemaGeneration(
  prompt: string,
  dialect: SqlDialect = 'PostgreSQL',
  existingSchema?: TableDefinition[]
): Promise<GenerateSchemaResponse> {
  const response = await fetch('/api/generate-schema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, dialect, existingSchema }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate schema');
  }
  return data;
}

export async function requestDdlParse(
  ddl: string,
  dialect: SqlDialect = 'PostgreSQL'
): Promise<{ tables: TableDefinition[] }> {
  const response = await fetch('/api/parse-ddl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ddl, dialect }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to parse DDL');
  }
  return data;
}

export async function requestDatabaseIntrospection(
  connection: DatabaseConnectionRequest
): Promise<{
  tables: TableDefinition[];
  connectionId: string;
  connectionExpiresAt: number;
}> {
  const response = await fetch('/api/introspect-database', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to inspect database schema');
  }
  return data;
}

export async function requestLiveQueryExecution(
  connectionId: string,
  sql: string
): Promise<import('../types/schema').QueryExecutionResult> {
  const response = await fetch('/api/execute-read-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, sql }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Live query execution failed');
  return data;
}

export async function requestSqlExplanation(
  sql: string,
  schema: TableDefinition[],
  dialect: SqlDialect = 'PostgreSQL'
): Promise<ExplainSqlResponse> {
  const response = await fetch('/api/explain-sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, schema, dialect }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to explain SQL');
  }
  return data;
}
