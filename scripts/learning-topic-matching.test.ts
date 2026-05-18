import assert from 'node:assert/strict';
import { findRelatedLearningTopics, type DynamicLearningTopic, type LearningTopic } from '../src/lib/learning/topics';

const dynamicSecurityFeatureTopic: DynamicLearningTopic = {
  id: 'java-sec-6.2.6',
  language: 'java',
  title: '6.2.6 安全功能',
  summary: '涵盖安全关键的行为依赖反向域名解析等检查点。',
  difficulty: 'beginner',
  estimatedMinutes: 20,
  vulnerabilityFocus: '安全功能',
  searchQueries: ['Java 安全功能 条款', '安全关键的行为依赖反向域名解析'],
  goals: ['能识别安全关键的行为依赖反向域名解析'],
  standard: 'GB/T 34944-2017',
  clausePrefix: '6.2.6',
  docId: 'doc_java',
  subClauses: [
    { clause: '6.2.6.11', title: '安全关键的行为依赖反向域名解析' },
  ],
  fromDocument: true,
  contentSource: 'document',
  topicGroup: 'core',
};

const unrelatedInputTopic: LearningTopic = {
  id: 'java-input-validation',
  language: 'java',
  title: '输入校验与边界意识',
  summary: '理解外部输入为什么危险。',
  difficulty: 'beginner',
  estimatedMinutes: 18,
  vulnerabilityFocus: '输入校验',
  searchQueries: ['Java 输入校验 漏洞 条款'],
  goals: ['理解输入校验'],
  standard: 'GB/T 34944-2017',
};

const related = findRelatedLearningTopics({
  language: 'Java',
  vulnerabilityType: '安全关键的行为依赖反向域名解析',
  standardReference: 'GB/T 34944-2017 6.2.6.11',
  limit: 2,
  topics: [unrelatedInputTopic, dynamicSecurityFeatureTopic],
});

assert.equal(related[0]?.id, 'java-sec-6.2.6');
assert.ok(
  related.every((topic) => topic.id !== 'java-input-validation'),
  `Expected precise clause match to avoid unrelated fallback topics, got: ${related.map((topic) => topic.id).join(', ')}`,
);
