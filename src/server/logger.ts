import { AsyncLocalStorage } from 'node:async_hooks';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (['debug', 'info', 'warn', 'error'].includes(
  process.env.LOG_LEVEL || ''
)
  ? process.env.LOG_LEVEL
  : 'info') as LogLevel;

const logResultPayloads = process.env.LOG_RESULT_PAYLOADS === 'true';
const requestContext = new AsyncLocalStorage<{ requestId: string }>();
const sensitiveKeyPattern =
  /password|passwd|pwd|secret|token|authorization|cookie|api[_-]?key|credential|connection.?id/i;

function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 8) return '[MAX_DEPTH]';
  if (typeof value === 'string') {
    return value.length > 8_000 ? `${value.slice(0, 8_000)}...[TRUNCATED]` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => sanitize(item, depth + 1, seen));
    if (value.length > 100) items.push(`[${value.length - 100} MORE ITEMS]`);
    return items;
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sensitiveKeyPattern.test(key) ? '[REDACTED]' : sanitize(item, depth + 1, seen);
  }
  return output;
}

export function serializeError(error: unknown): LogFields {
  if (!(error instanceof Error)) return { error: sanitize(error) };
  const errorWithCode = error as Error & { code?: unknown; cause?: unknown };
  return {
    error: {
      name: error.name,
      message: error.message,
      code: errorWithCode.code,
      stack: error.stack,
      cause: errorWithCode.cause ? sanitize(errorWithCode.cause) : undefined,
    },
  };
}

function resultSummary(result: unknown): LogFields {
  if (Array.isArray(result)) return { resultType: 'array', resultCount: result.length };
  if (!result || typeof result !== 'object') return { resultType: typeof result };

  const object = result as Record<string, any>;
  const tables = Array.isArray(object.tables) ? object.tables : undefined;
  return {
    resultType: 'object',
    resultKeys: Object.keys(object),
    ...(tables
      ? {
          tableCount: tables.length,
          tables: tables.map((table: any) => ({
            name: table?.name,
            columnCount: Array.isArray(table?.columns) ? table.columns.length : 0,
            sampleRowCount: Array.isArray(table?.sampleData) ? table.sampleData.length : 0,
          })),
        }
      : {}),
    ...(typeof object.sql === 'string'
      ? { sqlLength: object.sql.length, tablesUsed: object.tablesUsed }
      : {}),
  };
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  if (levelPriority[level] < levelPriority[configuredLevel]) return;
  const entry = sanitize({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'querycraft-api',
    environment: process.env.NODE_ENV || 'development',
    requestId: requestContext.getStore()?.requestId,
    ...fields,
  });
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => write('debug', event, fields),
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields),
  result: (event: string, result: unknown, fields: LogFields = {}) =>
    write('info', event, {
      ...fields,
      ...resultSummary(result),
      ...(logResultPayloads ? { result } : {}),
    }),
};

export function withRequestContext<T>(requestId: string, callback: () => T): T {
  return requestContext.run({ requestId }, callback);
}

export function isResultPayloadLoggingEnabled() {
  return logResultPayloads;
}
