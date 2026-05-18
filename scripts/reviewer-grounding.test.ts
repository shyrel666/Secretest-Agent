import assert from 'node:assert/strict';
import { ReviewerAgent } from '../src/lib/agents/reviewer-agent';
import type { Question } from '../src/lib/agents/question-generator-agent';

const question: Question = {
  id: 'ungrounded-approved',
  code: [
    'public User findUser(String name) {',
    '    String sql = "SELECT * FROM users WHERE name = \'" + name + "\'";',
    '    return jdbcTemplate.queryForObject(sql, User.class);',
    '}',
  ].join('\n'),
  language: 'Java',
  question: '以下代码最需要关注哪类安全问题？',
  options: ['SQL注入', '路径遍历', '整数溢出', '资源泄漏'],
  correctAnswer: 0,
  explanation: '用户输入直接拼接进 SQL 查询，缺少参数化处理。',
  difficulty: 'medium',
  vulnerabilityType: 'SQL注入',
  standardReference: 'GB/T 34944-2017 6.2.3.7',
};

const reviewer = new ReviewerAgent();

reviewer.reviewQuestion = async () => ({
  success: true,
  result: {
    approved: true,
    score: 92,
    issues: [],
    suggestions: [],
  },
  grounding: {
    grounded: false,
    issues: ['未找到可支撑该标准条款引用的证据'],
  },
});

async function main() {
  const result = await reviewer.reviewAndFix(question);

  assert.equal(result.success, false);
  assert.equal(result.grounding?.grounded, false);
  assert.deepEqual(result.grounding?.issues, ['未找到可支撑该标准条款引用的证据']);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
