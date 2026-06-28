import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseQuestionOutput } from '@/lib/agents/output-schemas';
import { sanitizeQuestionCode } from '@/lib/agents/code-sanitizer';
import { validateProjectGroundedQuestion } from '@/lib/project-audit/project-grounding-validator';
import { getProjectFindingSeed } from '@/lib/project-audit/source-code-findings';
import { readProjectSourceSnippet } from '@/lib/project-audit/source-reader';

describe('parseQuestionOutput project seed metadata', () => {
  it('overrides malformed model project metadata with trusted seed metadata', () => {
    const seed = getProjectFindingSeed('ympt-cookie-admin-auth');
    assert.ok(seed);

    const parsed = parseQuestionOutput({
      id: 'q-project-metadata-repair',
      code: [
        'public void addDoctor(HttpServletRequest request, String account) {',
        '    Cookie[] cookies = request.getCookies();',
        '    String adminId = findAdminId(cookies);',
        '    if (account.equals(adminId)) {',
        '        doctorService.addDoctor(account);',
        '    }',
        '}',
      ].join('\n'),
      language: 'Java',
      question: '这段代码中最需要审计的身份校验风险是什么？',
      options: ['依赖可篡改 Cookie 做权限判断', 'SQL 注入', '路径遍历', '弱随机数'],
      correctAnswer: 0,
      explanation: '依据 GB/T 34944-2017 6.2.6.15，YM_PT 项目 AdminController.addDoctor 从 Cookie 读取 adminID 与 account 比对后执行添加医生操作，缺少完整性校验。',
      difficulty: 'medium',
      vulnerabilityType: '模型随意输出的类型',
      standardReference: 'GB/T 34944-2017 6.2.1.1',
      sourceProject: 'YM_PT',
      auditTaskType: 'trace',
      findingSeedId: 'wrong-seed',
      sourceRefs: ['AdminController.java:51-90'],
      evidenceFlow: [
        { step: '入口', location: 'controller', description: '读取 Cookie' },
      ],
    }, {
      seed,
      taskType: 'trace',
    });

    assert.equal(parsed.success, true, parsed.success ? '' : parsed.issues.join('；'));
    if (!parsed.success) return;

    assert.equal(parsed.question.findingSeedId, seed.id);
    assert.equal(parsed.question.standardReference, seed.standardReference);
    assert.equal(parsed.question.vulnerabilityType, seed.vulnerabilityType);
    assert.deepEqual(parsed.question.sourceRefs, seed.sourceRefs);
    assert.deepEqual(parsed.question.evidenceFlow, seed.evidenceFlow);
  });

  it('uses trusted project source code for source-mode questions', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);

    const parsed = parseQuestionOutput({
      id: 'q-project-source-code-repair',
      code: [
        'public class ArchiveJob {',
        '    void run(String input) throws Exception {',
        '        Runtime.getRuntime().exec("backup " + input);',
        '    }',
        '}',
      ].join('\n'),
      language: 'Java',
      question: '这段真实源码中的主要审计风险是什么？',
      options: ['命令注入', 'SQL 注入', '路径遍历', '弱随机数'],
      correctAnswer: 0,
      explanation: '项目 itstec-24 的 LogServiceImpl.logArch 将参数拼接进 cmd[2] 后调用 Runtime.getRuntime().exec(cmd)，对应 GB/T 34944-2017 6.2.3.3。需要审计命令参数是否经过白名单限制。',
      difficulty: 'medium',
      vulnerabilityType: seed!.vulnerabilityType,
      standardReference: seed!.standardReference,
    }, {
      seed,
      taskType: 'trace',
    });

    assert.equal(parsed.success, true, parsed.success ? '' : parsed.issues.join('；'));
    if (!parsed.success) return;

    const expectedCode = seed.sourceRefs
      .map((ref) => sanitizeQuestionCode(readProjectSourceSnippet(ref).code))
      .filter(Boolean)
      .join('\n\n');

    assert.equal(parsed.question.code, expectedCode);

    const grounding = validateProjectGroundedQuestion(parsed.question, seed, { mode: 'source' });
    assert.equal(grounding.success, true, grounding.issues.join('；'));
  });

  it('adds trusted project evidence to terse source-mode explanations', () => {
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);

    const parsed = parseQuestionOutput({
      id: 'q-project-explanation-repair',
      code: 'class Placeholder { void f() {} }',
      language: 'Java',
      question: '这段真实源码中的主要审计风险是什么？',
      options: ['SQL 注入', '命令注入', '路径遍历', '弱随机数'],
      correctAnswer: 0,
      explanation: '该代码存在 SQL 注入风险。',
      difficulty: 'medium',
      vulnerabilityType: seed!.vulnerabilityType,
      standardReference: seed!.standardReference,
    }, {
      seed,
      taskType: 'identify',
    });

    assert.equal(parsed.success, true, parsed.success ? '' : parsed.issues.join('；'));
    if (!parsed.success) return;

    assert.match(parsed.question.explanation, /项目证据：YM_PT/);
    assert.match(parsed.question.explanation, /ReportController\.queryCustOrder/);

    const grounding = validateProjectGroundedQuestion(parsed.question, seed, { mode: 'source' });
    assert.equal(grounding.success, true, grounding.issues.join('；'));
  });

  it('keeps model-authored code for variant questions', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const variantCode = [
      'public class AuditArchive {',
      '  public void run(String para) throws Exception {',
      '    String[] cmd = new String[3];',
      '    cmd[0] = "cmd.exe";',
      '    cmd[1] = "/c";',
      '    cmd[2] = "D:/itstec/auditArch.bat " + para;',
      '    Runtime.getRuntime().exec(cmd);',
      '  }',
      '}',
    ].join('\n');

    const parsed = parseQuestionOutput({
      id: 'q-project-variant-keeps-code',
      code: variantCode,
      language: 'Java',
      question: '这个同构变体保留了哪类风险？',
      options: ['命令注入', 'SQL 注入', '路径遍历', '弱随机数'],
      correctAnswer: 0,
      explanation: '项目 itstec-24 的变体代码仍将 para 拼接到 cmd[2] 后 Runtime.getRuntime().exec(cmd)，对应 GB/T 34944-2017 6.2.3.3。',
      difficulty: 'medium',
      vulnerabilityType: seed!.vulnerabilityType,
      standardReference: seed!.standardReference,
    }, {
      seed,
      taskType: 'variant',
    });

    assert.equal(parsed.success, true, parsed.success ? '' : parsed.issues.join('；'));
    if (!parsed.success) return;

    assert.equal(parsed.question.code, variantCode);
    assert.equal(parsed.question.variantOfFindingId, seed.id);
  });
});
