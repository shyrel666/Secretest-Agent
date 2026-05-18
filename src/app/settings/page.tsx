'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings, 
  Cpu, 
  RefreshCw, 
  Info,
  Check,
  Sparkles,
  Brain,
  RotateCcw,
  Zap,
  Key,
  Globe,
  Eye,
  EyeOff,
  MonitorCog
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { getThemeLabel, type ThemeMode } from '@/lib/theme';
import { 
  useAIConfigStore, 
  AGENT_LABELS,
  defaultAssessmentGenerationConfig,
  type AgentType,
  type ModelConfig
} from '@/lib/store/ai-config';

export default function SettingsPage() {
  const { config, setConnectionConfig, setAgentConfig, setGlobalConfig, setUseGlobalConfig, resetConfig } = useAIConfigStore();
  const setAssessmentGenerationConfig = useAIConfigStore((state) => state.setAssessmentGenerationConfig);
  const { theme, resolvedTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentType | 'global'>('global');
  const [showApiKey, setShowApiKey] = useState(false);
  const connectionCardRef = useRef<HTMLDivElement | null>(null);
  const [connectionCardHeight, setConnectionCardHeight] = useState<number | null>(null);
  const selectedTab: AgentType | 'global' = config.useGlobalConfig
    ? 'global'
    : activeTab === 'global'
      ? 'audit'
      : activeTab;

  const handleModelChange = (modelId: string) => {
    if (selectedTab === 'global') {
      setGlobalConfig({ model: modelId });
    } else {
      setAgentConfig(selectedTab, { model: modelId });
    }
  };

  const handleTemperatureChange = (value: number[]) => {
    if (selectedTab === 'global') {
      setGlobalConfig({ temperature: value[0] });
    } else {
      setAgentConfig(selectedTab, { temperature: value[0] });
    }
  };

  const handleThinkingChange = (enabled: boolean) => {
    if (selectedTab === 'global') {
      setGlobalConfig({ thinking: enabled });
    } else {
      setAgentConfig(selectedTab, { thinking: enabled });
    }
  };

  const getCurrentConfig = (): ModelConfig => {
    if (selectedTab === 'global') {
      return config.globalConfig;
    }
    return config[selectedTab];
  };

  const currentConfig = getCurrentConfig();
  const currentThemeMode = themeMounted ? (theme ?? 'system') as ThemeMode : null;
  const effectiveTheme = themeMounted ? (resolvedTheme === 'light' ? '浅色' : '深色') : '同步中';
  const activeScopeName = selectedTab === 'global' ? '系统默认配置' : AGENT_LABELS[selectedTab].name;
  const strategyLabel = config.useGlobalConfig ? '统一配置中' : '独立配置中';
  const strategyDescription = config.useGlobalConfig
    ? '当前所有 Agent 共用同一套模型参数，适合先快速跑通整套流程。'
    : '当前可按 Agent 分别配置模型，更适合精细调优不同任务。';
  const assessmentGeneration = {
    ...defaultAssessmentGenerationConfig,
    ...config.assessmentGeneration,
  };
  const topLayoutStyle = connectionCardHeight
    ? ({ ['--settings-top-height' as string]: `${connectionCardHeight}px` } as CSSProperties)
    : undefined;

  const getTemperatureLabel = (temp: number) => {
    if (temp <= 0.3) return '精确';
    if (temp <= 0.5) return '平衡';
    if (temp <= 0.7) return '创意';
    return '发散';
  };

  const handleTabChange = (value: string) => {
    const nextTab = value as AgentType | 'global';
    setActiveTab(config.useGlobalConfig || nextTab === 'global' ? 'global' : nextTab);
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setThemeMounted(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const element = connectionCardRef.current;

    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateHeight = () => {
      setConnectionCardHeight(element.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(element);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">系统配置</h1>
                <p className="text-sm text-muted-foreground">
                  管理主题、接口连接以及各 Agent 的运行参数
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={resetConfig} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              重置默认
            </Button>
          </div>
        </div>

        <Card className="mb-8 border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <MonitorCog className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">界面主题</CardTitle>
                <CardDescription>
                  支持浅色、深色和跟随系统，切换结果会保存在当前浏览器中
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" suppressHydrationWarning>
              <Badge variant="secondary">
                当前选择：{currentThemeMode ? getThemeLabel(currentThemeMode) : '同步中'}
              </Badge>
              <Badge variant="outline">实际生效：{effectiveTheme}</Badge>
            </div>
            <ThemeToggle variant="settings" />
          </CardContent>
        </Card>

        <div className="mb-8 grid items-start gap-6 xl:grid-cols-[1.2fr_0.8fr]" style={topLayoutStyle}>
          {/* Connection Config */}
          <div ref={connectionCardRef}>
            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">接口连接配置</CardTitle>
                    <CardDescription>
                      配置 AI 模型服务的 API Key 和接口地址
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">API Key</Label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="输入你的 API Key"
                      value={config.connectionConfig.apiKey}
                      onChange={(e) => setConnectionConfig({ apiKey: e.target.value })}
                      className="pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    从模型服务商获取，仅保存在当前浏览器本地，下次用同一浏览器访问时会自动带出
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">模型接口地址 (Model Base URL)</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="例如: https://dashscope.aliyuncs.com/compatible-mode/v1"
                      value={config.connectionConfig.modelBaseUrl}
                      onChange={(e) => setConnectionConfig({ modelBaseUrl: e.target.value })}
                      className="pl-9 font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    OpenAI 兼容端点，用于 LLM 调用和知识库 Embedding
                  </p>
                </div>

                {!config.connectionConfig.apiKey && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>请配置 API Key 和模型接口地址后才能使用 AI 功能</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:h-[var(--settings-top-height)] xl:grid-rows-2">
            {/* Global Config Toggle */}
            <Card className="h-full border-border/70 bg-card/95 shadow-sm">
              <CardContent className="flex h-full items-center py-5">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-medium">统一配置</h3>
                        <p className="text-sm text-muted-foreground">
                          所有Agent使用相同配置
                        </p>
                      </div>
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                        {strategyLabel}
                      </Badge>
                    </div>
                  </div>
                  <Switch
                    checked={config.useGlobalConfig}
                    onCheckedChange={setUseGlobalConfig}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="h-full border-border/70 bg-gradient-to-br from-primary/6 via-card to-card shadow-sm">
              <CardContent className="flex h-full items-center py-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="font-medium">当前配置策略</div>
                      <p className="mt-1 leading-6 text-muted-foreground">
                        {strategyDescription}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">当前编辑：{activeScopeName}</Badge>
                      <Badge variant="outline">模型：{currentConfig.model || '未设置'}</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tabs for different agents */}
        <Tabs value={selectedTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 grid h-auto w-full grid-cols-5 rounded-2xl border border-border/60 bg-card/80 p-1.5">
            <TabsTrigger value="global" className="gap-1">
              <Sparkles className="w-3 h-3" />
              全局
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1" disabled={config.useGlobalConfig}>
              <Brain className="w-3 h-3" />
              审计
            </TabsTrigger>
            <TabsTrigger value="questionGenerator" className="gap-1" disabled={config.useGlobalConfig}>
              <Cpu className="w-3 h-3" />
              出题
            </TabsTrigger>
            <TabsTrigger value="reviewer" className="gap-1" disabled={config.useGlobalConfig}>
              <Check className="w-3 h-3" />
              审核
            </TabsTrigger>
            <TabsTrigger value="explainer" className="gap-1" disabled={config.useGlobalConfig}>
              <RefreshCw className="w-3 h-3" />
              讲解
            </TabsTrigger>
          </TabsList>

          {/* Content for each tab */}
          {['global', 'audit', 'questionGenerator', 'reviewer', 'explainer'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <div className="grid items-start gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                {/* Agent Description */}
                {tab !== 'global' && (
                  <Card className="bg-muted/50 xl:col-span-2">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-primary" />
                        <span className="text-sm">
                          {AGENT_LABELS[tab as AgentType].description}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Model Selection */}
                <Card className="border-border/70 bg-card/95 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">模型配置</CardTitle>
                    <CardDescription>
                      输入你的模型服务商提供的模型ID
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">模型ID (Model)</Label>
                      <Input
                        type="text"
                        placeholder="输入模型ID，如 qwen-max、deepseek-chat"
                        value={currentConfig.model}
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        填写模型服务商提供的模型名称，例如：
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {['qwen-max', 'qwen-plus', 'qwen-turbo', 'deepseek-chat', 'deepseek-reasoner', 'glm-4'].map((id) => (
                          <button
                            key={id}
                            onClick={() => handleModelChange(id)}
                            className={cn(
                              'px-2 py-0.5 rounded text-xs font-mono border transition-colors',
                              currentConfig.model === id
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                            )}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Parameters */}
                <Card className="border-border/70 bg-card/95 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">模型参数</CardTitle>
                    <CardDescription>
                      调整模型行为参数
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Temperature */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">温度 (Temperature)</Label>
                        <Badge variant="outline">
                          {currentConfig.temperature.toFixed(1)} - {getTemperatureLabel(currentConfig.temperature)}
                        </Badge>
                      </div>
                      <Slider
                        value={[currentConfig.temperature]}
                        onValueChange={handleTemperatureChange}
                        min={0}
                        max={2}
                        step={0.1}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        较低值产生更确定的输出，较高值产生更有创意的输出
                      </p>
                    </div>

                    {/* Thinking Mode */}
                    <div className="flex items-center justify-between py-3 border-t">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">思考模式</Label>
                        <p className="text-xs text-muted-foreground">
                          启用深度推理，适合复杂分析任务
                        </p>
                      </div>
                      <Switch
                        checked={currentConfig.thinking}
                        onCheckedChange={handleThinkingChange}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Current Config Summary */}
                <Card className="bg-primary/5 border-primary/20 shadow-sm xl:col-span-2">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <Info className="w-5 h-5 text-primary" />
                      <div className="text-sm">
                        <span className="font-medium">当前配置：</span>
                        <span className="text-muted-foreground ml-2">
                          {currentConfig.model || '未设置'}
                          {' · '}
                          温度 {currentConfig.temperature.toFixed(1)}
                          {' · '}
                          {currentConfig.thinking ? '思考模式开启' : '思考模式关闭'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <Card className="mt-8 border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">测评生成性能</CardTitle>
            <CardDescription>
              控制出题时的审核策略和并发度，调快会减少等待时间，调稳会增加二次审核。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">快速审核模式</Label>
                <p className="text-xs leading-5 text-muted-foreground">
                  简单/中等题通过结构校验和知识库 grounding 后跳过审核 Agent；困难题仍会二次审核。
                </p>
              </div>
              <Switch
                checked={assessmentGeneration.fastReview}
                onCheckedChange={(fastReview) => setAssessmentGenerationConfig({ fastReview })}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">审核并发数</Label>
                <Badge variant="outline">{assessmentGeneration.reviewConcurrency} 路并发</Badge>
              </div>
              <Slider
                value={[assessmentGeneration.reviewConcurrency]}
                onValueChange={([reviewConcurrency]) => setAssessmentGenerationConfig({ reviewConcurrency })}
                min={1}
                max={6}
                step={1}
                className="w-full"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                推荐 3。模型服务限流较严格时调低，模型吞吐充足时可调高。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Config Preview */}
        <Card className="mt-8 border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">配置预览</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto font-mono">
              {JSON.stringify(config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
