import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
