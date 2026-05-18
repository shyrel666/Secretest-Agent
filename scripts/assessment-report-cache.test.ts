import assert from 'node:assert/strict';
import type {
  AssessmentQuestion,
  AssessmentLearningReport,
} from '../src/lib/store/assessment';

function makeQuestion(id: string): AssessmentQuestion {
  return {
    id,
    code: [
      'public User load(String name) {',
      '    String sql = "SELECT * FROM users WHERE name = \'" + name + "\'";',
      '    return jdbcTemplate.queryForObject(sql, User.class);',
      '}',
    ].join('\n'),
    language: 'Java',
    question: `第 ${id} 题最需要关注哪类安全问题？`,
    options: ['SQL注入', '路径遍历', '整数溢出', '资源泄漏'],
    correctAnswer: 0,
    explanation: '外部输入直接拼接进入 SQL 查询。',
    difficulty: 'medium',
    vulnerabilityType: 'SQL注入',
    standardReference: 'GB/T 34944-2017 6.2.3.7',
  };
}

const storage = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageShim,
});

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: localStorageShim,
  },
});

const report: AssessmentLearningReport = {
  learningPath: {
    strengths: ['SQL 注入识别较稳定'],
    weaknesses: ['标准条款证据定位仍需加强'],
    recommendations: ['回看参数化查询相关条款'],
    nextTopics: ['GB/T 34944-2017 6.2.3.7'],
  },
};

async function main() {
  const { useAssessmentStore } = await import('../src/lib/store/assessment');
  const store = useAssessmentStore.getState();

  assert.equal(typeof store.setLearningReportCache, 'function');

  store.setLearningReportCache('session_111', report);

  const cachedState = useAssessmentStore.getState();
  assert.equal(cachedState.learningReportSessionKey, 'session_111');
  assert.deepEqual(cachedState.learningReport, report);

  cachedState.startQuizSession([makeQuestion('new-1')], 222);

  const resetState = useAssessmentStore.getState();
  assert.equal(resetState.learningReportSessionKey, null);
  assert.equal(resetState.learningReport, null);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
