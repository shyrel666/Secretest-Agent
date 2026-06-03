'use client';

import Link from 'next/link';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TokenUsage } from '@/lib/token-usage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { 
  Trophy, 
  Target, 
  Clock, 
  CheckCircle, 
  Copy,
  Download,
  XCircle,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Award,
  Sparkles,
  FileCode,
  AlertTriangle,
  Loader2,
  Brain,
  BookOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

const AssessmentMarkdownRenderer = dynamic(
  () => import('@/components/assessment/assessment-markdown').then((m) => ({ default: m.AssessmentMarkdownRenderer })),
  { loading: () => <div className="text-sm text-muted-foreground">渲染中...</div> },
);

const difficultyConfig = {
  easy: { label: '简单', color: 'text-green-400', bgColor: 'bg-green-400/10' },
  medium: { label: '中等', color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
  hard: { label: '困难', color: 'text-rose-400', bgColor: 'bg-rose-400/10' },
};

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

  // 仅 UI 瞬态状态（无需跨页面保留）
  const [isExplaining, setIsExplaining] = useState(false);
  const [showFullExplanation, setShowFullExplanation] = useState(false);
  const [learningReport, setLearningReport] = useState<LearningReport | null>(null);
  const [learningReportStatus, setLearningReportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [learningReportError, setLearningReportError] = useState('');
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);

  // 答题阶段每秒计时
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'quiz') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'generating' && generationStartTime === null) {
      setGenerationStartTime(Date.now());
    }
    if (phase !== 'generating') {
      setGenerationStartTime(null);
    }
  }, [phase, generationStartTime]);
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
  }, [availableKnowledgeTypes, hasCppKnowledge, hasCsharpKnowledge, hasJavaKnowledge, hasMixedKnowledge, setupOptions.language, setSetupOptions]);

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
          configs: {
            questionGenerator: questionGeneratorConfig,
            reviewer: reviewerConfig,
          },
          assessmentGeneration,
          connectionConfig,
        }),
      });

      if (!qResponse.ok) {
        throw new Error('题目生成请求失败');
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
            setGenerationStage(data.stage);
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

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processSseLine(line);
        }
      }

      if (buffer.trim()) {
        processSseLine(buffer.trim());
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
    }
  }, [addUsageRecord, setupOptions, focusVulnerabilityType, setPhase, setGenerationStage, setGenerationUsage, startQuizSession]);

  // 获取讲解
  const getExplanation = useCallback(async (q: Question, answer: number, correct: boolean) => {
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

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processSseLine(line);
        }
      }

      // 流结束后，处理最后一行（可能没有换行符）
      if (buffer.trim()) {
        processSseLine(buffer.trim());
      }
    } catch (error) {
      console.error('Explanation error:', error);
    } finally {
      setIsExplaining(false);
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
    resetAssessment();
    setShowFullExplanation(false);
    setIsExplanationCopied(false);
  };

  const elapsedMinutes = Math.floor((now - startTime) / 60000);
  const elapsedSeconds = Math.floor(((now - startTime) % 60000) / 1000);

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
    const learningPath = learningReport?.learningPath;

    return (
      <div className="min-h-screen py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="text-center">
            <CardContent className="py-12">
              <div className={cn(
                'w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center',
                passed ? 'bg-green-400/10' : 'bg-rose-400/10'
              )}>
                {passed ? (
                  <Award className="w-12 h-12 text-green-400" />
                ) : (
                  <Target className="w-12 h-12 text-rose-400" />
                )}
              </div>

              <h1 className="text-3xl font-bold mb-2">
                {passed ? '恭喜通过！' : '继续努力！'}
              </h1>
              <p className="text-muted-foreground mb-8">
                {passed 
                  ? '你已具备良好的代码安全审计能力' 
                  : '建议继续学习后再次挑战'}
              </p>

              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-muted rounded-xl p-4">
                  <div className="text-3xl font-bold text-primary">{score}%</div>
                  <div className="text-sm text-muted-foreground">得分</div>
                </div>
                <div className="bg-muted rounded-xl p-4">
                  <div className="text-3xl font-bold text-green-400">{correctCount}</div>
                  <div className="text-sm text-muted-foreground">正确</div>
                </div>
                <div className="bg-muted rounded-xl p-4">
                  <div className="text-3xl font-foreground">{answers.length - correctCount}</div>
                  <div className="text-sm text-muted-foreground">错误</div>
                </div>
              </div>

              {learningReportStatus !== 'idle' && (
                <div className="mb-8 rounded-2xl border border-border/60 bg-background/70 p-5 text-left">
                  <div className="mb-4 flex items-center gap-2">
                    {learningReportStatus === 'loading' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : learningReportStatus === 'error' ? (
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                    ) : (
                      <Sparkles className="h-5 w-5 text-primary" />
                    )}
                    <h3 className="font-semibold">Agent 学习报告</h3>
                  </div>

                  {learningReportStatus === 'loading' && (
                    <p className="text-sm leading-6 text-muted-foreground">
                      正在结合本次答题记录生成学习报告，分数和答题回顾可先查看。
                    </p>
                  )}

                  {learningReportStatus === 'error' && (
                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                      <p className="text-sm font-medium text-amber-300">学习报告暂时不可用</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {learningReportError || '本次测评结果已保留，可继续查看答题回顾和本地学习建议。'}
                      </p>
                    </div>
                  )}

                  {learningReportStatus === 'success' && learningPath && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <LearningPathList
                        title="掌握较好"
                        items={learningPath.strengths}
                        fallback="本次报告暂未识别出明确优势。"
                      />
                      <LearningPathList
                        title="薄弱点"
                        items={learningPath.weaknesses}
                        fallback="本次报告暂未识别出明确薄弱点。"
                      />
                      <LearningPathList
                        title="学习建议"
                        items={learningPath.recommendations}
                        fallback="暂无额外学习建议。"
                      />
                      <LearningPathList
                        title="下一步主题"
                        items={learningPath.nextTopics}
                        fallback="暂无下一步主题建议。"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Answer Review */}
              <div className="text-left mb-8">
                <h3 className="font-semibold mb-4">答题回顾</h3>
                <div className="space-y-3">
                  {answers.map((answer, i) => (
                    <div 
                      key={i}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg',
                        answer.isCorrect ? 'bg-green-400/10' : 'bg-rose-400/10'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {answer.isCorrect ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-400" />
                        )}
                        <span className="text-sm">
                          第{i + 1}题：{answer.question.vulnerabilityType}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {answer.question.language}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {weakTopics.length > 0 && (
                <div className="mb-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left">
                  <div className="mb-4 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">建议优先回到这些章节继续学</h3>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {weakTopics.map((topic) => (
                      <Link key={topic.id} href={`/learning/${topic.id}`}>
                        <div className="rounded-xl border border-border/60 bg-background/70 p-4 transition-colors hover:border-primary/40">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant="secondary">{getLanguageLabel(topic.language)}</Badge>
                            <Badge variant="outline">{topic.vulnerabilityFocus}</Badge>
                          </div>
                          <div className="font-medium">{topic.title}</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{topic.summary}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 justify-center">
                <Button size="lg" onClick={handleRestart} className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  重新测试
                </Button>
                <Link href="/practice">
                  <Button variant="outline" size="lg" className="gap-2">
                    <Brain className="w-4 h-4" />
                    去题库练习
                  </Button>
                </Link>
                <Link href="/learning">
                  <Button variant="outline" size="lg">
                    <BookOpen className="w-4 h-4 mr-2" />
                    返回学习中心
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Quiz Phase
  if (!question) return null;

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-400/10">
                <Trophy className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">能力测评</h1>
                <p className="text-sm text-muted-foreground">
                  AI智能生成 · 多Agent审核
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {elapsedMinutes}:{elapsedSeconds.toString().padStart(2, '0')}
              </div>
              <div className="flex items-center gap-1">
                <Target className="w-4 h-4" />
                {currentQuestion + 1} / {questions.length}
              </div>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          {/* Question Index Dots */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {questions.map((_, idx) => {
              const isAnswered = idx < answers.length;
              const isCurrent = idx === currentQuestion;
              const isCorrect = isAnswered && answers[idx].isCorrect;
              return (
                <button
                  key={idx}
                  onClick={() => (isAnswered || idx === answers.length) && navigateToQuestion(idx)}
                  disabled={!isAnswered && idx !== answers.length}
                  className={cn(
                    'h-7 w-7 rounded-md text-xs font-medium transition-all',
                    isCurrent && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                    isAnswered && isCorrect && 'bg-green-400/20 text-green-400',
                    isAnswered && !isCorrect && 'bg-rose-400/20 text-rose-400',
                    !isAnswered && idx === answers.length && 'bg-muted text-muted-foreground hover:bg-muted/80',
                    !isAnswered && idx !== answers.length && 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed',
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={cn(difficultyConfig[question.difficulty].bgColor, difficultyConfig[question.difficulty].color)}>
                  {difficultyConfig[question.difficulty].label}
                </Badge>
                <Badge variant="outline">{question.language}</Badge>
                {/* <Badge variant="outline" className="text-xs">
                  {question.vulnerabilityType}
                </Badge> */}
              </div>
              {question.standardReference && (
                <Badge variant="secondary" className="text-xs">
                  {question.standardReference}
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg mt-4">{question.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Code Block */}
            <div className="relative">
              <div className="absolute top-2 right-2">
                <FileCode className="w-4 h-4 text-muted-foreground" />
              </div>
              <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto font-mono">
                {question.code}
              </pre>
            </div>

            {/* Options */}
            <RadioGroup
              value={selectedAnswer?.toString()}
              onValueChange={(v) => handleAnswer(parseInt(v))}
              className="space-y-3"
            >
              {question.options.map((option, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-center space-x-3 p-4 rounded-lg border transition-colors cursor-pointer',
                    selectedAnswer === index && 'border-primary bg-primary/5',
                    showResult && index === question.correctAnswer && 'border-green-400 bg-green-400/10',
                    showResult && selectedAnswer === index && index !== question.correctAnswer && 'border-rose-400 bg-rose-400/10'
                  )}
                  onClick={() => !showResult && setSelectedAnswer(index)}
                >
                  <RadioGroupItem value={index.toString()} id={`option-${index}`} disabled={showResult} />
                  <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">
                    {option}
                  </Label>
                  {showResult && index === question.correctAnswer && (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  )}
                  {showResult && selectedAnswer === index && index !== question.correctAnswer && (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                </div>
              ))}
            </RadioGroup>

            {/* Explanation */}
            {showResult && (
              <div className="space-y-4">
                {/* Base Explanation */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm mb-1">基础解析</h4>
                      <p className="text-sm text-muted-foreground">{question.explanation}</p>
                    </div>
                  </div>
                </div>

                {/* AI Explanation */}
                {(explanation || isExplaining) && (
                  <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Brain className="w-5 h-5 text-primary" />
                        <span>AI 详细讲解已生成，建议在弹窗中阅读</span>
                        {isExplaining && (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        )}
                      </div>
                      <Button type="button" variant="outline" onClick={() => setShowFullExplanation(true)}>
                        查看详细讲解
                      </Button>
                    </div>

                    {currentRelatedTopics.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-background/70 p-4 text-left">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <BookOpen className="h-4 w-4 text-primary" />
                          对应学习章节
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {currentRelatedTopics.map((topic) => (
                            <Link key={topic.id} href={`/learning/${topic.id}`}>
                              <div className="rounded-lg border border-border/60 p-3 transition-colors hover:border-primary/40">
                                <div className="mb-2 flex items-center gap-2">
                                  <Badge variant="secondary">{getLanguageLabel(topic.language)}</Badge>
                                  <Badge variant="outline">{topic.vulnerabilityFocus}</Badge>
                                </div>
                                <div className="font-medium">{topic.title}</div>
                                <p className="mt-1 text-sm leading-6 text-muted-foreground">{topic.summary}</p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showFullExplanation} onOpenChange={setShowFullExplanation}>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl">
            <DialogHeader className="border-b px-6 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  AI详细讲解
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 pr-10">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleCopyExplanation}
                    disabled={!explanation}
                  >
                    <Copy className="h-4 w-4" />
                    {isExplanationCopied ? '已复制' : '复制讲解'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleDownloadExplanation}
                    disabled={!explanation}
                  >
                    <Download className="h-4 w-4" />
                    导出 Markdown
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-5">
              <AssessmentMarkdownRenderer content={explanation || '正在生成讲解...'} />
            </div>
          </DialogContent>
        </Dialog>

        {/* Actions */}
        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            {currentQuestion > 0 && (
              <Button variant="outline" onClick={handlePrev} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                上一题
              </Button>
            )}
            <div className="text-sm text-muted-foreground">
              {isReviewingPast ? (
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  回顾已答题目
                </span>
              ) : showResult ? (
                <span className="text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  {selectedAnswer === question.correctAnswer ? '回答正确！' : '答案已显示'}
                </span>
              ) : (
                '选择一个答案后继续'
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {isReviewingPast ? (
              <Button onClick={handleNext} className="gap-2">
                {currentQuestion < answers.length - 1 ? (
                  <>
                    下一题
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    继续答题
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            ) : !showResult ? (
              <Button 
                onClick={handleShowResult} 
                disabled={selectedAnswer === null}
              >
                提交答案
              </Button>
            ) : (
              <Button onClick={handleNext} className="gap-2">
                {currentQuestion < questions.length - 1 ? (
                  <>
                    下一题
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    完成测评
                    <Trophy className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LearningPathList({
  title,
  items,
  fallback,
}: {
  title: string;
  items: string[];
  fallback: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-2 text-sm font-medium text-foreground">{title}</div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="text-sm leading-6 text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">{fallback}</p>
      )}
    </div>
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
