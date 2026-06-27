import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';
import { validateProjectGroundedQuestion } from '@/lib/project-audit/project-grounding-validator';
import { getProjectFindingSeed } from '@/lib/project-audit/source-code-findings';
import { readProjectSourceSnippet } from '@/lib/project-audit/source-reader';
import type { Question } from '@/lib/agents/question-generator-agent';

function buildBaseQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-test-1',
    code: '',
    language: 'Java',
    question: '请识别下面代码中的主要安全风险。',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
    explanation: '',
    difficulty: 'medium',
    vulnerabilityType: 'SQL 注入',
    standardReference: 'GB/T 34944-2017 6.2.3.4',
    ...overrides,
  };
}

function loadSeedCodeSnippet(seedId: string, symbolHint?: string): string {
  const seed = getProjectFindingSeed(seedId);
  if (!seed) {
    throw new Error(`Seed not found: ${seedId}`);
  }
  const ref = symbolHint
    ? seed.sourceRefs.find((r) => r.symbol === symbolHint) || seed.sourceRefs[0]
    : seed.sourceRefs[0];
  return readProjectSourceSnippet(ref).code;
}

describe('project-grounding-validator', () => {
  it('rejects a project-grounded question that drops sourceRefs', () => {
    const question = buildBaseQuestion({
      sourceProject: 'YM_PT',
      auditTaskType: 'identify',
      findingSeedId: 'ympt-sql-order-injection',
      sourceRefs: [],
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    assert.ok(result.issues.some((issue) => issue.includes('sourceRefs 不能为空')));
  });

  it('rejects a question whose sourceProject does not match the seed', () => {
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);
    const question = buildBaseQuestion({
      sourceProject: 'itstec-24',
      auditTaskType: 'identify',
      findingSeedId: 'ympt-sql-order-injection',
      sourceRefs: seed!.sourceRefs,
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    assert.ok(result.issues.some((issue) => issue.includes('与 seed')));
  });

  it('rejects a question whose standardReference does not match the seed', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const question = buildBaseQuestion({
      sourceProject: 'itstec-24',
      auditTaskType: 'trace',
      findingSeedId: 'itstec24-log-arch-command',
      sourceRefs: seed!.sourceRefs,
      standardReference: 'GB/T 34944-2017 6.2.3.4',
      explanation: `项目 itstec-24 的 LogServiceImpl.logArch 拼接到 cmd[2] 后执行 Runtime.getRuntime().exec(cmd)，对应 GB/T 34944-2017 6.2.3.3。`,
      code: loadSeedCodeSnippet('itstec24-log-arch-command', 'LogServiceImpl.logArch'),
      vulnerabilityType: '命令注入',
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    assert.ok(result.issues.some((issue) => issue.includes('standardReference')));
  });

  it('rejects a question that ignores the seed\'s project evidence entirely', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const question = buildBaseQuestion({
      sourceProject: 'itstec-24',
      auditTaskType: 'trace',
      findingSeedId: 'itstec24-log-arch-command',
      sourceRefs: seed!.sourceRefs,
      standardReference: seed!.standardReference,
      vulnerabilityType: seed!.vulnerabilityType,
      explanation: 'some unsafe code', // 缺少项目/文件/方法名
      code: `function add(a, b) { return a + b; }`,
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    assert.ok(result.issues.length > 0);
  });

  it('passes a source-mode question whose code matches a seed source ref', () => {
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);
    const refCode = readProjectSourceSnippet(seed!.sourceRefs[0]).code;
    const question = buildBaseQuestion({
      sourceProject: 'YM_PT',
      auditTaskType: 'identify',
      findingSeedId: 'ympt-sql-order-injection',
      sourceRefs: seed!.sourceRefs,
      standardReference: seed!.standardReference,
      vulnerabilityType: seed!.vulnerabilityType,
      explanation: `项目 YM_PT 的 ReportController.queryCustOrder 把 order 透传到 ReportServiceImpl，再拼到 ReportMapper.xml 的 ${'$'}{order}，构成 SQL 注入，对应 GB/T 34944-2017 6.2.3.4。`,
      code: refCode,
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, true, result.issues.join('; '));
  });

  it('rejects a variant-mode question without variantOfFindingId', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const question = buildBaseQuestion({
      sourceProject: 'itstec-24',
      auditTaskType: 'variant',
      findingSeedId: 'itstec24-log-arch-command',
      sourceRefs: seed!.sourceRefs,
      standardReference: seed!.standardReference,
      vulnerabilityType: seed!.vulnerabilityType,
      explanation: '项目 itstec-24 的 LogServiceImpl.logArch 把 para 拼接到 cmd[2] 后 Runtime.getRuntime().exec(cmd)，构成命令注入，对应 GB/T 34944-2017 6.2.3.3。',
      code: `public class AuditArch {\n  public void run(String para) {\n    String[] cmd = new String[3];\n    cmd[0] = "cmd.exe";\n    cmd[1] = "/c";\n    cmd[2] = "D:/itstec/auditArch.bat " + para;\n    Runtime.getRuntime().exec(cmd);\n  }\n}`,
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    assert.ok(result.issues.some((issue) => issue.includes('variantOfFindingId')));
  });

  it('passes a variant-mode question that preserves key pattern markers', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const question = buildBaseQuestion({
      sourceProject: 'itstec-24',
      auditTaskType: 'variant',
      findingSeedId: 'itstec24-log-arch-command',
      variantOfFindingId: 'itstec24-log-arch-command',
      sourceRefs: seed!.sourceRefs,
      standardReference: seed!.standardReference,
      vulnerabilityType: seed!.vulnerabilityType,
      explanation: '项目 itstec-24 的 AuditServiceImpl.run 把 para 拼接到 cmd[2] 后 Runtime.getRuntime().exec(cmd)，构成命令注入，对应 GB/T 34944-2017 6.2.3.3。',
      code: `public class AuditServiceImpl {\n  public void run(String para) {\n    String[] cmd = new String[3];\n    cmd[0] = "cmd.exe";\n    cmd[1] = "/c";\n    cmd[2] = "D:/itstec/auditArch.bat " + para;\n    Runtime.getRuntime().exec(cmd);\n  }\n}`,
    });
    const result = validateProjectGroundedQuestion(question, undefined, { mode: 'variant' });
    assert.equal(result.success, true, result.issues.join('; '));
  });

  it('skips project validation for standard-only questions', () => {
    const question = buildBaseQuestion();
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    // 因为没有 project 元数据，但 sourceProject 不存在所以会失败
    assert.ok(result.issues.length > 0);
  });

  it('rejects source-mode code that has no overlap with seed pattern markers (regression: BUG-05)', () => {
    // LLM 编造一段与 seed 无关的 Spring Security 代码，企图用 evidenceFlow 中的 subject 关键词绕过
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);
    const question = buildBaseQuestion({
      sourceProject: 'YM_PT',
      auditTaskType: 'identify',
      findingSeedId: 'ympt-sql-order-injection',
      sourceRefs: seed!.sourceRefs,
      standardReference: seed!.standardReference,
      vulnerabilityType: seed!.vulnerabilityType,
      explanation: '项目 YM_PT 的 controller subject 字段',
      code: 'public class SecurityConfig { @Bean public Subject subject() { return new Subject(); } }',
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    // 应当报"未包含 seed 关键模式"或"与 evidenceFlow 关键词无关"
    assert.ok(
      result.issues.some((issue) => issue.includes('关键') || issue.includes('evidenceFlow')),
      `expected issue about pattern or evidence, got: ${result.issues.join('; ')}`,
    );
  });

  it('accepts source-mode code that contains the seed\'s specific pattern markers', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const refCode = loadSeedCodeSnippet('itstec24-log-arch-command', 'LogServiceImpl.logArch');
    const question = buildBaseQuestion({
      sourceProject: 'itstec-24',
      auditTaskType: 'trace',
      findingSeedId: 'itstec24-log-arch-command',
      sourceRefs: seed!.sourceRefs,
      standardReference: seed!.standardReference,
      vulnerabilityType: seed!.vulnerabilityType,
      explanation: '项目 itstec-24 的 LogServiceImpl.logArch 把 para 拼接到 cmd[2] 后 Runtime.getRuntime().exec(cmd)，构成命令注入，对应 GB/T 34944-2017 6.2.3.3。',
      code: refCode,
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, true, result.issues.join('; '));
  });

  it('rejects source-mode code that only copies marker words without real source-line overlap', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const question = buildBaseQuestion({
      sourceProject: 'itstec-24',
      auditTaskType: 'trace',
      findingSeedId: 'itstec24-log-arch-command',
      sourceRefs: seed!.sourceRefs,
      standardReference: seed!.standardReference,
      vulnerabilityType: seed!.vulnerabilityType,
      explanation: '项目 itstec-24 的 LogServiceImpl.logArch 中 Runtime.exec 是关键系统调用。',
      code: `public class ArchiveJob {\n  public void logArch(String para) throws Exception {\n    String[] cmd = new String[] {"cmd.exe", "/c", "archive " + para};\n    Runtime.getRuntime().exec(cmd);\n  }\n}`,
    });
    const result = validateProjectGroundedQuestion(question);
    assert.equal(result.success, false);
    assert.ok(result.issues.some((issue) => issue.includes('真实源码行重叠不足')));
  });
});
