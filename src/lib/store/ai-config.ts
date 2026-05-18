'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const AI_CONFIG_STORAGE_KEY = 'ai-config-storage';

// 支持的模型列表
export const AVAILABLE_MODELS = [
  // 阿里百炼（通义千问）
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    description: '通义千问旗舰模型，复杂推理和生成',
    recommended: true,
    group: '阿里百炼',
  },
  {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    description: '平衡性能与成本，适合大多数任务',
    recommended: false,
    group: '阿里百炼',
  },
  {
    id: 'qwen-turbo',
    name: 'Qwen Turbo',
    description: '速度最快，适合简单任务',
    recommended: false,
    group: '阿里百炼',
  },
  {
    id: 'qwen-long',
    name: 'Qwen Long',
    description: '超长上下文，适合长文档分析',
    recommended: false,
    group: '阿里百炼',
  },
  // 火山方舟（豆包）
  {
    id: 'doubao-seed-2-0-pro-260215',
    name: 'Doubao Pro',
    description: '旗舰模型，复杂推理和多模态任务',
    recommended: false,
    group: '火山方舟',
  },
  {
    id: 'doubao-seed-2-0-lite-260215',
    name: 'Doubao Lite',
    description: '平衡性能与成本，适合大多数任务',
    recommended: false,
    group: '火山方舟',
  },
  {
    id: 'doubao-seed-1-8-251228',
    name: 'Doubao Seed',
    description: '多模态Agent优化模型',
    recommended: false,
    group: '火山方舟',
  },
  // DeepSeek
  {
    id: 'deepseek-v3-2-251201',
    name: 'DeepSeek V3.2',
    description: '高级推理能力',
    recommended: false,
    group: 'DeepSeek',
  },
  {
    id: 'deepseek-r1-250528',
    name: 'DeepSeek R1',
    description: '研究和分析任务',
    recommended: false,
    group: 'DeepSeek',
  },
  // Moonshot（Kimi）
  {
    id: 'kimi-k2-250905',
    name: 'Kimi K2',
    description: '长上下文处理',
    recommended: false,
    group: 'Kimi',
  },
  {
    id: 'kimi-k2-5-260127',
    name: 'Kimi K2.5',
    description: 'Agent、代码、视觉、多模态任务',
    recommended: false,
    group: 'Kimi',
  },
  // 智谱
  {
    id: 'glm-4-7-251222',
    name: 'GLM-4',
    description: '通用模型',
    recommended: false,
    group: '智谱',
  },
] as const;

export function getModelDisplayName(modelId: string): string {
  return AVAILABLE_MODELS.find((model) => model.id === modelId)?.name || modelId;
}

export function getCombinedModelLabel(modelIds: string[]): string {
  const uniqueModelIds = Array.from(new Set(modelIds.filter(Boolean)));
  return uniqueModelIds.map((modelId) => getModelDisplayName(modelId)).join(' / ');
}

// Agent类型
export type AgentType = 'audit' | 'questionGenerator' | 'reviewer' | 'explainer';

// 模型配置接口
export interface ModelConfig {
  model: string;
  temperature: number;
  thinking: boolean;
}

// SDK 连接配置（API Key、接口地址）
export interface ConnectionConfig {
  apiKey: string;
  modelBaseUrl: string;
}

export interface AssessmentGenerationConfig {
  fastReview: boolean;
  reviewConcurrency: number;
}

// 全局配置接口
export interface AIConfig {
  // SDK 连接配置
  connectionConfig: ConnectionConfig;

  // 各Agent的独立配置
  audit: ModelConfig;
  questionGenerator: ModelConfig;
  reviewer: ModelConfig;
  explainer: ModelConfig;
  
  // 全局开关
  useGlobalConfig: boolean;
  globalConfig: ModelConfig;

  // 测评生成性能配置
  assessmentGeneration: AssessmentGenerationConfig;
}

// 默认配置
const defaultModelConfig: ModelConfig = {
  model: 'qwen-max',
  temperature: 0.5,
  thinking: true,
};

export const defaultConnectionConfig: ConnectionConfig = {
  apiKey: '',
  modelBaseUrl: '',
};

export const defaultAssessmentGenerationConfig: AssessmentGenerationConfig = {
  fastReview: true,
  reviewConcurrency: 3,
};

export const defaultAIConfig: AIConfig = {
  connectionConfig: { ...defaultConnectionConfig },
  audit: { ...defaultModelConfig, temperature: 0.3 },
  questionGenerator: { ...defaultModelConfig, temperature: 0.7 },
  reviewer: { ...defaultModelConfig, temperature: 0.3, thinking: false },
  explainer: { ...defaultModelConfig, temperature: 0.5 },
  useGlobalConfig: false,
  globalConfig: { ...defaultModelConfig },
  assessmentGeneration: { ...defaultAssessmentGenerationConfig },
};

// Agent配置标签
export const AGENT_LABELS: Record<AgentType, { name: string; description: string }> = {
  audit: {
    name: '代码审计Agent',
    description: '分析代码安全漏洞，提供修复建议',
  },
  questionGenerator: {
    name: '出题Agent',
    description: '基于知识库生成专业测评题目',
  },
  reviewer: {
    name: '审核Agent',
    description: '验证题目质量和准确性',
  },
  explainer: {
    name: '讲解Agent',
    description: '错题讲解和学习路径建议',
  },
};

// Store接口
interface AIConfigStore {
  config: AIConfig;
  
  // Actions
  setConnectionConfig: (config: Partial<ConnectionConfig>) => void;
  setAgentConfig: (agentType: AgentType, config: Partial<ModelConfig>) => void;
  setGlobalConfig: (config: Partial<ModelConfig>) => void;
  setAssessmentGenerationConfig: (config: Partial<AssessmentGenerationConfig>) => void;
  setUseGlobalConfig: (use: boolean) => void;
  resetConfig: () => void;
  
  // Getters
  getConnectionConfig: () => ConnectionConfig;
  getAgentConfig: (agentType: AgentType) => ModelConfig;
  getAssessmentGenerationConfig: () => AssessmentGenerationConfig;
}

export const useAIConfigStore = create<AIConfigStore>()(
  persist(
    (set, get) => ({
      config: defaultAIConfig,

      setConnectionConfig: (newConfig) => {
        set((state) => ({
          config: {
            ...state.config,
            connectionConfig: {
              ...state.config.connectionConfig,
              ...newConfig,
            },
          },
        }));
      },
      
      setAgentConfig: (agentType, newConfig) => {
        set((state) => ({
          config: {
            ...state.config,
            [agentType]: {
              ...state.config[agentType],
              ...newConfig,
            },
          },
        }));
      },
      
      setGlobalConfig: (newConfig) => {
        set((state) => ({
          config: {
            ...state.config,
            globalConfig: {
              ...state.config.globalConfig,
              ...newConfig,
            },
          },
        }));
      },

      setAssessmentGenerationConfig: (newConfig) => {
        set((state) => ({
          config: {
            ...state.config,
            assessmentGeneration: {
              ...defaultAssessmentGenerationConfig,
              ...state.config.assessmentGeneration,
              ...newConfig,
            },
          },
        }));
      },
      
      setUseGlobalConfig: (use) => {
        set((state) => ({
          config: {
            ...state.config,
            useGlobalConfig: use,
          },
        }));
      },
      
      resetConfig: () => {
        set({ config: defaultAIConfig });
      },
      
      getConnectionConfig: () => {
        return get().config.connectionConfig;
      },

      getAgentConfig: (agentType) => {
        const { config } = get();
        if (config.useGlobalConfig) {
          return config.globalConfig;
        }
        return config[agentType];
      },

      getAssessmentGenerationConfig: () => {
        return {
          ...defaultAssessmentGenerationConfig,
          ...get().config.assessmentGeneration,
        };
      },
    }),
    {
      name: AI_CONFIG_STORAGE_KEY,
      skipHydration: true,
    }
  )
);

// Hook for easy access
export function useModelConfig(agentType: AgentType): ModelConfig {
  const { getAgentConfig } = useAIConfigStore();
  return getAgentConfig(agentType);
}
