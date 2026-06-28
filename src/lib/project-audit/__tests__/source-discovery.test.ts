import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  discoverProjectFindingCandidates,
  listRuleDetectorIds,
} from '@/lib/project-audit/discovery/rule-detectors';
import { readProjectSourceSnippet } from '@/lib/project-audit/source-reader';

describe('source discovery', () => {
  it('discovers source-grounded finding candidates for a registered project', () => {
    const candidates = discoverProjectFindingCandidates('itstec-24', { limit: 80 });

    assert.ok(candidates.length > 0, '真实项目源码应至少发现一些候选漏洞点');
    assert.equal(candidates.length, new Set(candidates.map((candidate) => candidate.id)).size);

    const detectorIds = new Set(listRuleDetectorIds());
    for (const candidate of candidates) {
      assert.equal(candidate.discovery.status, 'candidate');
      assert.ok(detectorIds.has(candidate.discovery.detectorId));
      assert.equal(candidate.projectId, 'itstec-24');
      assert.ok(candidate.sourceRefs.length > 0);
      assert.ok(candidate.evidenceFlow.length > 0);
    }
  });

  it('emits readable source references for discovered candidates', () => {
    const candidates = discoverProjectFindingCandidates('YM_PT', { limit: 30 });
    assert.ok(candidates.length > 0, 'YM_PT 源码应能发现候选点');

    for (const candidate of candidates) {
      for (const ref of candidate.sourceRefs) {
        const snippet = readProjectSourceSnippet(ref);
        assert.ok(snippet.code.length > 0, `${candidate.id} 应指向可读源码片段`);
        assert.equal(snippet.relativePath, ref.path);
      }
    }
  });
});
