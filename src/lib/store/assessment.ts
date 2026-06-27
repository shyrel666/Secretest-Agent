'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TokenUsage } from '@/lib/token-usage';
import type { AssessmentLanguage } from '@/lib/standards';
import type {
  ProjectAuditTaskType,
  ProjectEvidenceStep,
  ProjectId,
  ProjectSourceRef,
} from '@/lib/project-audit/types';

export const ASSESSMENT_STORE_KEY = 'assessment-store';

export interface AssessmentQuestion {
  id: string;
  code: string;
  language: 'Java' | 'C' | 'C++' | 'C#';
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  vulnerabilityType: string;
  standardReference: string;
  sourceProject?: ProjectId;
  auditTaskType?: ProjectAuditTaskType;
  findingSeedId?: string;
  variantOfFindingId?: string;
  sourceRefs?: ProjectSourceRef[];
  evidenceFlow?: ProjectEvidenceStep[];
}

export interface AssessmentAnswer {
  question: AssessmentQuestion;
  userAnswer: number;
  isCorrect: boolean;
}

export interface AssessmentLearningReport {
  learningPath: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    nextTopics: string[];
  };
}

export type AssessmentPhase = 'setup' | 'generating' | 'quiz' | 'result';

export interface GenerationStageState {
  label: string;
  detail: string;
  progress: number;
}

const ALLOWED_QUESTION_COUNTS = [3, 5, 8, 10] as const;
const ALLOWED_SOURCE_PROJECTS = ['all', 'YM_PT', 'itstec-24'] as const;
const ALLOWED_PROJECT_TASK_MODES = ['source', 'variant', 'mixed'] as const;
const ALLOWED_PROJECT_MODES = ['standard', 'project'] as const;

const INITIAL_GENERATION_STAGE: GenerationStageState = {
  label: '准备出题参数',
  detail: '正在初始化出题任务…',
  progress: 0,
};

function normalizeQuestionCount(value: number): number {
  return ALLOWED_QUESTION_COUNTS.includes(value as typeof ALLOWED_QUESTION_COUNTS[number]) ? value : 8;
}

function normalizeSourceProject(value: string): typeof ALLOWED_SOURCE_PROJECTS[number] {
  return (ALLOWED_SOURCE_PROJECTS as readonly string[]).includes(value)
    ? (value as typeof ALLOWED_SOURCE_PROJECTS[number])
    : 'all';
}

function normalizeProjectTaskMode(value: string): typeof ALLOWED_PROJECT_TASK_MODES[number] {
  return (ALLOWED_PROJECT_TASK_MODES as readonly string[]).includes(value)
    ? (value as typeof ALLOWED_PROJECT_TASK_MODES[number])
    : 'source';
}

function normalizeProjectMode(value: string): typeof ALLOWED_PROJECT_MODES[number] {
  return (ALLOWED_PROJECT_MODES as readonly string[]).includes(value)
    ? (value as typeof ALLOWED_PROJECT_MODES[number])
    : 'standard';
}

interface AssessmentState {
  phase: AssessmentPhase;
  questions: AssessmentQuestion[];
  currentQuestion: number;
  selectedAnswer: number | null;
  showResult: boolean;
  answers: AssessmentAnswer[];
  startTime: number;
  // 出题阶段的计时基准，持久化后跨页面导航不会丢失，避免返回时右上角计时从 0 重新开始
  generationStartTime: number | null;
  setupOptions: {
    language: AssessmentLanguage;
    totalQuestions: number;
    projectMode: 'standard' | 'project';
    sourceProject: 'all' | 'YM_PT' | 'itstec-24';
    projectTaskMode: 'source' | 'variant' | 'mixed';
  };
  explanation: string;
  generationStage: GenerationStageState;
  generationUsage: TokenUsage | null;
  explanationUsage: TokenUsage | null;
  learningReport: AssessmentLearningReport | null;
  learningReportSessionKey: string | null;
}

interface AssessmentActions {
  setPhase: (phase: AssessmentPhase) => void;
  setQuestions: (questions: AssessmentQuestion[]) => void;
  setCurrentQuestion: (index: number) => void;
  setSelectedAnswer: (answer: number | null) => void;
  setShowResult: (show: boolean) => void;
  addAnswer: (answer: AssessmentAnswer) => void;
  setStartTime: (time: number) => void;
  setGenerationStartTime: (time: number | null) => void;
  setSetupOptions: (updater: (prev: AssessmentState['setupOptions']) => AssessmentState['setupOptions']) => void;
  setExplanation: (explanation: string) => void;
  appendExplanation: (chunk: string) => void;
  setGenerationStage: (stage: GenerationStageState) => void;
  setGenerationUsage: (usage: TokenUsage | null) => void;
  setExplanationUsage: (usage: TokenUsage | null) => void;
  setLearningReportCache: (sessionKey: string, report: AssessmentLearningReport) => void;
  startQuizSession: (questions: AssessmentQuestion[], startTime: number) => void;
  reset: () => void;
}

const initialState: AssessmentState = {
  phase: 'setup',
  questions: [],
  currentQuestion: 0,
  selectedAnswer: null,
  showResult: false,
  answers: [],
  startTime: 0,
  generationStartTime: null,
  setupOptions: {
    language: 'mixed',
    totalQuestions: 8,
    projectMode: 'standard',
    sourceProject: 'all',
    projectTaskMode: 'source',
  },
  explanation: '',
  generationStage: INITIAL_GENERATION_STAGE,
  generationUsage: null,
  explanationUsage: null,
  learningReport: null,
  learningReportSessionKey: null,
};

export const useAssessmentStore = create<AssessmentState & AssessmentActions>()(
  persist(
    (set) => ({
      ...initialState,

      setPhase: (phase) => set({ phase }),
      setQuestions: (questions) => set({ questions }),
      setCurrentQuestion: (index) => set({ currentQuestion: index }),
      setSelectedAnswer: (answer) => set({ selectedAnswer: answer }),
      setShowResult: (show) => set({ showResult: show }),
      addAnswer: (answer) => set((state) => ({ answers: [...state.answers, answer] })),
      setStartTime: (time) => set({ startTime: time }),
      setGenerationStartTime: (time) => set({ generationStartTime: time }),
      setSetupOptions: (updater) => set((state) => {
        const nextOptions = updater(state.setupOptions);

        return {
          setupOptions: {
            ...nextOptions,
            totalQuestions: normalizeQuestionCount(nextOptions.totalQuestions),
            projectMode: normalizeProjectMode(nextOptions.projectMode || 'standard'),
            sourceProject: normalizeSourceProject(nextOptions.sourceProject || 'all'),
            projectTaskMode: normalizeProjectTaskMode(nextOptions.projectTaskMode || 'source'),
          },
        };
      }),
      setExplanation: (explanation) => set({ explanation }),
      appendExplanation: (chunk) => set((state) => ({ explanation: state.explanation + chunk })),
      setGenerationStage: (stage) => set({ generationStage: stage }),
      setGenerationUsage: (usage) => set({ generationUsage: usage }),
      setExplanationUsage: (usage) => set({ explanationUsage: usage }),
      setLearningReportCache: (sessionKey, report) => set({
        learningReport: report,
        learningReportSessionKey: sessionKey,
      }),
      startQuizSession: (questions, startTime) => set({
        phase: 'quiz',
        questions,
        currentQuestion: 0,
        selectedAnswer: null,
        showResult: false,
        answers: [],
        startTime,
        generationStartTime: null,
        explanation: '',
        explanationUsage: null,
        learningReport: null,
        learningReportSessionKey: null,
      }),
      reset: () => set(initialState),
    }),
    {
      name: ASSESSMENT_STORE_KEY,
      skipHydration: true,
      // 如果页面是在 generating 阶段被离开的，恢复时退回 setup
      onRehydrateStorage: () => (state) => {
        if (state?.phase === 'generating') {
          state.phase = 'setup';
          state.generationStage = INITIAL_GENERATION_STAGE;
          state.generationStartTime = null;
        }

        if (state?.setupOptions) {
          state.setupOptions.totalQuestions = normalizeQuestionCount(state.setupOptions.totalQuestions);
          state.setupOptions.projectMode = normalizeProjectMode(state.setupOptions.projectMode || 'standard');
          state.setupOptions.sourceProject = normalizeSourceProject(state.setupOptions.sourceProject || 'all');
          state.setupOptions.projectTaskMode = normalizeProjectTaskMode(state.setupOptions.projectTaskMode || 'source');
        }
      },
    },
  ),
);
