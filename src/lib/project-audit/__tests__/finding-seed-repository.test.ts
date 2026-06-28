import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getProjectFindingSeed,
  getProjectFindingSeeds,
  mergeProjectFindingSeeds,
} from '@/lib/project-audit/finding-seed-repository';
import type { DiscoveredProjectAuditFindingSeed } from '@/lib/project-audit/discovery/types';
import { PROJECT_AUDIT_FINDING_SEEDS } from '@/lib/project-audit/source-code-findings';

function discoveredSeed(
  id: string,
  status: DiscoveredProjectAuditFindingSeed['discovery']['status'],
): DiscoveredProjectAuditFindingSeed {
  const base = PROJECT_AUDIT_FINDING_SEEDS[0];
  return {
    ...base,
    id,
    title: `${base.title} (${status})`,
    discovery: {
      status,
      detectorId: 'test-detector',
      confidence: 0.9,
      generatedAt: '2026-06-28T00:00:00.000Z',
      reason: 'repository merge test',
    },
  };
}

describe('finding-seed-repository', () => {
  it('keeps candidates out of the runtime seed pool by default', () => {
    const approved = discoveredSeed('approved-seed', 'approved');
    const candidate = discoveredSeed('candidate-seed', 'candidate');
    const rejected = discoveredSeed('rejected-seed', 'rejected');

    const merged = mergeProjectFindingSeeds(
      PROJECT_AUDIT_FINDING_SEEDS,
      [approved, candidate, rejected],
    );
    const ids = new Set(merged.map((seed) => seed.id));

    assert.ok(ids.has('approved-seed'));
    assert.equal(ids.has('candidate-seed'), false);
    assert.equal(ids.has('rejected-seed'), false);
  });

  it('can include candidates explicitly for review flows', () => {
    const candidate = discoveredSeed('candidate-for-review', 'candidate');
    const merged = mergeProjectFindingSeeds(
      PROJECT_AUDIT_FINDING_SEEDS,
      [candidate],
      { includeCandidates: true },
    );

    assert.ok(merged.some((seed) => seed.id === 'candidate-for-review'));
  });

  it('preserves manual seeds when a discovered seed reuses the same id', () => {
    const manual = PROJECT_AUDIT_FINDING_SEEDS[0];
    const duplicate = discoveredSeed(manual.id, 'approved');
    const merged = mergeProjectFindingSeeds([manual], [duplicate]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].title, manual.title);
  });

  it('supports repository lookup with injected discovered seeds', () => {
    const approved = discoveredSeed('approved-lookup-seed', 'approved');

    assert.equal(getProjectFindingSeed('approved-lookup-seed'), null);
    assert.equal(
      getProjectFindingSeed('approved-lookup-seed', { discoveredSeeds: [approved] })?.id,
      'approved-lookup-seed',
    );
    assert.ok(
      getProjectFindingSeeds('YM_PT', { discoveredSeeds: [approved] })
        .some((seed) => seed.id === 'approved-lookup-seed'),
    );
  });
});
