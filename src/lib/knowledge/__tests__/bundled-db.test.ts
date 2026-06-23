import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

describe('bundled knowledge database', () => {
  it('stores all built-in standards in the main database file without relying on WAL', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'secretest-knowledge-'));
    const dbPath = join(tempDir, 'knowledge.db');

    try {
      copyFileSync(join(process.cwd(), 'data', 'knowledge', 'knowledge.db'), dbPath);

      const db = new Database(dbPath, { readonly: true });
      try {
        const rows = db.prepare('SELECT type FROM documents ORDER BY type').all() as Array<{ type: string }>;
        assert.deepEqual(rows.map((row) => row.type), ['cpp', 'csharp', 'java']);
      } finally {
        db.close();
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
