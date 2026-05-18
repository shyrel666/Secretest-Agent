import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../src/lib/agents/orchestrator';
import type { Question } from '../src/lib/agents/question-generator-agent';

function makeQuestion(
  id: string,
  language: Question['language'],
  vulnerabilityType: string,
  standardReference: string,
): Question {
  return {
    id,
    code: 'void demo() {}',
    language,
    question: `${vulnerabilityType} 相关代码审计题`,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
    explanation: `${vulnerabilityType} 的标准解释。`,
    difficulty: 'medium',
    vulnerabilityType,
    standardReference,
  };
}

async function main() {
  const orchestrator = new AgentOrchestrator();
  (orchestrator as unknown as {
    explainerAgent: {
      generateLearningPath: () => Promise<{ success: false; error: string }>;
    };
  }).explainerAgent = {
    generateLearningPath: async () => ({
      success: false,
      error: 'mocked LLM parse failure',
    }),
  };

  const reportResult = await orchestrator.generateLearningReport({
    answers: [
      {
        question: makeQuestion('correct-sql', 'Java', 'SQL注入', 'GB/T 34944-2017 6.2.3.7'),
        userAnswer: 0,
        isCorrect: true,
      },
      {
        question: makeQuestion('wrong-path', 'Java', '路径遍历', 'GB/T 34944-2017 6.2.3.8'),
        userAnswer: 1,
        isCorrect: false,
      },
      {
        question: makeQuestion('wrong-overflow', 'C++', '整数溢出', 'GB/T 34943-2017 6.2.8.1'),
        userAnswer: 2,
        isCorrect: false,
      },
    ],
  });

  assert.equal(reportResult.success, true);
  assert.ok(reportResult.report);

  const path = reportResult.report.learningPath;
  assert.ok(path.strengths.some((item) => item.includes('SQL注入')));
  assert.ok(path.weaknesses.some((item) => item.includes('路径遍历')));
  assert.ok(path.weaknesses.some((item) => item.includes('整数溢出')));
  assert.ok(path.recommendations.some((item) => item.includes('路径遍历')));
  assert.ok(path.recommendations.some((item) => item.includes('整数溢出')));
  assert.ok(path.nextTopics.some((item) => item.includes('路径遍历')));
  assert.ok(path.nextTopics.some((item) => item.includes('整数溢出')));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
