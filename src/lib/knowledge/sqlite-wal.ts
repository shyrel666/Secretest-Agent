import type Database from 'better-sqlite3';

/**
 * Flush WAL pages into the main SQLite file so bundled database snapshots do
 * not depend on ignored `*.db-wal` sidecar files.
 */
export function checkpointWal(db: Database.Database): boolean {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    return true;
  } catch (error) {
    console.warn('SQLite WAL checkpoint failed:', error);
    return false;
  }
}
