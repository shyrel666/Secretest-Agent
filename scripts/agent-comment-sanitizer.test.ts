import assert from 'node:assert/strict';
import { sanitizeQuestionCode } from '../src/lib/agents/code-sanitizer';
import { parseReviewOutput } from '../src/lib/agents/output-schemas';

const reviewWithCommentedCorrection = {
  approved: false,
  score: 72,
  issues: ['代码中存在提示性注释'],
  suggestions: ['移除代码注释'],
  correctedQuestion: {
    id: 'q_comment_leak',
    code: [
      'public User loadUser(String name) {',
      '    // 漏洞点：这里直接拼接 SQL',
      '    String sql = "SELECT * FROM users WHERE name = \'" + name + "\'";',
      '    return jdbcTemplate.queryForObject(sql, User.class); /* 提示：SQL注入 */',
      '}',
    ].join('\n'),
    language: 'Java',
    question: '以下代码存在哪类安全风险？',
    options: ['SQL注入', '路径遍历', '整数溢出', '资源泄漏'],
    correctAnswer: 0,
    explanation: '用户输入直接拼接到SQL语句中，攻击者可以构造输入改变查询语义。',
    difficulty: 'medium',
    vulnerabilityType: 'SQL注入',
    standardReference: 'GB/T 34944-2017 6.2.3.7',
  },
};

const validation = parseReviewOutput(reviewWithCommentedCorrection);

assert.equal(validation.success, true);
if (!validation.success) {
  process.exit(1);
}

const sanitizedCode = validation.review.correctedQuestion?.code ?? '';

assert.ok(!sanitizedCode.includes('// 漏洞点'), 'correctedQuestion.code should remove line comments');
assert.ok(!sanitizedCode.includes('/* 提示'), 'correctedQuestion.code should remove block comments');
assert.ok(sanitizedCode.includes('jdbcTemplate.queryForObject'), 'sanitizing should keep executable code');

const codeWithCommentLikeStrings = sanitizeQuestionCode([
  'var url = "http://example.com/a//b"; // remove this',
  'var path = @"C:\\temp\\//archive"; /* remove this too */',
  'Console.WriteLine(url + path);',
].join('\n'));

assert.ok(codeWithCommentLikeStrings.includes('"http://example.com/a//b"'));
assert.ok(codeWithCommentLikeStrings.includes('@"C:\\temp\\//archive"'));
assert.ok(!codeWithCommentLikeStrings.includes('remove this'));
