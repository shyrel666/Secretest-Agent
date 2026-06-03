'use client';

import { useState, useMemo } from 'react';
import { AuditAgentWorkspace } from '@/components/audit/audit-agent-workspace';
import {
  AUDIT_EXAMPLE_NAMES,
  extractSeveritySummary,
  type AuditStage,
} from '@/components/audit/audit-utils';
import { getModelDisplayName, useAIConfigStore } from '@/lib/store/ai-config';
import { useTokenUsageStore } from '@/lib/store/token-usage';

const STAGE_META: Record<string, string> = {
  detect: '分析代码语言',
  detect_done: '语言识别完成',
  search: '检索国标知识库',
  search_done: '知识库检索完成',
  analyze: '漏洞分析中',
  generate_done: '漏洞分析完成',
  validate: '验证标准依据',
  done: '审计完成',
};

export default function AuditPage() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stages, setStages] = useState<AuditStage[]>([]);
  const [reportContent, setReportContent] = useState('');
  const [auditStartTime, setAuditStartTime] = useState<number | null>(null);
  const [activeFileName, setActiveFileName] = useState('untitled.src');
  const { getAgentConfig } = useAIConfigStore();
  const addUsageRecord = useTokenUsageStore((state) => state.addRecord);
  const auditConfig = getAgentConfig('audit');
  const modelLabel = getModelDisplayName(auditConfig.model);

  const severitySummary = useMemo(
    () => extractSeveritySummary(reportContent),
    [reportContent],
  );

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const code = input;
    setIsLoading(true);
    setStages([]);
    setReportContent('');
    setAuditStartTime(Date.now());

    const connectionConfig = useAIConfigStore.getState().getConnectionConfig();

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          history: [],
          config: auditConfig,
          connectionConfig,
        }),
      });

      if (!response.ok) throw new Error('审计请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'stage') {
              setStages((prev) => {
                const updated = prev.map((s) =>
                  s.status === 'active' ? { ...s, status: 'done' as const } : s,
                );
                const isDone = data.stage === 'done' || data.stage?.endsWith('_done');
                const existingIdx = updated.findIndex((s) => s.id === data.stage);
                if (existingIdx !== -1) {
                  updated[existingIdx] = {
                    ...updated[existingIdx],
                    status: isDone ? 'done' : 'active',
                  };
                  return updated;
                }
                return [
                  ...updated,
                  {
                    id: data.stage,
                    label: data.detail || STAGE_META[data.stage] || data.stage,
                    status: isDone ? ('done' as const) : ('active' as const),
                  },
                ];
              });
            } else if (data.type === 'error') {
              const errorText =
                typeof data.error === 'string'
                  ? data.error
                  : '抱歉，审计过程中出现错误。请稍后重试。';
              setStages((prev) =>
                prev.map((stage) => ({
                  ...stage,
                  status: stage.status === 'active' ? ('done' as const) : stage.status,
                })),
              );
              setReportContent((prev) =>
                prev.trim()
                  ? `${prev}\n\n> ${errorText}`
                  : `抱歉，审计过程中出现错误。\n\n${errorText}`,
              );
            } else if (data.type === 'usage' && data.usage) {
              addUsageRecord({
                feature: 'audit',
                action: '代码审计',
                modelId: auditConfig.model,
                modelLabel,
                ...data.usage,
              });
            } else if (data.content) {
              setReportContent((prev) => prev + data.content);
            }
          } catch {
            // 忽略解析错误
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
              modelLabel,
              ...data.usage,
            });
          }
        } catch {
          // 忽略解析错误
        }
      }
    } catch (error) {
      console.error('审计错误:', error);
      setReportContent('抱歉，审计过程中出现错误。请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleSelect = (code: string, name: string) => {
    setInput(code);
    setActiveFileName(name);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (AUDIT_EXAMPLE_NAMES.has(activeFileName)) {
      setActiveFileName('untitled.src');
    }
  };

  const handleClear = () => {
    setInput('');
    setReportContent('');
    setStages([]);
    setCopiedId(null);
    setAuditStartTime(null);
    setActiveFileName('untitled.src');
  };

  const handleCopyReport = async () => {
    if (!reportContent.trim()) return;
    await navigator.clipboard.writeText(reportContent);
    setCopiedId('report');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AuditAgentWorkspace
      input={input}
      onInputChange={handleInputChange}
      onSend={handleSend}
      onClear={handleClear}
      onExampleSelect={handleExampleSelect}
      isLoading={isLoading}
      stages={stages}
      reportContent={reportContent}
      modelLabel={modelLabel}
      severitySummary={severitySummary}
      copiedId={copiedId}
      onCopyReport={handleCopyReport}
      auditStartTime={auditStartTime}
      activeFileName={activeFileName}
    />
  );
}
