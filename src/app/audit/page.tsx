'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Send, 
  Loader2, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Bug,
  Code2,
  Lightbulb,
  Copy,
  Check,
  Trash2,
  Search,
  FileText,
  Cpu,
  ShieldCheck,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { getModelDisplayName, useAIConfigStore } from '@/lib/store/ai-config';
import { useTokenUsageStore } from '@/lib/store/token-usage';
import { ThemedCodeBlock } from '@/components/ui/themed-code-block';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  vulnerabilities?: Vulnerability[];
}

interface Vulnerability {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  line?: number;
  description: string;
  suggestion: string;
}

interface AuditStage {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

const STAGE_META: Record<string, { label: string; icon: React.ElementType }> = {
  detect: { label: '分析代码语言', icon: FileText },
  detect_done: { label: '语言识别完成', icon: FileText },
  search: { label: '检索国标知识库', icon: Search },
  search_done: { label: '知识库检索完成', icon: Search },
  analyze: { label: '漏洞分析中', icon: Cpu },
  generate_done: { label: '漏洞分析完成', icon: Cpu },
  validate: { label: '验证标准依据', icon: ShieldCheck },
  done: { label: '审计完成', icon: CheckCircle },
};

const severityConfig = {
  critical: { color: 'text-rose-500', bgColor: 'bg-rose-500/10', label: '严重' },
  high: { color: 'text-orange-500', bgColor: 'bg-orange-500/10', label: '高危' },
  medium: { color: 'text-amber-500', bgColor: 'bg-amber-500/10', label: '中危' },
  low: { color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: '低危' },
};

type SeverityKey = keyof typeof severityConfig;

function mapSeverityLabelToKey(label: string): SeverityKey | null {
  const normalized = label.replace(/[\s*：:]/g, '').trim();

  if (normalized.includes('严重')) {
    return 'critical';
  }

  if (normalized.includes('高危') || normalized === '高') {
    return 'high';
  }

  if (normalized.includes('中危') || normalized === '中') {
    return 'medium';
  }

  if (normalized.includes('低危') || normalized === '低') {
    return 'low';
  }

  return null;
}

function extractSeveritySummary(content: string): {
  overall: SeverityKey | null;
  detected: Set<SeverityKey>;
} {
  const detected = new Set<SeverityKey>();

  const detailMatches = content.matchAll(/风险等级[^\n]*?[：:]\s*([^\n]+)/g);
  for (const match of detailMatches) {
    const severity = mapSeverityLabelToKey(match[1] || '');
    if (severity) {
      detected.add(severity);
    }
  }

  const overallMatch = content.match(/总体风险评级[^\n]*?[：:]\s*([^\n]+)/);
  const overall = overallMatch ? mapSeverityLabelToKey(overallMatch[1] || '') : null;

  if (overall) {
    detected.add(overall);
  }

  return { overall, detected };
}

const codeExamples = [
  {
    name: 'SQL注入 (Java)',
    code: `public User getUser(String username) {
    String sql = "SELECT * FROM users WHERE username = '" + username + "'";
    return jdbcTemplate.queryForObject(sql, new UserRowMapper());
}`,
  },
  {
    name: '缓冲区溢出 (C)',
    code: `void copy_data(char *input) {
    char buffer[64];
    strcpy(buffer, input);  // 危险：无长度检查
    printf("Data: %s\\n", buffer);
}`,
  },
  {
    name: 'XSS漏洞 (Java)',
    code: `@GetMapping("/search")
public String search(@RequestParam String q, Model model) {
    model.addAttribute("result", "搜索结果: " + q);
    return "search";  // 直接输出用户输入，存在XSS风险
}`,
  },
  {
    name: '内存泄漏 (C++)',
    code: `void processData() {
    int* data = new int[1000];
    // 使用 data...
    return;  // 忘记释放内存，导致内存泄漏
}`,
  },
  {
    name: '路径遍历 (C#)',
    code: `public string ReadReport(string fileName) {
    var fullPath = Path.Combine("C:/reports", fileName);
    return File.ReadAllText(fullPath); // 未校验文件名，可能被构造为 ../ 绕过目录限制
}`,
  },
];

export default function AuditPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stages, setStages] = useState<AuditStage[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { getAgentConfig } = useAIConfigStore();
  const addUsageRecord = useTokenUsageStore((state) => state.addRecord);
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim()),
    [messages],
  );
  const severitySummary = useMemo(
    () => extractSeveritySummary(latestAssistantMessage?.content || ''),
    [latestAssistantMessage],
  );

  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]',
    );

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  };

  useEffect(() => {
    const frame = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [messages, stages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStages([]);

    // 获取审计Agent的配置
    const auditConfig = getAgentConfig('audit');
    const connectionConfig = useAIConfigStore.getState().getConnectionConfig();

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: input,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          config: auditConfig,
          connectionConfig,
        }),
      });

      if (!response.ok) throw new Error('审计请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'stage') {
                setStages((prev) => {
                  // Mark previous active stages as done
                  const updated = prev.map((s) =>
                    s.status === 'active' ? { ...s, status: 'done' as const } : s
                  );
                  const isDone = data.stage === 'done' || data.stage?.endsWith('_done');
                  // Don't duplicate detect_done / search_done etc; update existing
                  const existingIdx = updated.findIndex((s) => s.id === data.stage);
                  if (existingIdx !== -1) {
                    updated[existingIdx] = { ...updated[existingIdx], status: isDone ? 'done' : 'active' };
                    return updated;
                  }
                  return [
                    ...updated,
                    {
                      id: data.stage,
                      label: data.detail || STAGE_META[data.stage]?.label || data.stage,
                      status: isDone ? 'done' as const : 'active' as const,
                    },
                  ];
                });
              } else if (data.type === 'error') {
                const errorText = typeof data.error === 'string'
                  ? data.error
                  : '抱歉，审计过程中出现错误。请稍后重试。';

                setStages((prev) =>
                  prev.map((stage) => ({
                    ...stage,
                    status: stage.status === 'active' ? 'done' : stage.status,
                  })),
                );
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantMessage.id) {
                      return m;
                    }

                    const nextContent = m.content.trim()
                      ? `${m.content}\n\n> ${errorText}`
                      : `抱歉，审计过程中出现错误。\n\n${errorText}`;

                    return { ...m, content: nextContent };
                  }),
                );
              } else if (data.type === 'usage' && data.usage) {
                addUsageRecord({
                  feature: 'audit',
                  action: '代码审计',
                  modelId: auditConfig.model,
                  modelLabel: getModelDisplayName(auditConfig.model),
                  ...data.usage,
                });
              } else if (data.content) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: m.content + data.content }
                      : m
                  )
                );
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.trim().slice(6));
          if (data.type === 'usage' && data.usage) {
            addUsageRecord({
              feature: 'audit',
              action: '代码审计',
              modelId: auditConfig.model,
              modelLabel: getModelDisplayName(auditConfig.model),
              ...data.usage,
            });
          }
        } catch {
          // 忽略解析错误
        }
      }
    } catch (error) {
      console.error('审计错误:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '抱歉，审计过程中出现错误。请稍后重试。',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (code: string) => {
    setInput(code);
    textareaRef.current?.focus();
  };

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClear = () => {
    setInput('');
    setMessages([]);
    setCopiedId(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-teal-400/10">
              <Code2 className="w-5 h-5 text-teal-400" />
            </div>
            <h1 className="text-2xl font-bold">代码审计 Agent</h1>
          </div>
          <p className="text-muted-foreground">
            粘贴或输入代码，AI助手将基于 GB/T 34944、34943、34946 标准进行漏洞分析与安全审计
          </p>
        </div>

        <div className="space-y-6">
          {/* Main Chat Area */}
          <Card className="flex min-h-[calc(100vh-220px)] flex-col lg:h-[calc(100vh-180px)]">
              {/* Messages */}
              <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-16">
                      <Shield className="w-16 h-16 text-muted-foreground/30 mb-4" />
                      <h3 className="text-lg font-medium text-muted-foreground mb-2">
                        开始代码审计
                      </h3>
                      <p className="text-sm text-muted-foreground/70 max-w-sm">
                        在下方输入框粘贴代码，或从右侧选择示例代码开始分析
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            'flex gap-3',
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          {message.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Shield className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl px-4 py-3',
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            )}
                          >
                            {/* Stage indicator for thinking process */}
                            {message.role === 'assistant' && isLoading && message.id === messages[messages.length - 1]?.id && stages.length > 0 && (
                              <div className="mb-3 space-y-1.5">
                                {stages.map((stage) => {
                                  const meta = STAGE_META[stage.id];
                                  const Icon = meta?.icon || Loader2;
                                  const isDone = stage.status === 'done';
                                  const isActive = stage.status === 'active';
                                  return (
                                    <div
                                      key={stage.id}
                                      className={cn(
                                        'flex items-center gap-2 text-xs transition-all duration-300',
                                        isDone && 'text-muted-foreground/60',
                                        isActive && 'text-primary',
                                      )}
                                    >
                                      {isActive ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                      ) : isDone ? (
                                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                      ) : (
                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                      )}
                                      <span>{stage.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {message.content ? (
                              message.role === 'user' ? (
                                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                  {message.content}
                                </div>
                              ) : (
                                <div className="prose prose-sm dark:prose-invert max-w-none [&_h1]:mb-5 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-semibold">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      p(props) { return <p className="my-3 leading-8 text-[15px] text-foreground/95" {...props} />; },
                                      ul(props) { return <ul className="my-4 list-disc space-y-2 pl-6" {...props} />; },
                                      ol(props) { return <ol className="my-4 list-decimal space-y-2 pl-6" {...props} />; },
                                      li(props) { return <li className="leading-8" {...props} />; },
                                      blockquote(props) { return <blockquote className="my-5 rounded-r-md border-l-4 border-primary/50 bg-muted/30 px-4 py-3 text-foreground/90" {...props} />; },
                                      hr(props) { return <hr className="my-6 border-border/60" {...props} />; },
                                      table(props) {
                                        return (
                                          <div className="my-6 overflow-x-auto rounded-lg border border-border/60 bg-muted/10">
                                            <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-x-4 border-spacing-y-3 text-left" {...props} />
                                          </div>
                                        );
                                      },
                                      thead(props) { return <thead className="bg-muted/30" {...props} />; },
                                      th(props) { return <th className="px-4 py-3 text-sm font-semibold text-foreground whitespace-normal" {...props} />; },
                                      td(props) { return <td className="px-4 py-3 align-top leading-8 text-foreground/90 whitespace-normal break-words" {...props} />; },
                                      code({ children, className }: React.ComponentProps<'code'> & { className?: string }) {
                                        const content = String(children).replace(/\n$/, '');
                                        const langMatch = /language-([\w-]+)/.exec(className || '');
                                        const isInline = !className && !content.includes('\n');
                                        if (isInline) return <code className="rounded bg-background/50 px-1.5 py-0.5 text-xs text-primary">{children}</code>;
                                        return (
                                          <ThemedCodeBlock
                                            language={langMatch?.[1] || 'text'}
                                            preTag="div"
                                            customStyle={{ margin: 0, borderRadius: '0.5rem', padding: '0.875rem', fontSize: '0.75rem', lineHeight: '1.6', overflowX: 'auto' }}
                                            codeTagStyle={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                                            code={content}
                                          />
                                        );
                                      },
                                    }}
                                  >
                                    {message.content}
                                  </ReactMarkdown>
                                </div>
                              )
                            ) : (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            )}
                            {message.role === 'assistant' && message.content && (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => handleCopy(message.content, message.id)}
                                >
                                  {copiedId === message.id ? (
                                    <Check className="w-3 h-3 mr-1" />
                                  ) : (
                                    <Copy className="w-3 h-3 mr-1" />
                                  )}
                                  {copiedId === message.id ? '已复制' : '复制'}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>

              {/* Input Area */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="粘贴或输入需要审计的代码..."
                    className="min-h-[80px] max-h-[200px] resize-none font-mono text-sm"
                    disabled={isLoading}
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      type="button"
                      onClick={handleClear}
                      disabled={isLoading || (messages.length === 0 && !input.trim())}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
          </Card>

          {/* Support Cards */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Example Code */}
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  示例代码
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {codeExamples.map((example, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="h-auto w-full justify-start py-1.5 text-left"
                    onClick={() => handleExampleClick(example.code)}
                  >
                    <Bug className="w-4 h-4 mr-2 shrink-0 text-rose-400" />
                    <span className="text-xs">{example.name}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Severity Legend */}
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  漏洞等级
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {severitySummary.overall && (
                  <Badge variant="secondary" className="mb-2">
                    本次结果：{severityConfig[severitySummary.overall].label}
                  </Badge>
                )}
                {Object.entries(severityConfig).map(([key, config]) => {
                  const isActive = severitySummary.detected.has(key as SeverityKey);

                  return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                      isActive && 'bg-muted/60 ring-1 ring-border/60'
                    )}
                  >
                    <div className={cn('w-3 h-3 rounded-full', config.bgColor, isActive && 'ring-2 ring-current/20')} />
                    <span className={cn('text-sm font-medium', config.color)}>
                      {config.label}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {isActive ? '已命中' : '未命中'}
                    </span>
                  </div>
                )})}
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="h-full bg-primary/5 border-primary/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex gap-3">
                  <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">审计提示</p>
                    <p>
                      支持 Java、C/C++、C# 等语言的漏洞检测，基于 GB/T 34944-2017、GB/T 34943-2017 和 GB/T 34946-2017 标准进行分析
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
