export function sanitizeQuestionCode(code: string): string {
  let result = '';
  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;
  let verbatimString = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (quote) {
      result += ch;

      if (verbatimString && quote === '"') {
        if (ch === '"' && next === '"') {
          result += next;
          i++;
          continue;
        }
        if (ch === '"') {
          quote = null;
          verbatimString = false;
        }
        continue;
      }

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === quote) {
        quote = null;
      }

      continue;
    }

    if (ch === '@' && next === '"') {
      result += ch;
      i++;
      result += next;
      quote = '"';
      verbatimString = true;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      result += ch;
      quote = ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      if (i < code.length) {
        result = result.trimEnd();
        result += '\n';
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      if (i < code.length) {
        i++;
      }
      continue;
    }

    result += ch;
  }

  return result
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}
