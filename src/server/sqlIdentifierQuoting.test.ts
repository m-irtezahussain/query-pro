import assert from 'node:assert/strict';
import test from 'node:test';
import { quotePostgresSchemaIdentifiers } from './sqlIdentifierQuoting';

const schema = [{
  id: 'users',
  name: 'users',
  columns: [
    { name: 'user_id', type: 'uuid' },
    { name: 'is_Verified', type: 'boolean' },
  ],
}];

test('quotes mixed-case schema identifiers in generated PostgreSQL', () => {
  assert.equal(
    quotePostgresSchemaIdentifiers('SELECT is_Verified FROM users', schema),
    'SELECT "is_Verified" FROM users'
  );
});

test('repairs identifiers that PostgreSQL would fold to lowercase', () => {
  assert.equal(
    quotePostgresSchemaIdentifiers('SELECT is_verified FROM users', schema),
    'SELECT "is_Verified" FROM users'
  );
});

test('does not rewrite string literals, comments, or quoted identifiers', () => {
  const sql = `SELECT "is_Verified", 'is_Verified' -- is_Verified\nFROM users`;
  assert.equal(quotePostgresSchemaIdentifiers(sql, schema), sql);
});
