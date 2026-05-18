'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TokenUsage } from '@/lib/token-usage';
import type { AssessmentLanguage } from '@/lib/standards';

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

const INITIAL_GENERATION_STAGE: GenerationStageState = {
  label: '准备出题参数',
  detail: '正在初始化出题任务…',
  progress: 0,
};

function normalizeQuestionCount(value: number): number {
  return ALLOWED_QUESTION_COUNTS.includes(value as typeof ALLOWED_QUESTION_COUNTS[number]) ? value : 8;
}

interface AssessmentState {
  phase: AssessmentPhase;
  questions: AssessmentQuestion[];
  currentQuestion: number;
  selectedAnswer: number | null;
  showResult: boolean;
  answers: AssessmentAnswer[];
  startTime: number;
  setupOptions: { language: AssessmentLanguage; totalQuestions: number };
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
  setupOptions: { language: 'mixed', totalQuestions: 8 },
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
      setSetupOptions: (updater) => set((state) => {
        const nextOptions = updater(state.setupOptions);

        return {
          setupOptions: {
            ...nextOptions,
            totalQuestions: normalizeQuestionCount(nextOptions.totalQuestions),
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
        }

        if (state?.setupOptions) {
          state.setupOptions.totalQuestions = normalizeQuestionCount(state.setupOptions.totalQuestions);
        }
      },
    },
  ),
);
