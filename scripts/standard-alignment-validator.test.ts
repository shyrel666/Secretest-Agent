import assert from 'node:assert/strict';
import type { Question } from '../src/lib/agents/question-generator-agent';
import { validateStandardAlignedQuestion } from '../src/lib/agents/standard-alignment-validator';

const alignedQuestion: Question = {
  id: 'q_standard_aligned_sql',
  code: [
    'public User findByName(String name) {',
    '    String query = "SELECT id, name FROM users WHERE name = \'" + name + "\'";',
    '    return jdbcTemplate.queryForObject(query, User.class);',
    '}',
  ].join('\n'),
  language: 'Java',
  question: '根据对应标准条款，以下代码最需要关注哪类源代码安全问题？',
  options: ['SQL注入', '路径遍历', '整数溢出', '资源未释放'],
  correctAnswer: 0,
  explanation: '该题对应 GB/T 34944-2017 6.2.3.7。代码证据是外部输入 name 未经校验或参数化处理，直接通过字符串拼接进入 SQL 查询语句，审核时应判定为 SQL 注入风险。',
  difficulty: 'medium',
  vulnerabilityType: 'SQL注入',
  standardReference: 'GB/T 34944-2017 6.2.3.7',
};

function expectRejected(question: Question, issuePattern: RegExp) {
  const result = validateStandardAlignedQuestion(question);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some((issue) => issuePattern.test(issue)),
    `Expected issue matching ${issuePattern}, got: ${result.issues.join(' | ')}`,
  );
}

const accepted = validateStandardAlignedQuestion(alignedQuestion);
assert.equal(accepted.success, true, accepted.issues.join('；'));

expectRejected({
  ...alignedQuestion,
  code: [
    'public User findByName(String name) {',
    '    String sqlInjectionRisk = "SELECT id FROM users WHERE name = \'" + name + "\'";',
    '    return jdbcTemplate.queryForObject(sqlInjectionRisk, User.class);',
    '}',
  ].join('\n'),
}, /泄露答案|提示性/);

expectRejected({
  ...alignedQuestion,
  code: [
    'public User findByName(String name) {',
    '    // 这里存在SQL注入',
    '    String query = "SELECT id FROM users WHERE name = \'" + name + "\'";',
    '    return jdbcTemplate.queryForObject(query, User.class);',
    '}',
  ].join('\n'),
}, /注释|清洗/);

expectRejected({
  ...alignedQuestion,
  explanation: '用户输入会影响查询结果，应当修复。',
}, /标准条款|证据/);

expectRejected({
  ...alignedQuestion,
  code: 'return jdbcTemplate.queryForObject(sql, User.class);',
}, /过短|审计场景/);

expectRejected({
  ...alignedQuestion,
  code: [
    'public String readUserFile(String name, String fileName) {',
    '    String query = "SELECT id FROM users WHERE name = \'" + name + "\'";',
    '    jdbcTemplate.queryForObject(query, User.class);',
    '    return Files.readString(Paths.get("/srv/data", fileName));',
    '}',
  ].join('\n'),
}, /多个漏洞|答案不唯一/);
