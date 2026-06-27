import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function readLauncher(): string {
  return readFileSync(join(process.cwd(), '一键启动.bat'), 'utf8').replace(/\r\n/g, '\n');
}

function readSection(content: string, startLabel: string, endLabel: string): string {
  const start = content.indexOf(`\n${startLabel}\n`);
  const end = content.indexOf(`\n${endLabel}\n`);

  assert.notEqual(start, -1, `${startLabel} not found`);
  assert.notEqual(end, -1, `${endLabel} not found`);
  assert.ok(end > start, `${endLabel} should appear after ${startLabel}`);

  return content.slice(start, end);
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

  it('validates the existing Node.js runtime before accepting it', () => {
    const content = readLauncher();
    const ensureNode = readSection(content, ':ensure_node', ':ensure_vcredist');

    assert.match(content, /set "MIN_NODE_MAJOR=20"/i);
    assert.match(ensureNode, /node -p "process\.versions\.node\.split\('\.'\)\[0\]"/i);
    assert.match(ensureNode, /if !NODE_MAJOR! lss !MIN_NODE_MAJOR!/i);
    assert.match(ensureNode, /where npm >nul 2>&1/i);
  });

  it('does not accept a winget Node.js install only because node is on PATH', () => {
    const content = readLauncher();
    const ensureNode = readSection(content, ':ensure_node', ':ensure_vcredist');

    assert.doesNotMatch(ensureNode, /where node >nul 2>&1\s+if not errorlevel 1 goto :node_ready/i);
    assert.match(ensureNode, /winget installation did not produce a usable Node\.js/i);
  });

  it('makes pnpm checks visible and bounds the pnpm version probe', () => {
    const content = readLauncher();
    const ensurePnpm = readSection(content, ':ensure_pnpm', ':ensure_env');

    const stageIndex = ensurePnpm.indexOf('echo [INFO] Checking pnpm package manager...');
    const firstProbeIndex = ensurePnpm.indexOf('where pnpm >nul 2>&1');

    assert.ok(stageIndex >= 0, 'pnpm stage message should be present');
    assert.ok(firstProbeIndex > stageIndex, 'pnpm stage message should appear before silent probes');
    assert.match(ensurePnpm, /:verify_pnpm_runtime/);
    assert.match(ensurePnpm, /spawnSync\(cmd,\['-v'\].*timeout:15000/);
    // Node 18.20+/20.12+/22+ (CVE-2024-27980) blocks spawning .cmd without a
    // shell, so the probe must use shell:true or every pnpm check fails with
    // EINVAL even when pnpm is installed and working.
    assert.match(ensurePnpm, /spawnSync\(cmd,\['-v'\].*shell:true/);
    assert.doesNotMatch(ensurePnpm, /\('pnpm -v 2\^>nul'\)/);
  });
});
