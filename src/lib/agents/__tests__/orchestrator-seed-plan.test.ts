import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveProjectQuizMode } from '@/lib/agents/orchestrator';
import { buildSeedPlan, getDifficultyForIndex } from '@/lib/agents/seed-plan';

describe('buildSeedPlan', () => {
  it('always creates one seed slot per requested question', () => {
    const plan = buildSeedPlan(3, [{ title: 'A', clauseNumber: '6.2.1' }]);
    assert.equal(plan.length, 3);
    assert.equal(plan.every((entry) => entry.count === 1), true);
  });

  it('pads missing coverage targets with undefined target slots', () => {
    const plan = buildSeedPlan(3, []);
    assert.equal(plan.length, 3);
    assert.equal(plan[0].target, undefined);
    assert.equal(plan[1].target, undefined);
    assert.equal(plan[2].target, undefined);
  });

  it('anchors each slot to the coverage target at the same index', () => {
    const targets = [{ title: 'A' }, { title: 'B' }];
    const plan = buildSeedPlan(3, targets);
    assert.equal(plan[0].target, targets[0]);
    assert.equal(plan[1].target, targets[1]);
    assert.equal(plan[2].target, undefined);
  });
});

describe('getDifficultyForIndex', () => {
  it('splits 10 questions into easy / medium / hard buckets', () => {
    const difficulties = Array.from({ length: 10 }, (_, index) => getDifficultyForIndex(index, 10));
    assert.deepEqual(difficulties, [
      'easy', 'easy', 'easy',
      'medium', 'medium', 'medium', 'medium', 'medium',
      'hard', 'hard',
    ]);
  });
});

describe('resolveProjectQuizMode', () => {
  it('keeps standard-only generation inactive when sourceProject is omitted', () => {
    const result = resolveProjectQuizMode({ language: 'java' });
    assert.equal(result.success, true);
    assert.equal(result.isProjectModeActive, false);
    assert.equal(result.sourceProject, undefined);
  });

  it('activates project mode only for an explicit sourceProject', () => {
    const result = resolveProjectQuizMode({ language: 'java', sourceProject: 'all', projectMode: 'source' });
    assert.equal(result.success, true);
    assert.equal(result.isProjectModeActive, true);
    assert.equal(result.sourceProject, 'all');
  });

  it('rejects unknown project ids and non-Java source project requests', () => {
    const unknownProject = resolveProjectQuizMode({ language: 'java', sourceProject: 'bad-project' });
    assert.equal(unknownProject.success, false);
    assert.match(unknownProject.error || '', /sourceProject/);

    const cppProject = resolveProjectQuizMode({ language: 'cpp', sourceProject: 'YM_PT' });
    assert.equal(cppProject.success, false);
    assert.match(cppProject.error || '', /Java/);
  });
});
