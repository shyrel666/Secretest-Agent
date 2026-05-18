import { NextRequest, NextResponse } from 'next/server';
import { AgentOrchestrator, AgentsConfig } from '@/lib/agents/orchestrator';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { resolveUserContext } from '@/lib/user-context';
import { getAllQuestions, resolveQuestionBankUserId } from '@/lib/question-bank/sqlite-store';
import { getDocumentSections, isReadableKnowledgeTitle } from '@/lib/knowledge';
import {
  getStandardTypeFromLanguageLabel,
  STANDARD_INFO,
  type AssessmentLanguage,
  type StandardType,
} from '@/lib/standards';

function normalizeCoverageType(value?: string): string {
  return (value || '').toLowerCase().replace(/[\s\-_/()（）,，.:：]/g, '');
}

function extractClauseNumber(standardReference?: string): string | undefined {
  return standardReference?.match(/\b\d+(?:\.\d+)+\b/)?.[0];
}

function buildClauseTitleMap(standardType: StandardType): Map<string, string> {
  const clauseToTitle = new Map<string, string>();

  for (const section of getDocumentSections(standardType)) {
    if (!/^6\.2\.\d+$/.test(section.clauseNumber)) {
      continue;
    }

    for (let index = 0; index < section.childClauses.length; index++) {
      const clause = section.childClauses[index];
      const title = section.childTitles[index];

      if (clause && title && isReadableKnowledgeTitle(title)) {
        clauseToTitle.set(clause, title);
      }
    }
  }

  return clauseToTitle;
}

/**
 * 根据测评语言获取用户已覆盖的漏洞类型：
 * - 单语言（java/cpp/csharp）：只查该语言对应的 languageLabel
 * - mixed / undefined：查所有语言
 */
function resolveCoveredTypes(userId: string, assessmentLang?: AssessmentLanguage): string[] {
  const allowedStandardTypes = assessmentLang && assessmentLang !== 'mixed'
    ? new Set<StandardType>([assessmentLang])
    : null;
  const clauseMaps = new Map<StandardType, Map<string, string>>();
  const covered = new Map<string, string>();

  for (const question of getAllQuestions(userId).filter((item) => item.answerCount > 0)) {
    const standardType =
      getStandardTypeFromLanguageLabel(question.language) ||
      (Object.entries(STANDARD_INFO).find(([, info]) => question.standardReference?.includes(info.name))?.[0] as StandardType | undefined);

    if (!standardType || (allowedStandardTypes && !allowedStandardTypes.has(standardType))) {
      continue;
    }

    if (!clauseMaps.has(standardType)) {
      clauseMaps.set(standardType, buildClauseTitleMap(standardType));
    }

    const clauseNumber = extractClauseNumber(question.standardReference);
    const canonicalType = (clauseNumber && clauseMaps.get(standardType)?.get(clauseNumber)) || question.vulnerabilityType;
    const normalized = normalizeCoverageType(canonicalType);

    if (normalized) {
      covered.set(normalized, canonicalType);
    }
  }

  return Array.from(covered.values());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      action,
      language,
      difficulty,
      vulnerabilityType,
      excludedVulnerabilityTypes,
      totalQuestions,
      question,
      userAnswer,
      isCorrect,
      answers,
      configs, // 模型配置
      assessmentGeneration, // 测评生成性能配置
      connectionConfig, // SDK连接配置
      stream,
    } = body;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    
    // 使用传入的配置创建orchestrator
    const agentConfigs: AgentsConfig = configs || {};
    const orchestrator = new AgentOrchestrator(customHeaders, agentConfigs, connectionConfig, assessmentGeneration);

    // 解析用户身份，用于覆盖率追踪
    const rawUserCtx = resolveUserContext(request);
    const userCtx = {
      ...rawUserCtx,
      userId: resolveQuestionBankUserId(rawUserCtx.userId),
    };

    // 根据不同的action执行不同的操作
    switch (action) {
      case 'generateQuestion':
        // 生成单个审核通过的题目
        const qResult = await orchestrator.generateApprovedQuestion({
          language: language || 'mixed',
          difficulty: difficulty || 'mixed',
          vulnerabilityType,
          excludedVulnerabilityTypes: Array.isArray(excludedVulnerabilityTypes)
            ? excludedVulnerabilityTypes
            : [],
          maxRetries: 3,
        });

        if (qResult.success) {
          return NextResponse.json({
            success: true,
            question: qResult.question,
            reviewScore: qResult.reviewScore,
            usage: qResult.usage,
            citations: qResult.citations,
            grounding: qResult.grounding,
            retrievalTrace: qResult.retrievalTrace,
          });
        }
        return NextResponse.json(
          { error: qResult.error || '题目生成失败' },
          { status: 500 }
        );

      case 'generateQuizSet':
        if (stream) {
          const readableStream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              let closed = false;
              const handleAbort = () => {
                closed = true;
              };

              request.signal.addEventListener('abort', handleAbort, { once: true });

              const send = (payload: unknown): boolean => {
                if (closed) {
                  return false;
                }

                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                  return true;
                } catch (error) {
                  if (isClosedControllerError(error)) {
                    closed = true;
                    return false;
                  }

                  throw error;
                }
              };

              const safeClose = () => {
                if (closed) {
                  return;
                }

                closed = true;
                try {
                  controller.close();
                } catch {
                  // Ignore invalid state after disconnect
                }
              };

              (async () => {
                try {
                  if (!send({
                    type: 'stage',
                    stage: {
                      label: '准备出题参数',
                      detail: '正在读取模型配置与知识库状态…',
                      progress: 8,
                    },
                  })) {
                    return;
                  }

                  const streamedResult = await orchestrator.generateQuizSet({
                    totalQuestions: totalQuestions || 8,
                    language: language || 'mixed',
                    vulnerabilityType,
                    coveredVulnerabilityTypes: resolveCoveredTypes(userCtx.userId, language),
                    shouldAbort: () => closed || request.signal.aborted,
                    onStage: (stage) => {
                      send({ type: 'stage', stage });
                    },
                    onProgress: (current, total) => {
                      send({ type: 'progress', current, total });
                    },
                  });

                  if (streamedResult.success) {
                    send({
                      type: 'result',
                      result: {
                        success: true,
                        questions: streamedResult.questions,
                        usage: streamedResult.usage,
                        errors: streamedResult.errors,
                        citations: streamedResult.citations,
                        grounding: streamedResult.grounding,
                        retrievalTrace: streamedResult.retrievalTrace,
                      },
                    });
                  } else {
                    send({
                      type: 'error',
                      error: getPrimaryQuizGenerationError(streamedResult.errors),
                    });
                  }

                  safeClose();
                } catch (error) {
                  console.error('Agent quiz stream error:', error);
                  send({
                    type: 'error',
                    error: error instanceof Error ? error.message : '题目集生成失败',
                  });
                  safeClose();
                } finally {
                  request.signal.removeEventListener('abort', handleAbort);
                }
              })();
            },
            cancel() {
              // client disconnected
            },
          });

          return new Response(readableStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          });
        }

        // 生成一套测评题
        const setResult = await orchestrator.generateQuizSet({
          totalQuestions: totalQuestions || 8,
          language: language || 'mixed',
          vulnerabilityType,
          coveredVulnerabilityTypes: resolveCoveredTypes(userCtx.userId, language),
        });

        if (setResult.success) {
          return NextResponse.json({
            success: true,
            questions: setResult.questions,
            usage: setResult.usage,
            errors: setResult.errors,
            citations: setResult.citations,
            grounding: setResult.grounding,
            retrievalTrace: setResult.retrievalTrace,
          });
        }
        return NextResponse.json(
          { error: '题目集生成失败', errors: setResult.errors },
          { status: 500 }
        );

      case 'explainAnswer':
        // 讲解答题结果
        if (!question || userAnswer === undefined || isCorrect === undefined) {
          return NextResponse.json(
            { error: '缺少必要参数' },
            { status: 400 }
          );
        }

        const explainResult = await orchestrator.explainWrongAnswer({
          question,
          userAnswer,
          isCorrect,
        });

        if (explainResult.success) {
          return NextResponse.json({
            success: true,
            explanation: explainResult.explanation,
            relatedVulnerabilities: explainResult.relatedVulnerabilities,
            practiceSuggestions: explainResult.practiceSuggestions,
            usage: explainResult.usage,
            citations: explainResult.citations,
            grounding: explainResult.grounding,
            retrievalTrace: explainResult.retrievalTrace,
          });
        }
        return NextResponse.json(
          { error: explainResult.error || '讲解生成失败' },
          { status: 500 }
        );

      case 'generateReport':
        // 生成学习报告
        if (!answers || !Array.isArray(answers)) {
          return NextResponse.json(
            { error: '缺少答题数据' },
            { status: 400 }
          );
        }

        const reportResult = await orchestrator.generateLearningReport({ answers });

        if (reportResult.success && reportResult.report) {
          return NextResponse.json({
            success: true,
            report: reportResult.report,
            usage: reportResult.usage,
          });
        }
        return NextResponse.json(
          { error: reportResult.error || '报告生成失败' },
          { status: 500 }
        );

      default:
        return NextResponse.json(
          { error: '未知操作类型' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

function isClosedControllerError(error: unknown): boolean {
  return error instanceof TypeError
    && (/Invalid state/i.test(error.message) || /already closed/i.test(error.message));
}

function getPrimaryQuizGenerationError(errors?: string[]): string {
  if (!errors?.length) {
    return '题目集生成失败';
  }

  return errors.find((error) => error.includes('题目数量不足'))
    || errors[errors.length - 1]
    || '题目集生成失败';
}
