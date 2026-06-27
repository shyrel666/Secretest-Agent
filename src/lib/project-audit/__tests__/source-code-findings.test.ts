import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getProjectFindingSeed,
  getProjectFindingSeeds,
  getProjectSeedsByClause,
  getProjectSeedsByVulnerability,
  listProjectAuditFindingSeedIds,
  PROJECT_AUDIT_FINDING_SEEDS,
} from '@/lib/project-audit/source-code-findings';
import { parseQuestionOutput } from '@/lib/agents/output-schemas';
import { PROJECT_AUDIT_TASK_TYPES, PROJECT_IDS } from '@/lib/project-audit/types';

describe('source-code-findings', () => {
  it('contains seeds for both registered projects', () => {
    assert.ok(PROJECT_AUDIT_FINDING_SEEDS.length > 0);
    for (const projectId of PROJECT_IDS) {
      const projectSeeds = getProjectFindingSeeds(projectId);
      assert.ok(projectSeeds.length > 0, `expected seeds for ${projectId}`);
    }
  });

  it('has unique seed ids across all projects', () => {
    const ids = listProjectAuditFindingSeedIds();
    assert.equal(ids.length, new Set(ids).size, 'seed ids must be unique');
  });

  it('every seed has at least one source ref with a non-empty role', () => {
    for (const seed of PROJECT_AUDIT_FINDING_SEEDS) {
      assert.ok(seed.sourceRefs.length > 0, `seed ${seed.id} must have at least one sourceRef`);
      for (const ref of seed.sourceRefs) {
        assert.ok(ref.role && ref.role.length > 0, `seed ${seed.id} sourceRef must have a role`);
      }
    }
  });

  it('multi-call seeds cover at least 2 distinct roles in sourceRefs', () => {
    // 单角色 seed（如工具类：DESUtil/AESUtil/SecUtil/SignUtils/AesUtil；控制器层缺陷如缺 checkLogin、注解关闭签名）
    // 允许 sourceRefs 集中在一个 role；其余种子必须覆盖 ≥2 个不同 role，避免出题时缺少可观察证据链
    const ALLOWED_SINGLE_ROLE_SEEDS = new Set([
      'ympt-des-hardcoded-key',
      'ympt-aes-fixed-gcm-iv',
      'ympt-secutil-weak-random',
      'itstec24-aes-ecb-mode',
      'itstec24-md5-signature',
      'itstec24-filter-hardcoded-key',
      'ympt-config-db-password',
      'itstec24-config-db-password',
      'ympt-missing-login-query-user-list',
      'itstec24-payment-sign-bypass',
    ]);
    for (const seed of PROJECT_AUDIT_FINDING_SEEDS) {
      if (ALLOWED_SINGLE_ROLE_SEEDS.has(seed.id)) {
        continue;
      }
      const roles = new Set(seed.sourceRefs.map((ref) => ref.role));
      assert.ok(
        roles.size >= 2,
        `seed ${seed.id} 应至少覆盖 2 个不同 role，实际：${Array.from(roles).join(',')}`,
      );
    }
  });

  it('uses Java as the language for every seed', () => {
    for (const seed of PROJECT_AUDIT_FINDING_SEEDS) {
      assert.equal(seed.language, 'Java');
    }
  });

  it('matches a valid standard reference format on every seed', () => {
    const standardReferenceRe = /^GB\/T\s*\d{4,5}-\d{4}\s+\d+(?:\.\d+)+$/;
    for (const seed of PROJECT_AUDIT_FINDING_SEEDS) {
      assert.match(seed.standardReference, standardReferenceRe, `seed ${seed.id} has invalid standardReference`);
    }
  });

  it('every source ref points under its declared project root', () => {
    for (const seed of PROJECT_AUDIT_FINDING_SEEDS) {
      for (const ref of seed.sourceRefs) {
        assert.equal(ref.projectId, seed.projectId);
        assert.ok(ref.path.startsWith('src/'), `seed ${seed.id} ref path must start with src/`);
        assert.ok(ref.endLine >= ref.startLine);
        assert.ok(ref.startLine > 0);
      }
    }
  });

  it('every seed includes at least one task type from the supported set', () => {
    for (const seed of PROJECT_AUDIT_FINDING_SEEDS) {
      assert.ok(seed.taskTypes.length > 0);
      for (const taskType of seed.taskTypes) {
        assert.ok(
          (PROJECT_AUDIT_TASK_TYPES as readonly string[]).includes(taskType),
          `seed ${seed.id} uses unknown task type ${taskType}`,
        );
      }
    }
  });

  it('returns seeds by project id and returns empty list for unknown project', () => {
    assert.equal(getProjectFindingSeeds('not-a-project' as unknown as 'YM_PT').length, 0);
    const ymptSeeds = getProjectFindingSeeds('YM_PT');
    assert.ok(ymptSeeds.every((seed) => seed.projectId === 'YM_PT'));
  });

  it('looks up seeds by id', () => {
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);
    assert.equal(seed!.projectId, 'YM_PT');
    assert.equal(getProjectFindingSeed('not-found'), null);
  });

  it('filters seeds by clause and vulnerability type', () => {
    const byClause = getProjectSeedsByClause('YM_PT', 'GB/T 34944-2017 6.2.3.4');
    assert.ok(byClause.length >= 1);
    for (const seed of byClause) {
      assert.equal(seed.standardReference, 'GB/T 34944-2017 6.2.3.4');
    }

    const byVuln = getProjectSeedsByVulnerability('itstec-24', 'SQL 注入');
    assert.ok(byVuln.length >= 1);
    for (const seed of byVuln) {
      assert.equal(seed.vulnerabilityType, 'SQL 注入');
    }
  });

  it('keeps finding seed sourceRef roles compatible with the question output schema', () => {
    const seed = getProjectFindingSeed('itstec24-filter-hardcoded-key');
    assert.ok(seed);

    const parsed = parseQuestionOutput({
      id: 'q-filter-role-schema',
      code: 'public class A { void f(){ String password = "CTGYUwnw"; } }',
      language: 'Java',
      question: '请选择该片段的主要安全风险。',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 0,
      explanation: '项目 itstec-24 的 OrderFilter.doFilter 使用硬编码口令，符合 GB/T 34944-2017 6.2.6.3。',
      difficulty: 'easy',
      vulnerabilityType: seed!.vulnerabilityType,
      standardReference: seed!.standardReference,
      sourceProject: seed!.projectId,
      auditTaskType: 'identify',
      findingSeedId: seed!.id,
      sourceRefs: seed!.sourceRefs,
      evidenceFlow: seed!.evidenceFlow,
    });

    assert.equal(parsed.success, true, parsed.success ? '' : parsed.issues.join('; '));
  });
});
