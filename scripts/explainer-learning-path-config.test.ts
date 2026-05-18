import assert from 'node:assert/strict';
import { ExplainerAgent } from '../src/lib/agents/explainer-agent';
import type { LLMConfigCompatible, ModelConfig } from '../src/lib/agents/types';
import type { Question } from '../src/lib/agents/question-generator-agent';

function makeQuestion(vulnerabilityType: string): Question {
  return {
    id: vulnerabilityType,
    code: 'void demo() {}',
    language: 'Java',
    question: `${vulnerabilityType} 题`,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 0,
    explanation: `${vulnerabilityType} 解释`,
    difficulty: 'medium',
    vulnerabilityType,
    standardReference: 'GB/T 34944-2017 6.2.3.7',
  };
}

async function main() {
  const modelConfig: ModelConfig = {
    model: 'custom-explainer-model',
    temperature: 0.2,
    thinking: false,
  };
  const agent = new ExplainerAgent(undefined, modelConfig);
  let invokedConfig: LLMConfigCompatible | null = null;

  (agent as unknown as {
    llmClient: {
      invoke: (
        messages: unknown,
        config: LLMConfigCompatible,
      ) => Promise<{ content: string }>;
    };
  }).llmClient = {
    invoke: async (_messages, config) => {
      invokedConfig = config;
      return {
        content: JSON.stringify({
          strengths: ['SQL注入识别稳定'],
          weaknesses: ['路径遍历需要加强'],
          recommendations: ['复盘路径遍历输入边界'],
          nextTopics: ['路径遍历专项'],
        }),
      };
    },
  };

  const result = await agent.generateLearningPath({
    wrongQuestions: [makeQuestion('路径遍历')],
    correctQuestions: [makeQuestion('SQL注入')],
  });

  assert.equal(result.success, true);
  const capturedConfig = invokedConfig as LLMConfigCompatible | null;
  assert.ok(capturedConfig);
  assert.equal(capturedConfig.model, modelConfig.model);
  assert.equal(capturedConfig.temperature, modelConfig.temperature);
  assert.equal(capturedConfig.thinking, 'disabled');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
