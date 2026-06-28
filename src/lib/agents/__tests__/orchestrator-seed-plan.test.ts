import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentOrchestrator, resolveProjectQuizMode } from '@/lib/agents/orchestrator';
import { buildSeedPlan, getDifficultyForIndex } from '@/lib/agents/seed-plan';

describe('buildSeedPlan', () => {
  it('always creates one seed slot per requested question', () => {
    const plan = buildSeedPlan(3, [{ title: 'A', clauseNumber: '6.2.1' }]);
    assert.equal(plan.length, 3);
    assert.equal(plan.every((entry) => entry.count === 1), true);
  });

  it('pads missing coverage targets with undefined target slots', () => {
    const plan = buildSeedPlan(3, []);
    assert.equal(plan.length, 3);
    assert.equal(plan[0].target, undefined);
    assert.equal(plan[1].target, undefined);
    assert.equal(plan[2].target, undefined);
  });

  it('anchors each slot to the coverage target at the same index', () => {
    const targets = [{ title: 'A' }, { title: 'B' }];
    const plan = buildSeedPlan(3, targets);
    assert.equal(plan[0].target, targets[0]);
    assert.equal(plan[1].target, targets[1]);
    assert.equal(plan[2].target, undefined);
  });
});

describe('getDifficultyForIndex', () => {
  it('splits 10 questions into easy / medium / hard buckets', () => {
    const difficulties = Array.from({ length: 10 }, (_, index) => getDifficultyForIndex(index, 10));
    assert.deepEqual(difficulties, [
      'easy', 'easy', 'easy',
      'medium', 'medium', 'medium', 'medium', 'medium',
      'hard', 'hard',
    ]);
  });
});

describe('resolveProjectQuizMode', () => {
  it('keeps standard-only generation inactive when sourceProject is omitted', () => {
    const result = resolveProjectQuizMode({ language: 'java' });
    assert.equal(result.success, true);
    assert.equal(result.isProjectModeActive, false);
    assert.equal(result.sourceProject, undefined);
  });

  it('activates project mode only for an explicit sourceProject', () => {
    const result = resolveProjectQuizMode({ language: 'java', sourceProject: 'all', projectMode: 'source' });
    assert.equal(result.success, true);
    assert.equal(result.isProjectModeActive, true);
    assert.equal(result.sourceProject, 'all');
  });

  it('rejects unknown project ids and non-Java source project requests', () => {
    const unknownProject = resolveProjectQuizMode({ language: 'java', sourceProject: 'bad-project' });
    assert.equal(unknownProject.success, false);
    assert.match(unknownProject.error || '', /sourceProject/);

    const cppProject = resolveProjectQuizMode({ language: 'cpp', sourceProject: 'YM_PT' });
    assert.equal(cppProject.success, false);
    assert.match(cppProject.error || '', /Java/);
  });
});

describe('AgentOrchestrator generateQuizSet', () => {
  it('batch-generates standard quiz candidates in one model call for small quizzes', async () => {
    const orchestrator = new AgentOrchestrator(undefined, {}, undefined, {
      fastReview: true,
      reviewConcurrency: 3,
    });
    const mocked = orchestrator as unknown as {
      questionGenerator: {
        generateQuestion: (params: { count?: number }) => Promise<{
          success: true;
          questions: Array<{
            id: string;
            code: string;
            language: 'Java';
            question: string;
            options: string[];
            correctAnswer: number;
            explanation: string;
            difficulty: 'medium';
            vulnerabilityType: string;
            standardReference: string;
          }>;
          usage: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            estimated: boolean;
          };
        }>;
      };
      reviewerAgent: {
        reviewAndFix: (question: unknown) => Promise<{ success: true; question: unknown }>;
      };
    };
    const requestedCounts: number[] = [];

    mocked.questionGenerator = {
      generateQuestion: async (params) => {
        const count = params.count || 1;
        requestedCounts.push(count);
        return {
          success: true,
          questions: Array.from({ length: count }, (_, index) => ({
            id: `q-batch-${index}`,
            code: `public class Demo${index} { public String handle(String input) { return input + "${index}"; } }`,
            language: 'Java',
            question: `第 ${index + 1} 道题的问题描述足够长`,
            options: [`风险 ${index}`, `干扰 A ${index}`, `干扰 B ${index}`, `干扰 C ${index}`],
            correctAnswer: 0,
            explanation: `这是第 ${index + 1} 道题的解析，引用标准并说明代码证据。`,
            difficulty: 'medium',
            vulnerabilityType: `漏洞类型 ${index}`,
            standardReference: 'GB/T 34944-2017 6.2.3.4',
          })),
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            estimated: true,
          },
        };
      },
    };
    mocked.reviewerAgent = {
      reviewAndFix: async (question) => ({
        success: true,
        question,
      }),
    };

    const result = await orchestrator.generateQuizSet({
      totalQuestions: 3,
      language: 'java',
    });

    assert.equal(result.success, true);
    assert.equal(result.questions?.length, 3);
    assert.deepEqual(requestedCounts, [3]);
  });

  it('uses the question generator model for source-project questions', async () => {
    const orchestrator = new AgentOrchestrator(undefined, {}, undefined, {
      fastReview: true,
      reviewConcurrency: 3,
    });
    const mocked = orchestrator as unknown as {
      questionGenerator: {
        generateQuestion: (params: {
          difficulty?: 'easy' | 'medium' | 'hard';
          projectSeed?: {
            seed: {
              id: string;
              projectId: 'YM_PT' | 'itstec-24';
              vulnerabilityType: string;
              standardReference: string;
              sourceRefs: unknown[];
              evidenceFlow: unknown[];
            };
            taskType: 'identify' | 'trace' | 'fix' | 'falsePositive' | 'variant';
          };
        }) => Promise<{
          success: true;
          questions: Array<{
            id: string;
            code: string;
            language: 'Java';
            question: string;
            options: string[];
            correctAnswer: number;
            explanation: string;
            difficulty: 'easy' | 'medium' | 'hard';
            vulnerabilityType: string;
            standardReference: string;
            sourceProject?: 'YM_PT' | 'itstec-24';
            auditTaskType?: 'identify' | 'trace' | 'fix' | 'falsePositive' | 'variant';
            findingSeedId?: string;
            sourceRefs?: unknown[];
            evidenceFlow?: unknown[];
          }>;
        }>;
      };
      reviewerAgent: {
        reviewAndFix: (question: unknown) => Promise<{ success: true; question: unknown }>;
      };
    };
    let generateCalls = 0;
    const seedIds: string[] = [];

    mocked.questionGenerator = {
      generateQuestion: async (params) => {
        generateCalls += 1;
        const seed = params.projectSeed?.seed;
        if (seed) {
          seedIds.push(seed.id);
        }
        return {
          success: true,
          questions: [{
            id: `project-llm-${generateCalls}`,
            code: `public class Demo${generateCalls} { public String handle${generateCalls}(String input) { return input == null ? "${generateCalls}" : input.trim() + "${seed?.id || generateCalls}"; } }`,
            language: 'Java',
            question: `请审查第 ${generateCalls} 个真实项目片段并选择最合适的安全结论。`,
            options: [`审计结论 A${generateCalls}`, `审计结论 B${generateCalls}`, `审计结论 C${generateCalls}`, `审计结论 D${generateCalls}`],
            correctAnswer: 0,
            explanation: `基于项目 ${seed?.projectId || 'YM_PT'} 的真实源码证据和标准条款进行判断。`,
            difficulty: params.difficulty || 'medium',
            vulnerabilityType: seed?.vulnerabilityType || '项目源码风险',
            standardReference: seed?.standardReference || 'GB/T 34944-2017 6.2.3.4',
            sourceProject: seed?.projectId,
            auditTaskType: params.projectSeed?.taskType,
            findingSeedId: seed?.id,
            sourceRefs: seed?.sourceRefs,
            evidenceFlow: seed?.evidenceFlow,
          }],
        };
      },
    };
    mocked.reviewerAgent = {
      reviewAndFix: async (question) => ({
        success: true,
        question,
      }),
    };

    const result = await orchestrator.generateQuizSet({
      totalQuestions: 3,
      language: 'java',
      sourceProject: 'all',
      projectMode: 'source',
    });

    assert.equal(result.success, true, result.errors?.join('；'));
    assert.equal(result.questions?.length, 3);
    assert.equal(generateCalls, 3);
    assert.equal(seedIds.length, 3);
    assert.equal(result.questions?.every((question) => question.sourceProject && question.findingSeedId), true);
  });

  it('bounds project supplement attempts when project questions cannot be generated', async () => {
    const orchestrator = new AgentOrchestrator(undefined, {}, undefined, {
      fastReview: true,
      reviewConcurrency: 3,
    });
    const mocked = orchestrator as unknown as {
      questionGenerator: {
        generateQuestion: () => Promise<{
          success: false;
          error: string;
          usage: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            estimated: boolean;
          };
        }>;
      };
      reviewerAgent: {
        reviewAndFix: (question: unknown) => Promise<{ success: true; question: unknown }>;
      };
    };
    let generateCalls = 0;
    const stageDetails: string[] = [];
    const usageEvents: number[] = [];

    mocked.questionGenerator = {
      generateQuestion: async () => {
        generateCalls += 1;
        return {
          success: false,
          error: 'mock generation failed',
          usage: {
            promptTokens: 1,
            completionTokens: 0,
            totalTokens: 1,
            estimated: true,
          },
        };
      },
    };
    mocked.reviewerAgent = {
      reviewAndFix: async (question) => ({
        success: true,
        question,
      }),
    };

    const result = await orchestrator.generateQuizSet({
      totalQuestions: 3,
      language: 'java',
      sourceProject: 'all',
      projectMode: 'variant',
      onStage: (stage) => {
        stageDetails.push(stage.detail);
      },
      onUsage: (usage) => {
        usageEvents.push(usage.totalTokens);
      },
    });

    assert.equal(result.success, false);
    assert.equal(generateCalls, 15);
    assert.equal(result.usage?.totalTokens, 15);
    assert.deepEqual(usageEvents, Array.from({ length: 15 }, () => 1));
    assert.match(result.errors?.join('；') || '', /题目数量不足/);
    assert.equal(stageDetails.some((detail) => detail.includes('放宽类型限制')), false);
    assert.equal(stageDetails.some((detail) => detail.includes('正在补第 1/3 道项目源码题')), true);
  });
});
