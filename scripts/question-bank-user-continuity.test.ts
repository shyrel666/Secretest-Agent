import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AssessmentAnswer } from '../src/lib/store/assessment';

function makeAnswer(): AssessmentAnswer {
  return {
    question: {
      id: 'q-sql-injection',
      code: [
        'public User load(String name) {',
        '    String sql = "SELECT * FROM users WHERE name = \'" + name + "\'";',
        '    return jdbcTemplate.queryForObject(sql, User.class);',
        '}',
      ].join('\n'),
      language: 'Java',
      question: '这段代码主要存在什么安全风险？',
      options: ['SQL注入', '路径遍历', '整数溢出', '资源泄漏'],
      correctAnswer: 0,
      explanation: '外部输入直接拼接进入 SQL 查询。',
      difficulty: 'medium',
      vulnerabilityType: 'SQL注入',
      standardReference: 'GB/T 34944-2017 6.2.3.7',
    },
    userAnswer: 0,
    isCorrect: true,
  };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'question-bank-user-continuity-'));
  process.chdir(tempDir);

  const {
    getQuestionBankStats,
    resolveQuestionBankUserId,
    saveAssessmentResults,
  } = await import('../src/lib/question-bank/sqlite-store');

  const existingUserId = 'existing-user-123456';
  const newAnonymousUserId = 'new-user-123456789';
  const originalSingleUserMode = process.env.QUESTION_BANK_SINGLE_USER_MODE;
  const originalHostname = process.env.HOSTNAME;

  saveAssessmentResults([makeAnswer()], 'session-existing', existingUserId);

  assert.equal(getQuestionBankStats(newAnonymousUserId).correctCount, 0);

  process.env.QUESTION_BANK_SINGLE_USER_MODE = 'false';
  assert.equal(resolveQuestionBankUserId(newAnonymousUserId), newAnonymousUserId);

  delete process.env.QUESTION_BANK_SINGLE_USER_MODE;
  process.env.HOSTNAME = '0.0.0.0';
  assert.equal(resolveQuestionBankUserId(newAnonymousUserId), newAnonymousUserId);

  process.env.HOSTNAME = 'localhost';
  assert.equal(resolveQuestionBankUserId(newAnonymousUserId), existingUserId);

  process.env.QUESTION_BANK_SINGLE_USER_MODE = 'true';
  assert.equal(resolveQuestionBankUserId(newAnonymousUserId), existingUserId);
  assert.equal(getQuestionBankStats(resolveQuestionBankUserId(newAnonymousUserId)).correctCount, 1);

  if (originalSingleUserMode === undefined) {
    delete process.env.QUESTION_BANK_SINGLE_USER_MODE;
  } else {
    process.env.QUESTION_BANK_SINGLE_USER_MODE = originalSingleUserMode;
  }

  if (originalHostname === undefined) {
    delete process.env.HOSTNAME;
  } else {
    process.env.HOSTNAME = originalHostname;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
