export type SqlDialect = 'PostgreSQL' | 'MySQL' | 'SQLite' | 'SQL Server' | 'BigQuery';

export interface ColumnDefinition {
  name: string;
  type: string;
  isPrimary?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
  references?: {
    table: string;
    column: string;
  };
}

export interface TableDefinition {
  id: string;
  name: string;
  description?: string;
  columns: ColumnDefinition[];
  sampleData?: Record<string, any>[];
}

export interface GeneratedQuery {
  id: string;
  prompt: string;
  sql: string;
  explanation: string;
  dialect: SqlDialect;
  tablesUsed: string[];
  columnsUsed?: string[];
  assumptions?: string[];
  caveats?: string;
  suggestedIndexes?: string[];
  followUpQuestions?: string[];
  createdAt: number;
  isFavorite?: boolean;
  executionResult?: QueryExecutionResult;
}

export interface QueryExecutionResult {
  success: boolean;
  columns?: string[];
  rows?: Record<string, any>[];
  rowCount?: number;
  executionTimeMs?: number;
  error?: string;
  truncated?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  dialect: SqlDialect;
  createdAt: number;
  updatedAt: number;
  tables: TableDefinition[];
  savedQueries: GeneratedQuery[];
  history: GeneratedQuery[];
  contextNotes?: string;
  liveConnection?: {
    id: string;
    engine: 'PostgreSQL' | 'MySQL';
    expiresAt: number;
  };
}
