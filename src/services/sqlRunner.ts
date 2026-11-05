import alasql from 'alasql';
import { QueryExecutionResult, TableDefinition } from '../types/schema';

// Initialize alasql environment with seed data from the active project schema
export function executeProjectSql(
  sql: string,
  tables: TableDefinition[]
): QueryExecutionResult {
  const startTime = performance.now();

  try {
    // Reset alasql state or use custom database
    const dbName = `db_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    alasql(`CREATE DATABASE ${dbName}; USE ${dbName};`);

    // Create tables and insert mock seed data
    for (const table of tables) {
      const colDefs = table.columns.map((c) => {
        // Map types to alasql friendly types
        let colType = 'STRING';
        const upperType = c.type.toUpperCase();
        if (upperType.includes('INT') || upperType.includes('SERIAL')) colType = 'INT';
        else if (upperType.includes('NUMERIC') || upperType.includes('FLOAT') || upperType.includes('DECIMAL')) colType = 'NUMBER';
        else if (upperType.includes('BOOL')) colType = 'BOOLEAN';
        else if (upperType.includes('DATE') || upperType.includes('TIME')) colType = 'DATE';
        return `\`${c.name}\` ${colType}`;
      });

      alasql(`CREATE TABLE \`${table.name}\` (${colDefs.join(', ')});`);

      if (table.sampleData && table.sampleData.length > 0) {
        for (const row of table.sampleData) {
          alasql(`INSERT INTO \`${table.name}\` VALUES ?`, [row]);
        }
      }
    }

    // Dialect compatibility pre-processing for alasql runner:
    let executableSql = sql.trim();

    // Remove trailing semicolons if alasql expects single statement or clean
    executableSql = executableSql.replace(/;+\s*$/, '');

    // Replace ILIKE with LIKE for PostgreSQL queries in alasql
    executableSql = executableSql.replace(/\bILIKE\b/gi, 'LIKE');

    // Remove INTERVAL expressions if simple or approximate
    executableSql = executableSql.replace(/NOW\(\)\s*-\s*INTERVAL\s*'[0-9]+\s*days?'/gi, "DATE('now')");

    const rawResult = alasql(executableSql);

    const endTime = performance.now();
    const executionTimeMs = Math.round((endTime - startTime) * 100) / 100;

    let rows: Record<string, any>[] = [];
    if (Array.isArray(rawResult)) {
      if (rawResult.length > 0 && typeof rawResult[0] === 'object' && rawResult[0] !== null) {
        rows = rawResult;
      } else if (rawResult.length > 0 && Array.isArray(rawResult[0])) {
        // Nested array query result
        rows = rawResult[0];
      } else {
        rows = rawResult.map((val, idx) => ({ result: val, index: idx + 1 }));
      }
    } else if (typeof rawResult === 'object' && rawResult !== null) {
      rows = [rawResult];
    } else if (rawResult !== undefined) {
      rows = [{ result: rawResult }];
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Cleanup db
    try {
      alasql(`DROP DATABASE ${dbName};`);
    } catch {
      // ignore
    }

    return {
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: Math.max(executionTimeMs, 0.4),
    };
  } catch (err: any) {
    const endTime = performance.now();
    return {
      success: false,
      error: err.message || 'Execution failed on in-memory database engine.',
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
    };
  }
}
