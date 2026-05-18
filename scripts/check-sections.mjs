import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const db = new Database('./data/knowledge/knowledge.db');
sqliteVec.load(db);

// Get all unique 6.2.x.y clause numbers and their first content chunk
const allClauses = db.prepare(`
  SELECT c.clause_number, substr(c.content, 1, 120) as preview
  FROM chunks c
  JOIN documents d ON c.doc_id = d.id
  WHERE d.type = 'cpp'
    AND c.clause_number LIKE '6.2.%'
  GROUP BY c.clause_number
  ORDER BY c.sort_order
`).all();

console.log('All 6.2.x clauses:');
for (const c of allClauses) {
  console.log(`\n[${c.clause_number}] ${c.preview}`);
}

db.close();
