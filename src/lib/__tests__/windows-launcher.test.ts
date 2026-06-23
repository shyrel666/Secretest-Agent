import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function readLauncher(): string {
  return readFileSync(join(process.cwd(), '一键启动.bat'), 'utf8');
}

describe('Windows one-click launcher', () => {
  it('uses ASCII-only console text to avoid cmd encoding garble', () => {
    const content = readLauncher();
    const nonAscii = [...content].filter((char) => char.charCodeAt(0) > 0x7f);

    assert.deepEqual(nonAscii, []);
  });

  it('bootstraps pnpm through Corepack before falling back to npm global install', () => {
    const content = readLauncher();

    assert.match(content, /corepack prepare pnpm@9\.0\.0 --activate/i);
    assert.match(content, /npm install -g pnpm@9/i);
    assert.match(content, /npm config get prefix/i);
  });
});
