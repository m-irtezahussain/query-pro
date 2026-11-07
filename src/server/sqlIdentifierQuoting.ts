import type { TableDefinition } from '../types/schema';

function mixedCaseIdentifierMap(schema: TableDefinition[]) {
  const candidates = new Map<string, string | null>();
  const remember = (identifier: string) => {
    if (identifier === identifier.toLowerCase()) return;
    const key = identifier.toLowerCase();
    const existing = candidates.get(key);
    candidates.set(key, existing === undefined || existing === identifier ? identifier : null);
  };

  for (const table of schema) {
    remember(table.name);
    for (const column of table.columns) remember(column.name);
  }

  return new Map(
    [...candidates.entries()].filter((entry): entry is [string, string] => entry[1] !== null)
  );
}

/**
 * PostgreSQL folds every unquoted identifier to lowercase. Quote mixed-case
 * identifiers that came from the inspected schema while leaving literals,
 * comments, and already quoted identifiers untouched.
 */
export function quotePostgresSchemaIdentifiers(sql: string, schema: TableDefinition[]): string {
  const identifiers = mixedCaseIdentifierMap(schema);
  if (identifiers.size === 0) return sql;

  let output = '';
  let index = 0;
  let mode: 'normal' | 'single' | 'double' | 'line-comment' | 'block-comment' = 'normal';

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (mode === 'normal') {
      if (char === "'") mode = 'single';
      else if (char === '"') mode = 'double';
      else if (char === '-' && next === '-') mode = 'line-comment';
      else if (char === '/' && next === '*') mode = 'block-comment';
      else if (/[A-Za-z_]/.test(char)) {
        let end = index + 1;
        while (end < sql.length && /[A-Za-z0-9_$]/.test(sql[end])) end += 1;
        const token = sql.slice(index, end);
        const schemaIdentifier = identifiers.get(token.toLowerCase());
        output += schemaIdentifier
          ? `"${schemaIdentifier.replace(/"/g, '""')}"`
          : token;
        index = end;
        continue;
      }
    } else if (mode === 'single') {
      if (char === "'" && next === "'") {
        output += "''";
        index += 2;
        continue;
      }
      if (char === "'") mode = 'normal';
    } else if (mode === 'double') {
      if (char === '"' && next === '"') {
        output += '""';
        index += 2;
        continue;
      }
      if (char === '"') mode = 'normal';
    } else if (mode === 'line-comment') {
      if (char === '\n') mode = 'normal';
    } else if (mode === 'block-comment' && char === '*' && next === '/') {
      output += '*/';
      index += 2;
      mode = 'normal';
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}
