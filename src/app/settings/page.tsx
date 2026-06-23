'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Cpu,
  Eye,
  EyeOff,
  Info,
  LaptopMinimal,
  Moon,
  MonitorCog,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  Sparkles,
  SunMedium,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { getThemeLabel, THEME_OPTIONS, type ThemeMode } from '@/lib/theme';
import { cn } from '@/lib/utils';
import {
  AGENT_LABELS,
  AVAILABLE_MODELS,
  BAILIAN_OPENAI_BASE_URL,
  defaultAssessmentGenerationConfig,
  getModelDisplayName,
  type AIConfig,
  type AgentType,
  useAIConfigStore,
} from '@/lib/store/ai-config';

type SettingsScope = AgentType | 'global';

const GLOBAL_SCOPE = {
  id: 'global' as const,
  label: '全局配置',
  shortLabel: '全局',
  description: '所有 Agent 共用这一套模型参数。',
  icon: SettingsIcon,
};

const AGENT_SCOPES: Array<{
  id: AgentType;
  label: string;
  shortLabel: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    id: 'audit',
    label: AGENT_LABELS.audit.name,
    shortLabel: '审计',
    description: AGENT_LABELS.audit.description,
    icon: Brain,
  },
  {
    id: 'questionGenerator',
    label: AGENT_LABELS.questionGenerator.name,
    shortLabel: '出题',
    description: AGENT_LABELS.questionGenerator.description,
    icon: Cpu,
  },
  {
    id: 'reviewer',
    label: AGENT_LABELS.reviewer.name,
    shortLabel: '审核',
    description: AGENT_LABELS.reviewer.description,
    icon: Check,
  },
  {
    id: 'explainer',
    label: AGENT_LABELS.explainer.name,
    shortLabel: '讲解',
    description: AGENT_LABELS.explainer.description,
    icon: Sparkles,
  },
];

const THEME_ICON_MAP = {
  light: SunMedium,
  dark: Moon,
  system: LaptopMinimal,
} as const;

function getTemperatureLabel(temp: number) {
  if (temp <= 0.3) return '精确';
  if (temp <= 0.5) return '平衡';
  if (temp <= 0.7) return '创意';
  return '发散';
}

function getScopeConfig(config: AIConfig, scope: SettingsScope) {
  return scope === 'global' ? config.globalConfig : config[scope];
}

/* ---------- 基础构件 ---------- */

function SectionHeader({
  eyebrow,
  title,
  description,
  trailing,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-6 border-b border-border/60 pb-4">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80">
          {eyebrow}
        </div>
        <h2 className="mt-1.5 font-serif text-[22px] font-medium leading-none tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 truncate text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {trailing}
    </header>
  );
}

function SpecRow({
  label,
  hint,
  children,
  align = 'right',
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  align?: 'right' | 'stack';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-3 border-b border-border/40 py-3.5 last:border-b-0',
        align === 'right'
          ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:grid-cols-[12rem_minmax(0,1fr)]'
          : 'grid-cols-1',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {hint ? <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function StatusDot({ tone = 'neutral' }: { tone?: 'ok' | 'warn' | 'neutral' | 'off' }) {
  const toneClass =
    tone === 'ok'
      ? 'bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]'
      : tone === 'warn'
        ? 'bg-amber-400 shadow-[0_0_0_3px_color-mix(in_oklab,oklch(0.82_0.16_80)_18%,transparent)]'
        : tone === 'off'
          ? 'bg-muted-foreground/40'
          : 'bg-muted-foreground/60';
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', toneClass)} />;
}

/* ---------- 页面 ---------- */

export default function SettingsPage() {
  const {
    config,
    resetConfig,
    setAgentConfig,
    setConnectionConfig,
    setGlobalConfig,
    setUseGlobalConfig,
  } = useAIConfigStore();
  const setAssessmentGenerationConfig = useAIConfigStore((state) => state.setAssessmentGenerationConfig);
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [activeScope, setActiveScope] = useState<SettingsScope>('global');
  const [showApiKey, setShowApiKey] = useState(false);
  const [themeMounted, setThemeMounted] = useState(false);

  const selectedScope: SettingsScope = config.useGlobalConfig
    ? 'global'
    : activeScope === 'global'
      ? 'audit'
      : activeScope;

  const currentConfig = getScopeConfig(config, selectedScope);
  const currentThemeMode = themeMounted ? ((theme ?? 'system') as ThemeMode) : null;
  const effectiveTheme = themeMounted ? (resolvedTheme === 'light' ? '浅色' : '深色') : '同步中';
  const assessmentGeneration = {
    ...defaultAssessmentGenerationConfig,
    ...config.assessmentGeneration,
  };
  const hasApiKey = config.connectionConfig.apiKey.trim().length > 0;
  const normalizedBaseUrl = config.connectionConfig.modelBaseUrl.trim().replace(/\/+$/, '');
  const isBailianBaseUrl = normalizedBaseUrl === BAILIAN_OPENAI_BASE_URL;
  const visibleScopes = config.useGlobalConfig ? [GLOBAL_SCOPE] : AGENT_SCOPES;
  const activeScopeMeta = useMemo(() => {
    if (selectedScope === 'global') return GLOBAL_SCOPE;
    return AGENT_SCOPES.find((scope) => scope.id === selectedScope) ?? AGENT_SCOPES[0];
  }, [selectedScope]);
  const ActiveScopeIcon = activeScopeMeta.icon;

  const handleModelChange = (modelId: string) => {
    if (selectedScope === 'global') {
      setGlobalConfig({ model: modelId });
      return;
    }
    setAgentConfig(selectedScope, { model: modelId });
  };

  const handleTemperatureChange = ([temperature]: number[]) => {
    if (typeof temperature !== 'number') return;
    if (selectedScope === 'global') {
      setGlobalConfig({ temperature });
      return;
    }
    setAgentConfig(selectedScope, { temperature });
  };

  const handleThinkingChange = (thinking: boolean) => {
    if (selectedScope === 'global') {
      setGlobalConfig({ thinking });
      return;
    }
    setAgentConfig(selectedScope, { thinking });
  };

  const handleUseGlobalConfigChange = (useGlobalConfig: boolean) => {
    setUseGlobalConfig(useGlobalConfig);
    setActiveScope(useGlobalConfig ? 'global' : 'audit');
  };

  const handleResetConfig = () => {
    resetConfig();
    setActiveScope('global');
    toast.success('已恢复默认配置');
  };

  const handleUseDefaultBaseUrl = () => {
    setConnectionConfig({ modelBaseUrl: BAILIAN_OPENAI_BASE_URL });
    toast.success('已恢复默认接口地址');
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setThemeMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans">
      {/* 背景点阵 + 顶部光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--foreground)_8%,transparent)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(180deg,transparent,black_18%,black_70%,transparent)]"
      />

      <div className="mx-auto w-full max-w-[88rem] px-5 pb-20 pt-12 sm:px-8 lg:px-12">
        {/* 页面 hero */}
        <div className="flex items-center justify-between gap-6 border-b border-border/60 pb-10">
          {/* 左侧：eyebrow + 标题 */}
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.28em] text-muted-foreground">
              <StatusDot tone="ok" />
              控制台 · SETTINGS
            </div>
            <h1 className="mt-4 font-serif text-[44px] font-medium leading-[1.08] tracking-tight text-foreground sm:text-[56px]">
              让每一个 Agent
              <br />
              <span className="text-muted-foreground">都按你想要的方式工作</span>
            </h1>
          </div>

          {/* 右侧：按钮垂直居中 */}
          <Button
            variant="outline"
            onClick={handleResetConfig}
            className="shrink-0 rounded-full border-border/60 px-4 shadow-none"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </Button>
        </div>

        {/* 主区 */}
        <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
          {/* 主列 */}
          <div className="space-y-12">
            {/* 01 模型工作台 */}
            <section>
              <SectionHeader
                eyebrow="MODEL WORKBENCH"
                title="模型工作台"
                description="为不同 Agent 单独配置模型、温度与推理模式，或一键切换为全局统一配置。"
                trailing={
                  <label className="group flex items-center gap-3 rounded-full border border-border/60 bg-background/60 py-1.5 pl-4 pr-2 transition-colors hover:border-border">
                    <div className="text-right">
                      <div className="text-[12px] font-medium leading-tight">统一配置</div>
                      <div className="font-mono text-[10px] tracking-wider text-muted-foreground">
                        UNIFIED
                      </div>
                    </div>
                    <Switch
                      checked={config.useGlobalConfig}
                      onCheckedChange={handleUseGlobalConfigChange}
                    />
                  </label>
                }
              />

              <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                {/* 左侧 scope 列表 */}
                <nav aria-label="模型配置范围" className="lg:sticky lg:top-24">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                      Scope
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                      {visibleScopes.length} 项
                    </span>
                  </div>
                  <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                    {visibleScopes.map((scope, i) => {
                      const Icon = scope.icon;
                      const scopeConfig = getScopeConfig(config, scope.id);
                      const isActive = selectedScope === scope.id;
                      return (
                        <li key={scope.id} className={cn(i > 0 && 'border-t border-border/50')}>
                          <button
                            type="button"
                            onClick={() => setActiveScope(scope.id)}
                            aria-pressed={isActive}
                            className={cn(
                              'group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors',
                              isActive ? 'bg-foreground/[0.03]' : 'hover:bg-foreground/[0.02]',
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'absolute left-0 top-0 h-full w-[2px] transition-colors',
                                isActive ? 'bg-primary' : 'bg-transparent',
                              )}
                            />
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                                isActive
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-border/60 bg-background/60 text-muted-foreground group-hover:text-foreground',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium">{scope.shortLabel}</span>
                              <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                                {getModelDisplayName(scopeConfig.model)} · {scopeConfig.temperature.toFixed(1)}
                              </span>
                            </span>
                            <ChevronRight
                              className={cn(
                                'h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform',
                                isActive && 'translate-x-0.5 text-foreground',
                              )}
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {/* 当前选中 scope 描述 */}
                  <div className="mt-5 rounded-2xl border border-border/60 bg-card/40 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                        <ActiveScopeIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                          Active
                        </div>
                        <div className="mt-0.5 truncate text-[14px] font-medium">{activeScopeMeta.label}</div>
                      </div>
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                      {activeScopeMeta.description}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <Badge variant={currentConfig.thinking ? 'default' : 'outline'} className="font-mono">
                        {currentConfig.thinking ? 'THINKING' : 'STREAMING'}
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        T {currentConfig.temperature.toFixed(1)}
                      </Badge>
                    </div>
                  </div>
                </nav>

                {/* 右侧配置表单 */}
                <div className="flex h-full min-w-0 flex-col rounded-2xl border border-border/60 bg-card/40 p-6">
                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                        Parameters
                      </div>
                      <div className="mt-1 font-serif text-[18px] font-medium tracking-tight">
                        {activeScopeMeta.label}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[10px] tracking-wider text-muted-foreground">
                      <CircleDot className="h-3 w-3 text-primary" />
                      {config.useGlobalConfig ? 'GLOBAL' : 'PER-AGENT'}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-1 flex-col">
                    {/* 模型选择 */}
                    <SpecRow
                      label="模型（Model）"
                      hint="选择当前 Agent 实际调用的模型。"
                      className="flex-1"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          id="model-id"
                          value={currentConfig.model}
                          onChange={(event) => handleModelChange(event.target.value)}
                          placeholder="qwen-plus"
                          className="h-10 rounded-lg border-border/60 bg-background/80 font-mono text-[13px] shadow-none"
                        />
                        <span className="hidden shrink-0 font-mono text-[11px] tracking-wider text-muted-foreground sm:inline">
                          ID
                        </span>
                      </div>
                    </SpecRow>

                    {/* Temperature */}
                    <SpecRow label="温度 (Temperature)" hint="控制输出确定性与发散程度。" className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[12px] text-muted-foreground">
                          0.0
                        </span>
                        <span className="font-mono text-[20px] font-medium tracking-tight tabular-nums text-foreground">
                          {currentConfig.temperature.toFixed(1)}
                        </span>
                        <span className="font-mono text-[12px] text-muted-foreground">
                          2.0
                        </span>
                      </div>
                      <Slider
                        value={[currentConfig.temperature]}
                        onValueChange={handleTemperatureChange}
                        min={0}
                        max={2}
                        step={0.1}
                        className="mt-2"
                      />
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>精确</span>
                        <span>平衡</span>
                        <span>创意</span>
                        <span>发散</span>
                      </div>
                    </SpecRow>

                    {/* Thinking */}
                    <SpecRow
                      label="思考模式 (Thinking)"
                      hint="推理模型或复杂分析任务建议开启。"
                      className="flex-1"
                    >
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/40 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium">
                            {currentConfig.thinking ? '深度推理已启用' : '流式输出优先'}
                          </div>
                          <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                            {currentConfig.thinking
                              ? '响应更稳但更慢，复杂场景推荐。'
                              : '响应更快，适合常规生成。'}
                          </div>
                        </div>
                        <Switch
                          checked={currentConfig.thinking}
                          onCheckedChange={handleThinkingChange}
                        />
                      </div>
                    </SpecRow>
                  </div>
                </div>
              </div>
            </section>

            {/* 02 Agent 状态 */}
            <section>
              <SectionHeader
                eyebrow="AGENT STATUS"
                title="Agent 运行参数"
                description="所有 Agent 当前生效的模型与温度参数总览。"
                trailing={
                  <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-muted-foreground">
                    <StatusDot tone={config.useGlobalConfig ? 'ok' : 'neutral'} />
                    {config.useGlobalConfig ? 'GLOBAL OVERRIDE' : 'INDIVIDUAL'}
                  </div>
                }
              />

              <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_5rem] gap-4 border-b border-border/60 bg-foreground/[0.02] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  <div>Agent</div>
                  <div>Model</div>
                  <div>Temperature</div>
                  <div className="text-right">Mode</div>
                </div>
                {(Object.keys(AGENT_LABELS) as AgentType[]).map((agentType, i) => {
                  const agentConfig = config.useGlobalConfig
                    ? config.globalConfig
                    : config[agentType];
                  const Icon = AGENT_SCOPES.find((s) => s.id === agentType)!.icon;
                  const isLast = i === Object.keys(AGENT_LABELS).length - 1;
                  return (
                    <div
                      key={agentType}
                      className={cn(
                        'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_5rem] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/[0.015]',
                        !isLast && 'border-b border-border/40',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/60 text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{AGENT_LABELS[agentType].name}</div>
                          <div className="truncate text-[11.5px] text-muted-foreground">
                            {AGENT_LABELS[agentType].description}
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 font-mono text-[12.5px] tabular-nums text-foreground">
                        {getModelDisplayName(agentConfig.model)}
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[12.5px] tabular-nums text-foreground">
                        <span className="text-foreground">{agentConfig.temperature.toFixed(1)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{getTemperatureLabel(agentConfig.temperature)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <StatusDot tone={agentConfig.thinking ? 'ok' : 'neutral'} />
                        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                          {agentConfig.thinking ? 'THK' : 'STR'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 配置 JSON */}
            <section>
              <details className="group overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/[0.02]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground">
                      JSON
                    </span>
                    <span className="text-[13px] font-medium">查看完整配置</span>
                  </div>
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground transition-transform group-open:rotate-90">
                    ▶
                  </span>
                </summary>
                <pre className="max-h-96 overflow-auto border-t border-border/60 bg-background/40 p-5 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </details>
            </section>
          </div>

          {/* 侧栏 */}
          <aside className="space-y-10 xl:sticky xl:top-24 xl:self-start">
            {/* 04 连接 */}
            <section>
              <SectionHeader
                eyebrow="CONNECTION"
                title="接口连接"
                description="OpenAI 兼容协议 · 即时生效"
                trailing={
                  <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                    <StatusDot tone={hasApiKey ? 'ok' : 'warn'} />
                    {hasApiKey ? 'READY' : 'NO KEY'}
                  </span>
                }
              />

              <div className="mt-5 space-y-5 rounded-2xl border border-border/60 bg-card/40 p-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="api-key" className="text-[12px] tracking-wide">
                      API Key
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showApiKey ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="api-key"
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={config.connectionConfig.apiKey}
                      onChange={(event) => setConnectionConfig({ apiKey: event.target.value })}
                      className="h-10 rounded-lg border-border/60 bg-background/80 pr-3 font-mono text-[12.5px] shadow-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base-url" className="text-[12px] tracking-wide">
                    Model Base URL
                  </Label>
                  <Input
                    id="base-url"
                    value={config.connectionConfig.modelBaseUrl}
                    onChange={(event) => setConnectionConfig({ modelBaseUrl: event.target.value })}
                    placeholder={BAILIAN_OPENAI_BASE_URL}
                    className="h-10 rounded-lg border-border/60 bg-background/80 font-mono text-[11.5px] shadow-none"
                  />
                </div>

                {!hasApiKey && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
                      AI 功能需要可用的 API Key 才能运行。
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      默认阿里百链接口
                    </div>
                    <code className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                      {BAILIAN_OPENAI_BASE_URL}
                    </code>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUseDefaultBaseUrl}
                    disabled={isBailianBaseUrl}
                    className="shrink-0 rounded-full border-border/60 shadow-none"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    恢复
                  </Button>
                </div>
              </div>
            </section>

            {/* 05 主题 */}
            <section>
              <SectionHeader
                eyebrow="APPEARANCE"
                title="界面主题"
                description={`${currentThemeMode ? getThemeLabel(currentThemeMode) : '同步中'} · 当前 ${effectiveTheme}`}
                trailing={
                  <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                    <MonitorCog className="h-3 w-3" />
                    UI
                  </span>
                }
              />

              <div className="mt-5 space-y-px overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                {THEME_OPTIONS.map((option, i) => {
                  const Icon = THEME_ICON_MAP[option.value];
                  const isActive = themeMounted && currentThemeMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      aria-pressed={isActive}
                      className={cn(
                        'group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors',
                        i > 0 && 'border-t border-border/40',
                        isActive ? 'bg-foreground/[0.03]' : 'hover:bg-foreground/[0.02]',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                          isActive
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border/60 bg-background/60 text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                      {isActive ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full border border-border/60"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 06 测评生成 */}
            <section>
              <SectionHeader
                eyebrow="ASSESSMENT"
                title="测评生成策略"
                description="题目生成与审核流程的性能调优。"
              />

              <div className="mt-5 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                {/* Fast Review */}
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      Fast Review
                    </div>
                    <div className="mt-1 text-[13px] font-medium">快速审核</div>
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                      简单与中等难度题目优先走结构校验。
                    </div>
                  </div>
                  <Switch
                    checked={assessmentGeneration.fastReview}
                    onCheckedChange={(fastReview) =>
                      setAssessmentGenerationConfig({ fastReview })
                    }
                    className="shrink-0"
                  />
                </div>

                {/* Concurrency */}
                <div className="border-t border-border/40 px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        <Cpu className="h-3 w-3" />
                        Concurrency
                      </div>
                      <div className="mt-1 text-[13px] font-medium">并行审核</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-serif text-[20px] font-medium leading-none tracking-tight tabular-nums text-foreground">
                        {assessmentGeneration.reviewConcurrency}
                      </span>
                      <span className="ml-1 text-[11px] text-muted-foreground">路</span>
                    </div>
                  </div>
                  <Slider
                    value={[assessmentGeneration.reviewConcurrency]}
                    onValueChange={([reviewConcurrency]) =>
                      setAssessmentGenerationConfig({ reviewConcurrency })
                    }
                    min={1}
                    max={6}
                    step={1}
                    className="mt-3"
                  />
                  <div className="mt-1.5 flex justify-between font-mono text-[10px] tracking-wider text-muted-foreground">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                    <span>6</span>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
