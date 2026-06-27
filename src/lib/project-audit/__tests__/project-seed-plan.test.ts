import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildProjectSeedPlan } from '@/lib/project-audit/project-seed-plan';
import { PROJECT_AUDIT_FINDING_SEEDS } from '@/lib/project-audit/source-code-findings';

describe('buildProjectSeedPlan', () => {
  it('returns empty plan when total is 0', () => {
    assert.equal(buildProjectSeedPlan({ total: 0 }).length, 0);
  });

  it('returns a plan with the requested total when sourceProject is all', () => {
    const plan = buildProjectSeedPlan({ total: 5, sourceProject: 'all' });
    assert.equal(plan.length, 5);
    for (const entry of plan) {
      assert.ok(entry.seed);
      assert.ok(entry.taskType);
      assert.ok(['easy', 'medium', 'hard'].includes(entry.difficulty));
    }
  });

  it('returns only YM_PT seeds when sourceProject is YM_PT', () => {
    const plan = buildProjectSeedPlan({ total: 5, sourceProject: 'YM_PT' });
    assert.equal(plan.length, 5);
    for (const entry of plan) {
      assert.equal(entry.seed.projectId, 'YM_PT');
    }
  });

  it('returns only itstec-24 seeds when sourceProject is itstec-24', () => {
    const plan = buildProjectSeedPlan({ total: 5, sourceProject: 'itstec-24' });
    assert.equal(plan.length, 5);
    for (const entry of plan) {
      assert.equal(entry.seed.projectId, 'itstec-24');
    }
  });

  it('falls back to full pool when all seeds are covered (regression: BUG-04)', () => {
    const ymptSeeds = PROJECT_AUDIT_FINDING_SEEDS.filter((s) => s.projectId === 'YM_PT');
    const allYmptIds = ymptSeeds.map((s) => s.id);
    const plan = buildProjectSeedPlan({
      total: 3,
      sourceProject: 'YM_PT',
      coveredSeedIds: allYmptIds,
    });
    assert.equal(plan.length, 3, '当用户答完所有 YM_PT 题时，必须能继续出题（fallback 到全量）');
    for (const entry of plan) {
      assert.equal(entry.seed.projectId, 'YM_PT');
    }
  });

  it('does not return the same seed id more than once', () => {
    const plan = buildProjectSeedPlan({ total: 8, sourceProject: 'all' });
    const ids = plan.map((entry) => entry.seed.id);
    assert.equal(ids.length, new Set(ids).size, '不应在同一计划内重复使用同一个 seed');
  });

  it('distributes difficulty roughly across easy/medium/hard buckets', () => {
    const plan = buildProjectSeedPlan({ total: 10, sourceProject: 'all' });
    const buckets = { easy: 0, medium: 0, hard: 0 };
    for (const entry of plan) {
      buckets[entry.difficulty] += 1;
    }
    // 30% / 50% / 20% 分布
    assert.equal(buckets.easy, 3);
    assert.equal(buckets.medium, 5);
    assert.equal(buckets.hard, 2);
  });

  it('covers both projects when sourceProject is all and total >= 5', () => {
    const plan = buildProjectSeedPlan({ total: 6, sourceProject: 'all' });
    const projectIds = new Set(plan.map((entry) => entry.seed.projectId));
    assert.equal(projectIds.size, 2, '混合项目模式且 total >= 5 时必须覆盖两个项目');
  });

  it('always covers both projects for repeated all-project plans with total >= 5', () => {
    for (let index = 0; index < 200; index++) {
      const plan = buildProjectSeedPlan({ total: 6, sourceProject: 'all' });
      const projectIds = new Set(plan.map((entry) => entry.seed.projectId));
      assert.equal(projectIds.size, 2, `run ${index} should cover both projects`);
    }
  });
});
