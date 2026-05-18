// 模型配置接口
export interface ModelConfig {
  model: string;
  temperature: number;
  thinking: boolean;
}

// 默认模型配置
export const DEFAULT_CONFIG: ModelConfig = {
  model: 'doubao-seed-2-0-pro-260215',
  temperature: 0.5,
  thinking: true,
};

// LLM配置类型（与SDK兼容）
export interface LLMConfigCompatible {
  model: string;
  temperature: number;
  thinking: 'enabled' | 'disabled';
}

// 将配置转换为LLMConfig格式
export function toLLMConfig(config?: ModelConfig): LLMConfigCompatible {
  return {
    model: config?.model || DEFAULT_CONFIG.model,
    temperature: config?.temperature ?? DEFAULT_CONFIG.temperature,
    thinking: config?.thinking ? 'enabled' : 'disabled',
  };
}

// Agent类型
export type AgentType = 'audit' | 'questionGenerator' | 'reviewer' | 'explainer';
