import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../src/lib/agents/orchestrator';
import type { Question } from '../src/lib/agents/question-generator-agent';

function makeQuestion(id: string, difficulty: Question['difficulty'] = 'medium'): Question {
  const safeId = id.replace(/\W/g, '');
  return {
    id,
    code: [
      `public String loadProfile${safeId}(String userName${safeId}) {`,
      `    String query${safeId} = "SELECT display_name FROM users WHERE name = '" + userName${safeId} + "'";`,
      `    return jdbcTemplate.queryForObject(query${safeId}, String.class);`,
      '}',
    ].join('\n'),
    language: 'Java',
    question: `第 ${id} 题中最需要关注哪类安全问题？`,
    options: ['输入未参数化进入查询', '资源未释放', '整数计算溢出', '日志记录不足'],
    correctAnswer: 0,
    explanation: '该题对应 GB/T 34944-2017 6.2.3.7。代码证据是外部输入 userName 未经参数化处理，直接拼接进入查询调用，审核时应关注该标准条款要求。',
    difficulty,
    vulnerabilityType: `测试类型${id}`,
    standardReference: 'GB/T 34944-2017 6.2.3.7',
  };
}

const orchestrator = new AgentOrchestrator();

const seedQuestions = [makeQuestion('seed-1', 'easy'), makeQuestion('seed-2', 'medium')];
const supplementQuestions = [
  makeQuestion('supplement-3', 'medium'),
  makeQuestion('supplement-4', 'medium'),
  makeQuestion('supplement-5', 'hard'),
];

let seedCallCount = 0;
let failedSingleAttempts = 0;
let activeSingleCalls = 0;
let maxConcurrentSingleCalls = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(orchestrator as unknown as {
  questionGenerator: {
    generateQuestion: (params: { count?: number }) => Promise<{
      success: boolean;
      questions?: Question[];
      error?: string;
    }>;
  };
}).questionGenerator.generateQuestion = async (params: { count?: number }) => {
  if ((params.count || 1) > 1) {
    const question = seedQuestions[seedCallCount++];
    return question ? { success: true, questions: [question] } : { success: true, questions: [] };
  }

  activeSingleCalls++;
  maxConcurrentSingleCalls = Math.max(maxConcurrentSingleCalls, activeSingleCalls);
  await delay(20);
  activeSingleCalls--;

  if (failedSingleAttempts < 3) {
    failedSingleAttempts++;
    return { success: false, error: 'transient supplement failure' };
  }

  const question = supplementQuestions.shift();
  return question ? { success: true, questions: [question] } : { success: false, error: 'no more questions' };
};

(orchestrator as unknown as {
  reviewerAgent: {
    reviewAndFix: (question: Question) => Promise<{
      success: boolean;
      question: Question;
      review: { approved: boolean; score: number; issues: string[]; suggestions: string[] };
    }>;
  };
}).reviewerAgent.reviewAndFix = async (question: Question) => ({
  success: true,
  question,
  review: {
    approved: true,
    score: 90,
    issues: [],
    suggestions: [],
  },
});

async function main() {
  const result = await orchestrator.generateQuizSet({
    totalQuestions: 5,
    language: 'java',
    vulnerabilityType: 'SQL注入',
  });

  assert.equal(result.success, true, result.errors?.join('；'));
  assert.equal(result.questions?.length, 5, `Expected exactly 5 questions, got ${result.questions?.length ?? 0}`);
  assert.ok(
    maxConcurrentSingleCalls > 1,
    `Expected supplement generation to run concurrently, max concurrency was ${maxConcurrentSingleCalls}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
