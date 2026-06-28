import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeDiscoveredSeedCandidates,
  updateDiscoveredSeedStatus,
} from '@/lib/project-audit/discovery/seed-store';
import {
  buildDiscoveredSeedFingerprint,
} from '@/lib/project-audit/discovery/seed-identity';
import type { DiscoveredProjectAuditFindingSeed } from '@/lib/project-audit/discovery/types';
import { PROJECT_AUDIT_FINDING_SEEDS } from '@/lib/project-audit/source-code-findings';

function seedFixture(
  id: string,
  status: DiscoveredProjectAuditFindingSeed['discovery']['status'],
  overrides: Partial<DiscoveredProjectAuditFindingSeed> = {},
): DiscoveredProjectAuditFindingSeed {
  const base = PROJECT_AUDIT_FINDING_SEEDS[0];
  return {
    ...base,
    id,
    title: overrides.title || `${base.title} ${status}`,
    discovery: {
      status,
      detectorId: 'test-detector',
      confidence: 0.8,
      generatedAt: '2026-06-28T00:00:00.000Z',
      reason: `seed-store test ${id}`,
      fingerprint: `${id}-fingerprint`,
    },
    ...overrides,
  };
}

describe('discovered seed store helpers', () => {
  it('preserves approval status when a later scan finds the same candidate', () => {
    const approved = seedFixture('same-seed', 'approved', { title: 'old approved title' });
    const rescanned = seedFixture('same-seed', 'candidate', { title: 'fresh scan title' });

    const merged = mergeDiscoveredSeedCandidates([approved], [rescanned]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].title, 'fresh scan title');
    assert.equal(merged[0].discovery.status, 'approved');
  });

  it('matches rescanned candidates by fingerprint when their ids differ after line drift', () => {
    const fingerprint = buildDiscoveredSeedFingerprint({
      projectId: 'YM_PT',
      detectorId: 'line-drift-detector',
      path: 'src/org/itstec/report/controller/ReportController.java',
      symbol: 'ReportController.arch',
      vulnerabilityType: '命令注入',
      standardReference: 'GB/T 34944-2017 6.2.3.3',
      evidenceSummary: 'Runtime.exec uses externally influenced command content',
    });
    const approved = seedFixture('old-line-based-id', 'approved', {
      discovery: {
        status: 'approved',
        detectorId: 'line-drift-detector',
        confidence: 0.8,
        generatedAt: '2026-06-28T00:00:00.000Z',
        reason: 'old scan',
        fingerprint,
      },
    });
    const rescanned = seedFixture('new-stable-id', 'candidate', {
      title: 'fresh line range',
      discovery: {
        status: 'candidate',
        detectorId: 'line-drift-detector',
        confidence: 0.9,
        generatedAt: '2026-06-29T00:00:00.000Z',
        reason: 'new scan',
        fingerprint,
      },
    });

    const merged = mergeDiscoveredSeedCandidates([approved], [rescanned]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'old-line-based-id');
    assert.equal(merged[0].title, 'fresh line range');
    assert.equal(merged[0].discovery.status, 'approved');
  });

  it('appends newly scanned candidates without dropping existing rejected seeds', () => {
    const rejected = seedFixture('rejected-seed', 'rejected');
    const candidate = seedFixture('new-candidate', 'candidate');

    const merged = mergeDiscoveredSeedCandidates([rejected], [candidate]);
    const ids = new Set(merged.map((seed) => seed.id));

    assert.ok(ids.has('rejected-seed'));
    assert.ok(ids.has('new-candidate'));
  });

  it('updates one seed status and reports missing ids', () => {
    const seed = seedFixture('candidate-seed', 'candidate');

    const updated = updateDiscoveredSeedStatus([seed], 'candidate-seed', 'approved');
    assert.equal(updated.updated?.discovery.status, 'approved');
    assert.equal(updated.seeds[0].discovery.status, 'approved');

    const missing = updateDiscoveredSeedStatus(updated.seeds, 'missing-seed', 'rejected');
    assert.equal(missing.updated, null);
    assert.equal(missing.seeds[0].discovery.status, 'approved');
  });
});
