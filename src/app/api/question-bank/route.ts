import { NextRequest, NextResponse } from 'next/server';
import {
  saveAssessmentResults,
  getAllQuestions,
  getRandomQuestions,
  getQuestionDetail,
  saveAiExplanation,
  getQuestionBankStats,
  setMasteryStatus,
  saveAnswerRecord,
  deleteQuestionForUser,
  getDistinctLanguages,
  getDistinctVulnerabilityTypes,
  resolveQuestionBankUserId,
} from '@/lib/question-bank/sqlite-store';
import type { QuestionFilters, MasteryStatus } from '@/lib/question-bank/sqlite-store';
import { shuffleQuestionOptions } from '@/lib/question-option-randomizer';
import { applyUserContext, resolveUserContext } from '@/lib/user-context';
import type { UserContext } from '@/lib/user-context';
import { getDocumentSections, isReadableKnowledgeTitle } from '@/lib/knowledge';
import {
  getStandardTypeFromLanguageLabel,
  STANDARD_INFO,
  type StandardType,
} from '@/lib/standards';

function normalizeForCoverage(value: string): string {
  return value.toLowerCase().replace(/[\s\-_/()（）,，.:：]/g, '');
}

function extractClauseNumber(standardReference?: string): string | undefined {
  return standardReference?.match(/\b\d+(?:\.\d+)+\b/)?.[0];
}

function shuffleQuestions<T>(questions: T[]): T[] {
  const copy = [...questions];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function resolveQuestionBankUserContext(userContext: UserContext): UserContext {
  const userId = resolveQuestionBankUserId(userContext.userId);

  if (userId === userContext.userId) {
    return userContext;
  }

  return {
    ...userContext,
    userId,
    isNew: true,
  };
}

/**
 * 计算每个标准的漏洞类型覆盖率：
 * 优先基于 standardReference 的具体条款号回溯到知识库子条款标题，
 * 避免因题目 language 展示值（如 C++ / C/C++）或 vulnerabilityType 写成父级分类
 * 而导致覆盖率统计偏低。
 */
function computeCoverageByStandard(userId: string): Record<string, { covered: number; total: number }> {
  const result: Record<string, { covered: number; total: number }> = {};
  const standardTypes: StandardType[] = ['java', 'cpp', 'csharp'];
  const answeredQuestions = getAllQuestions(userId).filter((question) => question.answerCount > 0);

  for (const type of standardTypes) {
    const sections = getDocumentSections(type);
    const vulnSections = sections.filter((s) => /^6\.2\.\d+$/.test(s.clauseNumber));
    if (vulnSections.length === 0) continue;

    const allTypes = vulnSections.flatMap((s) => s.childTitles.filter((t) => isReadableKnowledgeTitle(t)));
    const uniqueTypes = [...new Set(allTypes)];
    if (uniqueTypes.length === 0) continue;

    const clauseToType = new Map<string, string>();
    for (const section of vulnSections) {
      for (let i = 0; i < section.childClauses.length; i++) {
        const clause = section.childClauses[i];
        const title = section.childTitles[i];
        if (clause && title && isReadableKnowledgeTitle(title)) {
          clauseToType.set(clause, title);
        }
      }
    }

    const normalizedKnownTypes = new Map(uniqueTypes.map((t) => [normalizeForCoverage(t), t]));
    const normalizedCovered = new Set<string>();

    for (const question of answeredQuestions) {
      const standardType =
        getStandardTypeFromLanguageLabel(question.language) ||
        standardTypes.find((candidate) => question.standardReference?.includes(STANDARD_INFO[candidate].name));

      if (standardType !== type) continue;

      const clauseNumber = extractClauseNumber(question.standardReference);
      const canonicalType = (clauseNumber && clauseToType.get(clauseNumber)) || question.vulnerabilityType;
      if (!canonicalType) continue;

      normalizedCovered.add(normalizeForCoverage(canonicalType));
    }

    let coveredCount = 0;
    for (const normalizedKnown of normalizedKnownTypes.keys()) {
      if (normalizedCovered.has(normalizedKnown)) {
        coveredCount++;
      } else {
        // 模糊匹配：检查是否有包含关系
        for (const normalizedCoveredType of normalizedCovered) {
          if (normalizedCoveredType.includes(normalizedKnown) || normalizedKnown.includes(normalizedCoveredType)) {
            coveredCount++;
            break;
          }
        }
      }
    }

    result[type] = { covered: coveredCount, total: uniqueTypes.length };
  }

  return result;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const shuffleOptions = searchParams.get('shuffleOptions') === 'true';
    const randomOrder = searchParams.get('randomOrder') === 'true';
    const userContext = resolveQuestionBankUserContext(resolveUserContext(request));

    switch (action) {
      case 'stats': {
        const stats = getQuestionBankStats(userContext.userId);
        const languages = getDistinctLanguages();
        const vulnTypes = getDistinctVulnerabilityTypes();
        const coverage = computeCoverageByStandard(userContext.userId);
        return applyUserContext(NextResponse.json({ stats, languages, vulnTypes, coverage }), userContext);
      }

      case 'list': {
        const filters: QuestionFilters = {};
        const lang = searchParams.get('language');
        const vuln = searchParams.get('vulnerabilityType');
        const diff = searchParams.get('difficulty');
        const mastery = searchParams.get('masteryStatus');
        const isCorrectParam = searchParams.get('isCorrect');

        if (lang) filters.language = lang;
        if (vuln) filters.vulnerabilityType = vuln;
        if (diff) filters.difficulty = diff;
        if (mastery) filters.masteryStatus = mastery as MasteryStatus | 'all';
        if (isCorrectParam !== null) filters.isCorrect = isCorrectParam === 'true';

        const questions = getAllQuestions(userContext.userId, filters);
        const orderedQuestions = randomOrder ? shuffleQuestions(questions) : questions;
        const responseQuestions = shuffleOptions
          ? orderedQuestions.map((question) => shuffleQuestionOptions(question))
          : orderedQuestions;
        return applyUserContext(NextResponse.json({ questions: responseQuestions }), userContext);
      }

      case 'random': {
        const count = Math.min(Math.max(parseInt(searchParams.get('count') ?? '10', 10), 1), 50);
        const filters: QuestionFilters = {};
        const lang = searchParams.get('language');
        const vuln = searchParams.get('vulnerabilityType');
        const diff = searchParams.get('difficulty');
        const mastery = searchParams.get('masteryStatus');

        if (lang) filters.language = lang;
        if (vuln) filters.vulnerabilityType = vuln;
        if (diff) filters.difficulty = diff;
        if (mastery) filters.masteryStatus = mastery as MasteryStatus | 'all';
        if (searchParams.get('onlyWrong') === 'true') filters.isCorrect = false;

        const questions = getRandomQuestions(count, userContext.userId, filters);
        const responseQuestions = shuffleOptions
          ? questions.map((question) => shuffleQuestionOptions(question))
          : questions;
        return applyUserContext(NextResponse.json({ questions: responseQuestions }), userContext);
      }

      case 'detail': {
        const id = searchParams.get('id');
        if (!id) return applyUserContext(NextResponse.json({ error: '缺少 id' }, { status: 400 }), userContext);
        const detail = getQuestionDetail(id, userContext.userId);
        if (!detail) return applyUserContext(NextResponse.json({ error: '未找到题目' }, { status: 404 }), userContext);
        return applyUserContext(NextResponse.json({ detail }), userContext);
      }

      default:
        return applyUserContext(NextResponse.json({ error: '未知操作' }, { status: 400 }), userContext);
    }
  } catch (error) {
    console.error('[question-bank GET]', error);
    return NextResponse.json({ error: '服务暂时不可用' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as string;
    const userContext = resolveQuestionBankUserContext(resolveUserContext(request));

    switch (action) {
      case 'save': {
        const { answers, sessionId } = body as { answers: unknown; sessionId: unknown };
        if (!Array.isArray(answers) || typeof sessionId !== 'string') {
          return applyUserContext(NextResponse.json({ error: '缺少必要参数' }, { status: 400 }), userContext);
        }
        saveAssessmentResults(
          answers as Parameters<typeof saveAssessmentResults>[0],
          sessionId,
          userContext.userId,
        );
        return applyUserContext(NextResponse.json({ success: true }), userContext);
      }

      case 'saveExplanation': {
        const { questionId, content, promptTokens, completionTokens } = body as {
          questionId: unknown;
          content: unknown;
          promptTokens: unknown;
          completionTokens: unknown;
        };
        if (typeof questionId !== 'string' || typeof content !== 'string') {
          return applyUserContext(NextResponse.json({ error: '缺少必要参数' }, { status: 400 }), userContext);
        }
        saveAiExplanation(
          questionId,
          content,
          typeof promptTokens === 'number' ? promptTokens : 0,
          typeof completionTokens === 'number' ? completionTokens : 0,
          userContext.userId,
        );
        return applyUserContext(NextResponse.json({ success: true }), userContext);
      }

      case 'setMastery': {
        const { questionId, status } = body as { questionId: unknown; status: unknown };
        if (typeof questionId !== 'string' || typeof status !== 'string') {
          return applyUserContext(NextResponse.json({ error: '缺少必要参数' }, { status: 400 }), userContext);
        }
        const allowed: MasteryStatus[] = ['unreviewed', 'needs_review', 'mastered'];
        if (!allowed.includes(status as MasteryStatus)) {
          return applyUserContext(NextResponse.json({ error: '无效的状态值' }, { status: 400 }), userContext);
        }
        setMasteryStatus(questionId, status as MasteryStatus, userContext.userId);
        return applyUserContext(NextResponse.json({ success: true }), userContext);
      }

      case 'saveAnswer': {
        const { questionId, userAnswer, selectedOptionText, isCorrect, sessionId } = body as {
          questionId: unknown;
          userAnswer: unknown;
          selectedOptionText: unknown;
          isCorrect: unknown;
          sessionId: unknown;
        };
        if (
          typeof questionId !== 'string' ||
          typeof userAnswer !== 'number' ||
          typeof isCorrect !== 'boolean' ||
          typeof sessionId !== 'string'
        ) {
          return applyUserContext(NextResponse.json({ error: '缺少必要参数' }, { status: 400 }), userContext);
        }
        saveAnswerRecord(
          questionId,
          userAnswer,
          typeof selectedOptionText === 'string' ? selectedOptionText : null,
          isCorrect,
          sessionId,
          userContext.userId,
        );
        return applyUserContext(NextResponse.json({ success: true }), userContext);
      }

      default:
        return applyUserContext(NextResponse.json({ error: '未知操作' }, { status: 400 }), userContext);
    }
  } catch (error) {
    console.error('[question-bank POST]', error);
    return NextResponse.json({ error: '服务暂时不可用' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userContext = resolveQuestionBankUserContext(resolveUserContext(request));
    const id = searchParams.get('id');
    if (!id) {
      return applyUserContext(NextResponse.json({ error: '缺少 id' }, { status: 400 }), userContext);
    }

    const deleted = deleteQuestionForUser(id, userContext.userId);
    if (!deleted) {
      return applyUserContext(NextResponse.json({ error: '未找到题目' }, { status: 404 }), userContext);
    }

    return applyUserContext(NextResponse.json({ success: true }), userContext);
  } catch (error) {
    console.error('[question-bank DELETE]', error);
    return NextResponse.json({ error: '服务暂时不可用' }, { status: 500 });
  }
}
