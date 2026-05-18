import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../src/lib/agents/orchestrator';
import type { Question } from '../src/lib/agents/question-generator-agent';

function makeQuestion(id: string, vulnerabilityType: string): Question {
  return {
    id,
    code: 'void demo() {}',
    language: 'Java',
    question: `${vulnerabilityType} 相关代码审计题`,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
    explanation: `${vulnerabilityType} 的标准解释。`,
    difficulty: 'medium',
    vulnerabilityType,
    standardReference: 'GB/T 34944-2017 6.2.3.7',
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
        question: makeQuestion('correct-sql-spaced', 'SQL 注入'),
        userAnswer: 0,
        isCorrect: true,
      },
      {
        question: makeQuestion('wrong-sql-suffixed', 'SQL注入漏洞'),
        userAnswer: 1,
        isCorrect: false,
      },
    ],
  });

  assert.equal(reportResult.success, true);
  assert.ok(reportResult.report);

  const path = reportResult.report.learningPath;
  assert.ok(path.weaknesses.some((item) => item.includes('SQL注入漏洞')));
  assert.equal(path.strengths.some((item) => item.includes('SQL')), false);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
