/**
 * Lightweight Chinese tokenization for FTS5 queries (no external deps).
 *
 * - English/numbers: kept as whole tokens
 * - Chinese text: unigrams + bigrams to improve recall with unicode61 tokenizer
 */

const CJK_RE = /[\u4e00-\u9fff]/;
const CJK_RUN_RE = /[\u4e00-\u9fff]+/g;
const WORD_RE = /[a-zA-Z0-9_]+/g;

function escapeFtsTerm(term: string): string {
  return term.replace(/"/g, '""');
}

function tokenizeCjkRun(run: string): string[] {
  const tokens = new Set<string>();

  for (const char of run) {
    tokens.add(char);
  }

  for (let i = 0; i < run.length - 1; i++) {
    tokens.add(run.slice(i, i + 2));
  }

  if (run.length >= 2) {
    tokens.add(run);
  }

  return Array.from(tokens);
}

/**
 * Tokenize query text into FTS5-safe terms.
 */
export function tokenizeQuery(query: string): string[] {
  const terms = new Set<string>();
  let lastIndex = 0;

  for (const match of query.matchAll(CJK_RUN_RE)) {
    const index = match.index ?? 0;

    const before = query.slice(lastIndex, index);
    for (const word of before.match(WORD_RE) || []) {
      if (word.length >= 2) terms.add(word.toLowerCase());
    }

    for (const token of tokenizeCjkRun(match[0])) {
      terms.add(token);
    }

    lastIndex = index + match[0].length;
  }

  const tail = query.slice(lastIndex);
  for (const word of tail.match(WORD_RE) || []) {
    if (word.length >= 2) terms.add(word.toLowerCase());
  }

  if (terms.size === 0) {
    const fallback = query
      .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    for (const t of fallback) {
      if (CJK_RE.test(t)) {
        for (const cjk of tokenizeCjkRun(t)) terms.add(cjk);
      } else if (t.length >= 2) {
        terms.add(t.toLowerCase());
      }
    }
  }

  return Array.from(terms);
}

/**
 * Build an FTS5 MATCH expression from a query string.
 *
 * Double-quoted multi-word segments (e.g. `"sql injection"`, produced by
 * query expansion) are preserved as FTS5 phrase tokens so they match
 * consecutive terms instead of being split into independent OR clauses.
 */
export function buildFtsQuery(query: string): string | null {
  const phrases: string[] = [];

  // Pull out "quoted phrases" first; only multi-word segments become phrases.
  const remainder = query.replace(/"([^"]+)"/g, (_, inner: string) => {
    const trimmed = inner.trim();
    if (trimmed.includes(' ')) {
      phrases.push(`"${escapeFtsTerm(trimmed)}"`);
      return ' ';
    }
    // Single-word quoted segment: let the normal tokenizer handle it.
    return ` ${trimmed} `;
  });

  const terms = tokenizeQuery(remainder).map((t) => `"${escapeFtsTerm(t)}"`);
  const all = [...phrases, ...terms];
  if (all.length === 0) return null;

  return all.join(' OR ');
}
