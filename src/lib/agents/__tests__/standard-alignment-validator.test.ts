import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Question } from '@/lib/agents/question-generator-agent';
import { validateStandardAlignedQuestion } from '@/lib/agents/standard-alignment-validator';

const cookieCode = `public void addDoctor(HttpServletRequest request, String account) {
    Cookie[] cookies = request.getCookies();
    String adminId = findAdminId(cookies);
    if (account.equals(adminId)) {
        doctorService.addDoctor(account);
    }
}`;

function buildCookieQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'project-cookie-question',
    code: cookieCode,
    language: 'Java',
    question: '这段代码中最需要审计的身份校验风险是什么？',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
    explanation: '依据 GB/T 34944-2017 6.2.6.15 标准条款，代码证据显示输入参数与 Cookie 中的 adminId 直接比较，缺少完整性校验。',
    difficulty: 'medium',
    vulnerabilityType: '依赖未经验证和完整性检查的 cookie',
    standardReference: 'GB/T 34944-2017 6.2.6.15',
    ...overrides,
  };
}

describe('validateStandardAlignedQuestion', () => {
  it('allows unavoidable API terms in real project source questions', () => {
    const result = validateStandardAlignedQuestion(buildCookieQuestion({
      sourceProject: 'YM_PT',
      auditTaskType: 'trace',
      findingSeedId: 'ympt-cookie-admin-auth',
    }));

    assert.equal(result.success, true, result.issues.join('；'));
  });

  it('keeps vulnerability type term leak checks for non-project questions', () => {
    const result = validateStandardAlignedQuestion(buildCookieQuestion());

    assert.equal(result.success, false);
    assert.match(result.issues.join('；'), /cookie/);
  });
});
