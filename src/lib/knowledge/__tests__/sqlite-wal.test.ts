import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { checkpointWal } from '../sqlite-wal';

describe('checkpointWal', () => {
  it('flushes WAL content back into the main sqlite database file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'secretest-wal-'));
    const dbPath = join(tempDir, 'knowledge.db');
    const walPath = `${dbPath}-wal`;
    const db = new Database(dbPath);

    try {
      db.pragma('journal_mode = WAL');
      db.exec('CREATE TABLE documents (id TEXT PRIMARY KEY)');
      db.prepare('INSERT INTO documents (id) VALUES (?)').run('doc_cpp');

      assert.ok(existsSync(walPath));
      assert.ok(statSync(walPath).size > 0);

      assert.equal(checkpointWal(db), true);

      const walSize = existsSync(walPath) ? statSync(walPath).size : 0;
      assert.equal(walSize, 0);
    } finally {
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
