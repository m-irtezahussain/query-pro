import { TableDefinition } from '../types/schema';

const DEFAULT_MAX_TABLES = 25;
const DEFAULT_MAX_COLUMNS_PER_TABLE = 40;
const stopWords = new Set([
  'a', 'all', 'an', 'and', 'are', 'by', 'for', 'from', 'get', 'give', 'in', 'is', 'list',
  'me', 'of', 'on', 'or', 'show', 'the', 'to', 'with', 'where', 'which', 'who',
]);

function boundedEnvNumber(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !stopWords.has(word));
}

function identifierMatches(identifier: string, terms: string[]) {
  const normalized = identifier.toLowerCase();
  const parts = normalized.split(/[^a-z0-9]+|_/).filter(Boolean);
  return terms.reduce((score, term) => {
    if (normalized === term) return score + 12;
    if (parts.includes(term)) return score + 8;
    if (normalized.includes(term) || term.includes(normalized)) return score + 3;
    return score;
  }, 0);
}

function tableScore(table: TableDefinition, terms: string[]) {
  let score = identifierMatches(table.name, terms) * 3;
  for (const column of table.columns) {
    score += identifierMatches(column.name, terms);
    if (column.references) score += identifierMatches(column.references.table, terms);
  }
  return score;
}

function selectTables(prompt: string, tables: TableDefinition[], maxTables: number) {
  if (tables.length <= maxTables) return tables;

  const terms = words(prompt);
  const ranked = tables
    .map((table, index) => ({ table, index, score: tableScore(table, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const positiveMatches = ranked.filter(({ score }) => score > 0);
  const initial = (positiveMatches.length > 0 ? positiveMatches : ranked)
    .slice(0, Math.max(1, Math.min(maxTables, 15)))
    .map(({ table }) => table);

  const selected = new Map(initial.map((table) => [table.name, table]));
  for (const table of initial) {
    for (const column of table.columns) {
      const referenced = column.references
        ? tables.find((candidate) => candidate.name === column.references?.table)
        : undefined;
      if (referenced && selected.size < maxTables) selected.set(referenced.name, referenced);
    }
    for (const candidate of tables) {
      if (
        selected.size < maxTables &&
        candidate.columns.some((column) => column.references?.table === table.name)
      ) {
        selected.set(candidate.name, candidate);
      }
    }
  }

  for (const { table } of ranked) {
    if (selected.size >= maxTables) break;
    selected.set(table.name, table);
  }
  return [...selected.values()];
}

export function compactSchemaForPrompt(prompt: string, schema: TableDefinition[]) {
  const maxTables = boundedEnvNumber('AI_SCHEMA_MAX_TABLES', DEFAULT_MAX_TABLES, 1, 100);
  const maxColumns = boundedEnvNumber(
    'AI_SCHEMA_MAX_COLUMNS_PER_TABLE',
    DEFAULT_MAX_COLUMNS_PER_TABLE,
    5,
    200
  );
  const selectedTables = selectTables(prompt, schema, maxTables);
  const terms = words(prompt);

  const compactSchema = selectedTables.map((table) => {
    const rankedColumns = table.columns
      .map((column, index) => ({
        column,
        index,
        score:
          identifierMatches(column.name, terms) +
          (column.isPrimary ? 20 : 0) +
          (column.references ? 15 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxColumns)
      .sort((a, b) => a.index - b.index);

    return {
      name: table.name,
      columns: rankedColumns.map(({ column }) => ({
        name: column.name,
        type: column.type,
        ...(column.isPrimary ? { primaryKey: true } : {}),
        ...(column.isNullable === false ? { nullable: false } : {}),
        ...(column.isUnique ? { unique: true } : {}),
        ...(column.references
          ? { references: `${column.references.table}.${column.references.column}` }
          : {}),
      })),
    };
  });

  return {
    schema: compactSchema,
    stats: {
      originalTableCount: schema.length,
      selectedTableCount: compactSchema.length,
      originalColumnCount: schema.reduce((count, table) => count + table.columns.length, 0),
      selectedColumnCount: compactSchema.reduce(
        (count, table) => count + table.columns.length,
        0
      ),
      selectedTables: compactSchema.map((table) => table.name),
    },
  };
}
