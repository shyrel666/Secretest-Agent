'use client';

import { useMemo } from 'react';
import { AuditAgentWorkspace } from '@/components/audit/audit-agent-workspace';
import {
  AUDIT_EXAMPLE_NAMES,
  extractSeveritySummary,
} from '@/components/audit/audit-utils';
import { AUDIT_DEFAULT_FILE_NAME, useAuditSessionStore } from '@/lib/store/audit-session';
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
  const input = useAuditSessionStore((state) => state.input);
  const isLoading = useAuditSessionStore((state) => state.isLoading);
  const copiedId = useAuditSessionStore((state) => state.copiedId);
  const stages = useAuditSessionStore((state) => state.stages);
  const reportContent = useAuditSessionStore((state) => state.reportContent);
  const auditStartedAt = useAuditSessionStore((state) => state.auditStartedAt);
  const auditFinishedAt = useAuditSessionStore((state) => state.auditFinishedAt);
  const activeFileName = useAuditSessionStore((state) => state.activeFileName);
  const { getAgentConfig } = useAIConfigStore();
  const addUsageRecord = useTokenUsageStore((state) => state.addRecord);
  const auditConfig = getAgentConfig('audit');
  const modelLabel = getModelDisplayName(auditConfig.model);

  const severitySummary = useMemo(
    () => extractSeveritySummary(reportContent),
    [reportContent],
  );

  const handleSend = async () => {
    const session = useAuditSessionStore.getState();
    if (!session.input.trim() || session.isLoading) return;

    const code = session.input;
    useAuditSessionStore.getState().startAudit();

    const { getAgentConfig: getCurrentAgentConfig, getConnectionConfig } = useAIConfigStore.getState();
    const currentAuditConfig = getCurrentAgentConfig('audit');
    const currentModelLabel = getModelDisplayName(currentAuditConfig.model);
    const connectionConfig = getConnectionConfig();

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          history: [],
          config: currentAuditConfig,
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
              const stageId = typeof data.stage === 'string' ? data.stage : 'unknown';
              const detail = typeof data.detail === 'string' ? data.detail : '';
              useAuditSessionStore.getState().recordStage(
                stageId,
                detail || STAGE_META[stageId] || stageId,
              );
            } else if (data.type === 'error') {
              const errorText =
                typeof data.error === 'string'
                  ? data.error
                  : '抱歉，审计过程中出现错误。请稍后重试。';
              useAuditSessionStore.getState().completeActiveStages();
              const currentReport = useAuditSessionStore.getState().reportContent;
              useAuditSessionStore.getState().setReportContent(
                currentReport.trim()
                  ? `${currentReport}\n\n> ${errorText}`
                  : `抱歉，审计过程中出现错误。\n\n${errorText}`,
              );
            } else if (data.type === 'usage' && data.usage) {
              addUsageRecord({
                feature: 'audit',
                action: '代码审计',
                modelId: currentAuditConfig.model,
                modelLabel: currentModelLabel,
                ...data.usage,
              });
            } else if (typeof data.content === 'string') {
              useAuditSessionStore.getState().appendReportContent(data.content);
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
              modelId: currentAuditConfig.model,
              modelLabel: currentModelLabel,
              ...data.usage,
            });
          }
        } catch {
          // 忽略解析错误
        }
      }
    } catch (error) {
      console.error('审计错误:', error);
      useAuditSessionStore.getState().setReportContent('抱歉，审计过程中出现错误。请稍后重试。');
    } finally {
      useAuditSessionStore.getState().finishAudit();
    }
  };

  const handleExampleSelect = (code: string, name: string) => {
    useAuditSessionStore.getState().setInput(code);
    useAuditSessionStore.getState().setActiveFileName(name);
  };

  const handleInputChange = (value: string) => {
    useAuditSessionStore.getState().setInput(value);
    if (AUDIT_EXAMPLE_NAMES.has(activeFileName)) {
      useAuditSessionStore.getState().setActiveFileName(AUDIT_DEFAULT_FILE_NAME);
    }
  };

  const handleClear = () => {
    useAuditSessionStore.getState().reset();
  };

  const handleCopyReport = async () => {
    if (!reportContent.trim()) return;
    await navigator.clipboard.writeText(reportContent);
    useAuditSessionStore.getState().setCopiedId('report');
    setTimeout(() => useAuditSessionStore.getState().setCopiedId(null), 2000);
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
      auditStartedAt={auditStartedAt}
      auditFinishedAt={auditFinishedAt}
      activeFileName={activeFileName}
    />
  );
}
