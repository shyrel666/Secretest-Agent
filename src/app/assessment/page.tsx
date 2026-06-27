'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TokenUsage } from '@/lib/token-usage';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { getCombinedModelLabel, getModelDisplayName, useAIConfigStore } from '@/lib/store/ai-config';
import { findRelatedLearningTopics, type LearningTopic } from '@/lib/learning/topics';
import { useLearningProgressStore } from '@/lib/store/learning-progress';
import { getLanguageLabel, isStandardType, type AssessmentLanguage, type StandardType } from '@/lib/standards';
import { hasTokenUsage, sumTokenUsage } from '@/lib/token-usage';
import { useTokenUsageStore } from '@/lib/store/token-usage';
import { hasLearningReportContent } from '@/lib/assessment-report';
import {
  useAssessmentStore,
  type AssessmentQuestion as Question,
  type AssessmentLearningReport as LearningReport,
} from '@/lib/store/assessment';
import { AssessmentSetupWorkspace } from '@/components/assessment/assessment-setup-workspace';
import { GenerationAgentWorkspace } from '@/components/assessment/generation-agent-workspace';
import { QuizResultWorkspace } from '@/components/assessment/quiz-result-workspace';
import { QuizSessionWorkspace } from '@/components/assessment/quiz-session-workspace';

const GENERATION_FLOW_STAGES = [
  {
    key: 'setup',
    title: '准备出题参数',
    description: '读取模型配置、语言范围与出题约束',
  },
  {
    key: 'generation',
    title: '生成与审核题目',
    description: '检索知识库、生成候选题并审核质量',
  },
  {
    key: 'finalize',
    title: '整理题目结果',
    description: '汇总题目、记录消耗并进入答题界面',
  },
] as const;

const pendingLearningReportRequests = new Map<string, Promise<LearningReport>>();

function resolveGenerationStageKey(label: string): typeof GENERATION_FLOW_STAGES[number]['key'] {
  if (label.includes('准备')) return 'setup';
  if (label.includes('生成') || label.includes('审核') || label.includes('检索') || label.includes('补齐')) return 'generation';
  return 'finalize';
}

function AssessmentPageContent() {
  const searchParams = useSearchParams();
  const requestedLanguage = searchParams.get('language');
  const initialLanguage = requestedLanguage === 'java' || requestedLanguage === 'cpp' || requestedLanguage === 'csharp' || requestedLanguage === 'mixed'
    ? requestedLanguage
    : null;
  const focusVulnerabilityType = searchParams.get('focus')?.trim() || '';
  const focusTopicTitle = searchParams.get('topicTitle')?.trim() || '';

  // 持久化状态（Zustand store，跨页面保留）
  const phase = useAssessmentStore((s) => s.phase);
  const setPhase = useAssessmentStore((s) => s.setPhase);
  const questions = useAssessmentStore((s) => s.questions);
  const currentQuestion = useAssessmentStore((s) => s.currentQuestion);
  const setCurrentQuestion = useAssessmentStore((s) => s.setCurrentQuestion);
  const selectedAnswer = useAssessmentStore((s) => s.selectedAnswer);
  const setSelectedAnswer = useAssessmentStore((s) => s.setSelectedAnswer);
  const showResult = useAssessmentStore((s) => s.showResult);
  const setShowResult = useAssessmentStore((s) => s.setShowResult);
  const answers = useAssessmentStore((s) => s.answers);
  const addAnswer = useAssessmentStore((s) => s.addAnswer);
  const startTime = useAssessmentStore((s) => s.startTime);
  const explanation = useAssessmentStore((s) => s.explanation);
  const setExplanation = useAssessmentStore((s) => s.setExplanation);
  const appendExplanation = useAssessmentStore((s) => s.appendExplanation);
  const generationStage = useAssessmentStore((s) => s.generationStage);
  const setGenerationStage = useAssessmentStore((s) => s.setGenerationStage);
  const setGenerationUsage = useAssessmentStore((s) => s.setGenerationUsage);
  const setExplanationUsage = useAssessmentStore((s) => s.setExplanationUsage);
  const setupOptions = useAssessmentStore((s) => s.setupOptions);
  const setSetupOptions = useAssessmentStore((s) => s.setSetupOptions);
  const startQuizSession = useAssessmentStore((s) => s.startQuizSession);
  const cachedLearningReport = useAssessmentStore((s) => s.learningReport);
  const cachedLearningReportSessionKey = useAssessmentStore((s) => s.learningReportSessionKey);
  const setLearningReportCache = useAssessmentStore((s) => s.setLearningReportCache);
  const resetAssessment = useAssessmentStore((s) => s.reset);
  const generationStartTime = useAssessmentStore((s) => s.generationStartTime);
  const setGenerationStartTime = useAssessmentStore((s) => s.setGenerationStartTime);

  // 讲解流的中断控制器：切题/切页时 abort，避免离开后仍往 store 追加文本污染新视图
  const explanationAbortRef = useRef<AbortController | null>(null);
  // 出题流的中断控制器：切页或重新触发时 abort，避免旧请求完成后回写测评状态
  const generationAbortRef = useRef<AbortController | null>(null);

  // 仅 UI 瞬态状态（无需跨页面保留）
  const [isExplaining, setIsExplaining] = useState(false);
  const [showFullExplanation, setShowFullExplanation] = useState(false);
  const [learningReport, setLearningReport] = useState<LearningReport | null>(null);
  const [learningReportStatus, setLearningReportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [learningReportError, setLearningReportError] = useState('');

  // 答题阶段每秒计时
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'quiz') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // 出题计时基准由 generateQuestions 在进入 generating 阶段时写入 store 并持久化，
  // 跨页面导航返回时不会丢失；离开 generating 阶段时清理，避免残留过期时间戳。
  useEffect(() => {
    if (phase !== 'generating' && generationStartTime !== null) {
      setGenerationStartTime(null);
    }
  }, [phase, generationStartTime, setGenerationStartTime]);

  // 组件卸载（切到其他模块）时取消正在进行的流式请求，避免离开后仍往 store 追加文本
  useEffect(() => {
    return () => {
      explanationAbortRef.current?.abort();
      generationAbortRef.current?.abort();
    };
  }, []);
  const [isExplanationCopied, setIsExplanationCopied] = useState(false);
  const [availableKnowledgeTypes, setAvailableKnowledgeTypes] = useState<StandardType[]>([]);
  const [learningTopics, setLearningTopics] = useState<LearningTopic[]>([]);
  const setAssessmentRecommendation = useLearningProgressStore((state) => state.setAssessmentRecommendation);
  const addUsageRecord = useTokenUsageStore((state) => state.addRecord);

  // 仅在 setup 阶段且 URL 带有 language 参数时覆盖语言设置
  useEffect(() => {
    if (phase === 'setup' && initialLanguage) {
      setSetupOptions((prev) => ({ ...prev, language: initialLanguage }));
    }
  }, [initialLanguage, phase, setSetupOptions]);

  const question = questions[currentQuestion];
  const progress = questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0;
  const isReviewingPast = currentQuestion < answers.length;
  const hasJavaKnowledge = availableKnowledgeTypes.includes('java');
  const hasCppKnowledge = availableKnowledgeTypes.includes('cpp');
  const hasCsharpKnowledge = availableKnowledgeTypes.includes('csharp');
  const hasMixedKnowledge = availableKnowledgeTypes.length >= 2;
  const topicSource = learningTopics.length > 0 ? learningTopics : undefined;
  const currentRelatedTopics = question
    ? findRelatedLearningTopics({
        language: question.language,
        vulnerabilityType: question.vulnerabilityType,
        standardReference: question.standardReference,
        limit: 2,
        topics: topicSource,
      })
    : [];

  useEffect(() => {
    fetch('/api/learning/topics', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.topics)) {
          setLearningTopics(data.topics);
        }
      })
      .catch((err) => console.error('[learning topics load]', err));
  }, []);

  useEffect(() => {
    if (phase !== 'result' || answers.length === 0) {
      return;
    }

    const topicIds = Array.from(
      new Map(
        answers
          .filter((answer) => !answer.isCorrect)
          .flatMap((answer) =>
            findRelatedLearningTopics({
              language: answer.question.language,
              vulnerabilityType: answer.question.vulnerabilityType,
              standardReference: answer.question.standardReference,
              limit: 2,
              topics: topicSource,
            }),
          )
          .map((topic) => [topic.id, topic.id]),
      ).values(),
    );

    setAssessmentRecommendation(topicIds);
  }, [answers, phase, setAssessmentRecommendation, topicSource]);

  // 测评完成后自动将所有题目（含对错）存入题库数据库
  useEffect(() => {
    if (phase !== 'result' || answers.length === 0) return;
    const sessionId = `session_${startTime}`;
    fetch('/api/question-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', answers, sessionId }),
    }).catch((err) => console.error('[question-bank save]', err));
  }, [phase, answers, startTime]);

  useEffect(() => {
    if (phase !== 'result' || answers.length === 0) {
      setLearningReport(null);
      setLearningReportStatus('idle');
      setLearningReportError('');
      return;
    }

    let cancelled = false;
    const reportSessionKey = getLearningReportSessionKey(startTime, answers);

    if (
      cachedLearningReportSessionKey === reportSessionKey
      && hasLearningReportContent(cachedLearningReport)
    ) {
      setLearningReport(cachedLearningReport);
      setLearningReportStatus('success');
      setLearningReportError('');
      return;
    }

    const generateLearningReport = async () => {
      const { getAgentConfig, getConnectionConfig } = useAIConfigStore.getState();
      const explainerConfig = getAgentConfig('explainer');
      const connectionConfig = getConnectionConfig();

      setLearningReport(null);
      setLearningReportStatus('loading');
      setLearningReportError('');

      try {
        let request = pendingLearningReportRequests.get(reportSessionKey);

        if (!request) {
          request = (async () => {
            const response = await fetch('/api/agent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'generateReport',
                answers,
                configs: {
                  explainer: explainerConfig,
                },
                connectionConfig,
              }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok || !data?.success || !data.report) {
              throw new Error(data?.error || '学习报告生成失败');
            }

            const report = normalizeLearningReport(data.report);
            if (!report) {
              throw new Error('学习报告格式异常');
            }

            setLearningReportCache(reportSessionKey, report);

            if (data.usage && hasTokenUsage(data.usage)) {
              addUsageRecord({
                feature: 'report',
                action: '生成测评学习报告',
                modelId: explainerConfig.model,
                modelLabel: getModelDisplayName(explainerConfig.model),
                ...data.usage,
              });
            }

            return report;
          })().finally(() => {
            pendingLearningReportRequests.delete(reportSessionKey);
          });

          pendingLearningReportRequests.set(reportSessionKey, request);
        }

        const report = await request;

        if (cancelled) return;

        setLearningReport(report);
        setLearningReportStatus('success');
      } catch (error) {
        if (cancelled) return;

        console.error('[learning report]', error);
        setLearningReportStatus('error');
        setLearningReportError(error instanceof Error ? error.message : '学习报告生成失败');
      }
    };

    generateLearningReport();

    return () => {
      cancelled = true;
    };
  }, [
    addUsageRecord,
    answers,
    cachedLearningReport,
    cachedLearningReportSessionKey,
    phase,
    setLearningReportCache,
    startTime,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadKnowledgeTypes = async () => {
      try {
        const response = await fetch('/api/knowledge/documents');
        const data = await response.json();

        if (!cancelled && data.success && Array.isArray(data.documents)) {
          const nextTypes: StandardType[] = Array.from(
            new Set<StandardType>(
              data.documents
                .map((doc: { type?: string }) => doc.type)
                .filter((type: string): type is StandardType => isStandardType(type)),
            ),
          );
          setAvailableKnowledgeTypes(nextTypes);
        }
      } catch {
        if (!cancelled) {
          setAvailableKnowledgeTypes([]);
        }
      }
    };

    loadKnowledgeTypes();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // 真实项目源码模式仅支持 Java 项目（source_code/ 下均为 Java，后端也会强制 java）。
    // 无论知识库是否加载完成，都把语言锁定为 java，避免切页返回后顶部出题类型变成混合。
    if (setupOptions.projectMode === 'project') {
      if (setupOptions.language !== 'java') {
        setSetupOptions((prev) => ({ ...prev, language: 'java' }));
      }
      return;
    }

    // 知识库类型尚未加载完成时不做语言回退：availableKnowledgeTypes 是本组件 useState，
    // 切页返回时会重置为空。若此时按“未上传 Java 标准”降级，会把持久化的 java 误改成 mixed。
    if (availableKnowledgeTypes.length === 0) {
      return;
    }

    if (setupOptions.language === 'java' && !hasJavaKnowledge) {
      setSetupOptions((prev) => ({
        ...prev,
        language: getFallbackLanguage(availableKnowledgeTypes),
      }));
    }

    if (setupOptions.language === 'cpp' && !hasCppKnowledge) {
      setSetupOptions((prev) => ({
        ...prev,
        language: getFallbackLanguage(availableKnowledgeTypes),
      }));
    }

    if (setupOptions.language === 'csharp' && !hasCsharpKnowledge) {
      setSetupOptions((prev) => ({
        ...prev,
        language: getFallbackLanguage(availableKnowledgeTypes),
      }));
    }

    if (setupOptions.language === 'mixed' && !hasMixedKnowledge) {
      setSetupOptions((prev) => ({
        ...prev,
        language: getFallbackLanguage(availableKnowledgeTypes),
      }));
    }
  }, [availableKnowledgeTypes, hasCppKnowledge, hasCsharpKnowledge, hasJavaKnowledge, hasMixedKnowledge, setupOptions.language, setupOptions.projectMode, setSetupOptions]);

  const handleCopyExplanation = useCallback(async () => {
    if (!explanation) return;

    try {
      await navigator.clipboard.writeText(explanation);
      setIsExplanationCopied(true);
      window.setTimeout(() => setIsExplanationCopied(false), 2000);
    } catch (error) {
      console.error('Copy explanation error:', error);
    }
  }, [explanation]);

  const handleDownloadExplanation = useCallback(() => {
    if (!explanation) return;

    const blob = new Blob([explanation], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-explanation-question-${currentQuestion + 1}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [currentQuestion, explanation]);

  // 生成题目
  const generateQuestions = useCallback(async () => {
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    const isActiveGeneration = () => generationAbortRef.current === controller && !controller.signal.aborted;

    setGenerationStartTime(Date.now());
    setPhase('generating');
    setGenerationStage({
      label: '准备出题参数',
      detail: '正在读取模型配置与知识库状态…',
      progress: 8,
    });
    setGenerationUsage(null);

    // 获取相关Agent的配置
    const { getAgentConfig, getConnectionConfig } = useAIConfigStore.getState();
    const questionGeneratorConfig = getAgentConfig('questionGenerator');
    const reviewerConfig = getAgentConfig('reviewer');
    const connectionConfig = getConnectionConfig();
    const assessmentGeneration = useAIConfigStore.getState().getAssessmentGenerationConfig();

    try {
      const qResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateQuizSet',
          stream: true,
          language: setupOptions.language,
          totalQuestions: setupOptions.totalQuestions,
          vulnerabilityType: focusVulnerabilityType || undefined,
          sourceProject: setupOptions.projectMode !== 'standard' ? setupOptions.sourceProject : undefined,
          projectMode: setupOptions.projectMode !== 'standard' ? setupOptions.projectTaskMode : undefined,
          configs: {
            questionGenerator: questionGeneratorConfig,
            reviewer: reviewerConfig,
          },
          assessmentGeneration,
          connectionConfig,
        }),
        signal: controller.signal,
      });

      if (!qResponse.ok) {
        let message = '题目生成请求失败';
        try {
          const data = await qResponse.json();
          if (typeof data?.error === 'string' && data.error.trim()) {
            message = data.error;
          }
        } catch {
          // 保留默认错误信息
        }
        throw new Error(message);
      }

      const reader = qResponse.body?.getReader();
      if (!reader) {
        throw new Error('题目生成流不可用');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let qData: {
        success?: boolean;
        questions?: Question[];
        usage?: TokenUsage;
      } | null = null;
      let streamError = '';

      const processSseLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') return;

        try {
          const data = JSON.parse(payload);

          if (data.type === 'stage' && data.stage) {
            if (isActiveGeneration()) {
              setGenerationStage(data.stage);
            }
            return;
          }

          if (data.type === 'result' && data.result) {
            qData = data.result;
            return;
          }

          if (data.type === 'error' && data.error) {
            streamError = data.error;
          }
        } catch {
          // 忽略解析错误
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isActiveGeneration()) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processSseLine(line);
        }
      }

      if (isActiveGeneration() && buffer.trim()) {
        processSseLine(buffer.trim());
      }

      if (!isActiveGeneration()) {
        return;
      }

      if (streamError) {
        throw new Error(streamError);
      }

      const finalResult: {
        success?: boolean;
        questions?: Question[];
        usage?: TokenUsage;
      } = qData || {};
      const generatedQuestions: Question[] = Array.isArray(finalResult.questions) ? finalResult.questions : [];

      if (generatedQuestions.length > 0) {
        if (!isActiveGeneration()) {
          return;
        }

        setGenerationStage({
          label: '整理题目结果',
          detail: '正在汇总题目、记录消耗并进入测评…',
          progress: 95,
        });

        const nextUsage = finalResult.usage ? sumTokenUsage([finalResult.usage]) : null;
        setGenerationUsage(nextUsage);
        if (nextUsage && hasTokenUsage(nextUsage)) {
          addUsageRecord({
            feature: 'assessment',
            action: `生成${generatedQuestions.length}道测评题`,
            modelLabel: getCombinedModelLabel([questionGeneratorConfig.model, reviewerConfig.model]),
            ...nextUsage,
          });
        }
        const nextStartTime = Date.now();
        setGenerationStage({
          label: '完成',
          detail: '题目已准备完成，正在进入答题界面…',
          progress: 100,
        });
        toast.success('题目生成完成', {
          description: `已生成 ${generatedQuestions.length} 道题，可返回能力测评开始答题。`,
        });
        startQuizSession(generatedQuestions, nextStartTime);
        setShowFullExplanation(false);
        setIsExplanationCopied(false);
      } else {
        if (!isActiveGeneration()) {
          return;
        }

        setGenerationStage({
          label: '生成失败',
          detail: '没有生成出有效题目，正在返回设置页…',
          progress: 100,
        });
        toast.error('题目生成失败', {
          description: '请确保知识库中已导入标准文档',
        });
        setPhase('setup');
      }
    } catch (error) {
      if (controller.signal.aborted) {
        if (generationAbortRef.current === controller) {
          setGenerationStage({
            label: '生成已取消',
            detail: '出题请求已停止，正在返回设置页…',
            progress: 100,
          });
          setPhase('setup');
        }
        return;
      }

      console.error('Generate questions error:', error);
      const errorMessage = error instanceof Error ? error.message : '生成过程中出现异常，请稍后重试';
      setGenerationStage({
        label: '生成失败',
        detail: `${errorMessage}，正在返回设置页…`,
        progress: 100,
      });
      toast.error('题目生成失败', {
        description: errorMessage,
      });
      setPhase('setup');
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
    }
  }, [addUsageRecord, setupOptions, focusVulnerabilityType, setPhase, setGenerationStage, setGenerationUsage, setGenerationStartTime, startQuizSession]);

  // 获取讲解
  const getExplanation = useCallback(async (q: Question, answer: number, correct: boolean) => {
    // 取消上一次尚未完成的讲解流，避免新旧讲解文本交错写入 store
    explanationAbortRef.current?.abort();
    const controller = new AbortController();
    explanationAbortRef.current = controller;

    setIsExplaining(true);
    setExplanation('');
    setExplanationUsage(null);

    // 获取讲解Agent的配置
    const { getAgentConfig, getConnectionConfig } = useAIConfigStore.getState();
    const explainerConfig = getAgentConfig('explainer');
    const connectionConfig = getConnectionConfig();

    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          userAnswer: answer,
          isCorrect: correct,
          config: explainerConfig,
          connectionConfig,
        }),
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      const processSseLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') return;

        try {
          const data = JSON.parse(payload);
          if (data.type === 'usage' && data.usage) {
            setExplanationUsage(data.usage);
            addUsageRecord({
              feature: 'explain',
              action: `第${currentQuestion + 1}题详细讲解`,
              modelId: explainerConfig.model,
              modelLabel: getModelDisplayName(explainerConfig.model),
              ...data.usage,
            });
          } else if (data.content) {
            appendExplanation(data.content);
          }
        } catch {
          // 忽略解析错误
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // 主动取消后停止消费流，避免继续往 store 追加文本
        if (controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processSseLine(line);
        }
      }

      // 流结束后，处理最后一行（可能没有换行符）
      if (!controller.signal.aborted && buffer.trim()) {
        processSseLine(buffer.trim());
      }
    } catch (error) {
      // 主动取消（切题/切页）不算异常，静默退出
      if (controller.signal.aborted) return;
      console.error('Explanation error:', error);
    } finally {
      // 仅当本次请求仍是当前活跃的 controller 时才复位 isExplaining，
      // 否则说明已被新一轮讲解取代，状态交由新一轮管理
      if (explanationAbortRef.current === controller) {
        setIsExplaining(false);
        explanationAbortRef.current = null;
      }
    }
  }, [addUsageRecord, currentQuestion, appendExplanation, setExplanationUsage, setExplanation]);

  const handleAnswer = (value: number) => {
    if (!isReviewingPast) {
      setSelectedAnswer(value);
    }
  };

  const handleShowResult = () => {
    setShowResult(true);
    if (question && selectedAnswer !== null) {
      getExplanation(question, selectedAnswer, selectedAnswer === question.correctAnswer);
    }
  };

  const navigateToQuestion = (index: number) => {
    if (index < 0 || index > answers.length || index >= questions.length) return;
    // 切题时取消正在进行的讲解流，避免旧讲解继续往 store 追加文本污染新视图
    explanationAbortRef.current?.abort();
    setIsExplaining(false);
    setCurrentQuestion(index);
    if (index < answers.length) {
      // 回看已答题目
      setSelectedAnswer(answers[index].userAnswer);
      setShowResult(true);
      setExplanation('');
    } else {
      // 回到当前未答题目
      setSelectedAnswer(null);
      setShowResult(false);
      setExplanation('');
    }
    setShowFullExplanation(false);
    setIsExplanationCopied(false);
  };

  const handlePrev = () => {
    if (currentQuestion > 0) {
      navigateToQuestion(currentQuestion - 1);
    }
  };

  const handleNext = () => {
    // 进入下一题/完成测评前取消正在进行的讲解流
    explanationAbortRef.current?.abort();
    setIsExplaining(false);
    // 回看模式：直接前进
    if (isReviewingPast) {
      navigateToQuestion(currentQuestion + 1);
      return;
    }

    if (!question || selectedAnswer === null) return;

    // 保存答案
    addAnswer({
      question,
      userAnswer: selectedAnswer,
      isCorrect: selectedAnswer === question.correctAnswer,
    });

    // 重置状态
    setShowResult(false);
    setSelectedAnswer(null);
    setExplanation('');
    setShowFullExplanation(false);
    setIsExplanationCopied(false);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // 完成测评
      setPhase('result');
    }
  };

  const handleRestart = () => {
    explanationAbortRef.current?.abort();
    setIsExplaining(false);
    resetAssessment();
    setShowFullExplanation(false);
    setIsExplanationCopied(false);
  };

  const quizElapsedMs = Math.max(0, now - startTime);

  // Setup Phase — 与 Agent 工作区同壳配置页
  if (phase === 'setup') {
    return (
      <AssessmentSetupWorkspace
        flowStages={GENERATION_FLOW_STAGES}
        language={setupOptions.language}
        totalQuestions={setupOptions.totalQuestions}
        onLanguageChange={(value) => setSetupOptions((prev) => ({ ...prev, language: value }))}
        onQuestionCountChange={(count) => setSetupOptions((prev) => ({ ...prev, totalQuestions: count }))}
        onGenerate={generateQuestions}
        hasJavaKnowledge={hasJavaKnowledge}
        hasCppKnowledge={hasCppKnowledge}
        hasCsharpKnowledge={hasCsharpKnowledge}
        hasMixedKnowledge={hasMixedKnowledge}
        availableKnowledgeCount={availableKnowledgeTypes.length}
        focusTopicTitle={focusTopicTitle || undefined}
        focusVulnerabilityType={focusVulnerabilityType || undefined}
        projectMode={setupOptions.projectMode}
        projectTaskMode={setupOptions.projectTaskMode}
        onProjectModeChange={(mode) => setSetupOptions((prev) => ({ ...prev, projectMode: mode }))}
        onProjectTaskModeChange={(mode) => setSetupOptions((prev) => ({ ...prev, projectTaskMode: mode }))}
      />
    );
  }

  // Generating Phase — Agent 工作区
  if (phase === 'generating') {
    const activeStageKey = resolveGenerationStageKey(generationStage.label);

    return (
      <GenerationAgentWorkspace
        startTime={generationStartTime}
        stage={generationStage}
        activeStageKey={activeStageKey}
        flowStages={GENERATION_FLOW_STAGES}
        questionCount={setupOptions.totalQuestions}
        languageLabel={getLanguageLabel(setupOptions.language)}
      />
    );
  }

  // Result Phase
  if (phase === 'result') {
    const correctCount = answers.filter(a => a.isCorrect).length;
    const score = Math.round((correctCount / answers.length) * 100);
    const passed = score >= 60;
    const weakTopics = Array.from(
      new Map(
        answers
          .filter((answer) => !answer.isCorrect)
          .flatMap((answer) =>
            findRelatedLearningTopics({
              language: answer.question.language,
              vulnerabilityType: answer.question.vulnerabilityType,
              standardReference: answer.question.standardReference,
              limit: 2,
              topics: topicSource,
            }),
          )
          .map((topic) => [topic.id, topic]),
      ).values(),
    ).slice(0, 4);
    return (
      <QuizResultWorkspace
        answers={answers}
        score={score}
        passed={passed}
        correctCount={correctCount}
        learningReportStatus={learningReportStatus}
        learningReportError={learningReportError}
        learningReport={learningReport}
        weakTopics={weakTopics}
        onRestart={handleRestart}
      />
    );
  }

  // Quiz Phase
  if (!question) return null;

  return (
    <QuizSessionWorkspace
      question={question}
      questions={questions}
      answers={answers}
      currentQuestion={currentQuestion}
      selectedAnswer={selectedAnswer}
      showResult={showResult}
      isReviewingPast={isReviewingPast}
      progress={progress}
      elapsedMs={quizElapsedMs}
      explanation={explanation}
      isExplaining={isExplaining}
      showFullExplanation={showFullExplanation}
      onShowFullExplanationChange={setShowFullExplanation}
      isExplanationCopied={isExplanationCopied}
      relatedTopics={currentRelatedTopics}
      onSelectAnswer={handleAnswer}
      onNavigateQuestion={navigateToQuestion}
      onPrev={handlePrev}
      onShowResult={handleShowResult}
      onNext={handleNext}
      onCopyExplanation={handleCopyExplanation}
      onDownloadExplanation={handleDownloadExplanation}
    />
  );
}

function normalizeLearningReport(value: unknown): LearningReport | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const learningPath = (value as { learningPath?: unknown }).learningPath;
  if (!learningPath || typeof learningPath !== 'object') {
    return null;
  }

  return {
    learningPath: {
      strengths: normalizeReportItems((learningPath as { strengths?: unknown }).strengths),
      weaknesses: normalizeReportItems((learningPath as { weaknesses?: unknown }).weaknesses),
      recommendations: normalizeReportItems((learningPath as { recommendations?: unknown }).recommendations),
      nextTopics: normalizeReportItems((learningPath as { nextTopics?: unknown }).nextTopics),
    },
  };
}

function normalizeReportItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function getLearningReportSessionKey(
  startTime: number,
  answers: Array<{ question: { id: string }; userAnswer: number; isCorrect: boolean }>,
): string {
  if (startTime > 0) {
    return `session_${startTime}`;
  }

  return `answers_${answers
    .map((answer) => `${answer.question.id}:${answer.userAnswer}:${answer.isCorrect ? 1 : 0}`)
    .join('|')}`;
}

function getFallbackLanguage(availableTypes: StandardType[]): AssessmentLanguage {
  if (availableTypes.length >= 2) {
    return 'mixed';
  }

  return availableTypes[0] || 'mixed';
}

function AssessmentPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">正在加载测评页面</p>
          <p className="text-sm text-muted-foreground">正在恢复题目配置与当前作答状态。</p>
        </div>
      </div>
    </div>
  );
}

export default function AssessmentPage() {
  return (
    <Suspense fallback={<AssessmentPageFallback />}>
      <AssessmentPageContent />
    </Suspense>
  );
}
