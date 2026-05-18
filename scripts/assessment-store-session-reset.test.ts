import assert from 'node:assert/strict';
import type { AssessmentAnswer, AssessmentQuestion } from '../src/lib/store/assessment';

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

const oldQuestion = makeQuestion('old');
const oldAnswer: AssessmentAnswer = {
  question: oldQuestion,
  userAnswer: 1,
  isCorrect: false,
};
const newQuestions = [makeQuestion('new-1'), makeQuestion('new-2')];
const setupOptions = { language: 'java' as const, totalQuestions: 3 };

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

async function main() {
  const { useAssessmentStore } = await import('../src/lib/store/assessment');

  useAssessmentStore.setState({
    phase: 'result',
    questions: [oldQuestion],
    currentQuestion: 4,
    selectedAnswer: 1,
    showResult: true,
    answers: [oldAnswer],
    startTime: 111,
    setupOptions,
    explanation: 'old explanation',
    generationStage: {
      label: '完成',
      detail: '旧任务完成',
      progress: 100,
    },
    generationUsage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      estimated: false,
    },
    explanationUsage: {
      promptTokens: 6,
      completionTokens: 4,
      totalTokens: 10,
      estimated: false,
    },
  });

  useAssessmentStore.getState().startQuizSession(newQuestions, 222);

  const state = useAssessmentStore.getState();

  assert.equal(state.phase, 'quiz');
  assert.deepEqual(state.questions, newQuestions);
  assert.equal(state.startTime, 222);
  assert.equal(state.currentQuestion, 0);
  assert.equal(state.selectedAnswer, null);
  assert.equal(state.showResult, false);
  assert.deepEqual(state.answers, []);
  assert.equal(state.explanation, '');
  assert.equal(state.explanationUsage, null);
  assert.deepEqual(state.setupOptions, setupOptions);
  assert.equal(state.generationUsage?.totalTokens, 15);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
