import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import type { ModelConfig } from '@/lib/agents/types';
import { toLLMConfig, DEFAULT_CONFIG } from '@/lib/agents/types';
import { createEstimatedUsage } from '@/lib/token-usage';
import { InternalMcpToolbox } from '@/lib/knowledge/mcp-tools';

const AUDIT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

function buildKnowledgeContext(
  results: Array<{
    content: string;
    clauseNumber?: string;
    sectionPath?: string;
  }>,
): string {
  if (results.length === 0) return '';

  const sections = results.map((result, index) => {
    const header = [
      result.clauseNumber && `条款 ${result.clauseNumber}`,
      result.sectionPath,
    ].filter(Boolean).join(' — ');

    return `【参考 ${index + 1}】${header ? `(${header})` : ''}\n${result.content}`;
  });

  return `\n\n## 📚 国标知识库参考（以下内容检索自知识库，请优先引用）\n\n${sections.join('\n\n')}`;
}

function buildCitationAppendix(citations: Array<{
  standardName?: string;
  clauseNumber?: string;
  sectionPath?: string;
}>): string {
  if (citations.length === 0) {
    return '';
  }

  const lines = citations
    .slice(0, 8)
    .map((citation) => `- ${citation.standardName || '国标条款'} ${citation.clauseNumber || ''}${citation.sectionPath ? ` (${citation.sectionPath})` : ''}`.trim());

  return `\n\n### 📎 证据引用补充\n${lines.join('\n')}`;
}

const BASE_SYSTEM_PROMPT = `你是一位专业的代码安全审计专家，精通GB/T 34944-2017《Java语言源代码漏洞测试规范》、GB/T 34943-2017《C/C++语言源代码漏洞测试规范》和GB/T 34946-2017《C#语言源代码漏洞测试规范》。

你的任务是分析用户提交的代码，识别其中的安全漏洞，并提供专业的审计报告。

## 审计要求

1. 必须优先基于“国标知识库参考”中的证据开展分析，不得跳过证据直接凭常识下结论
2. 每个漏洞都必须绑定标准引用；如果证据不足，应明确说明“当前知识库证据不足”
3. 漏洞识别：基于国家标准识别代码中的安全漏洞
4. 风险等级：按照严重程度分级（严重/高危/中危/低危）
5. 代码定位：指出漏洞所在的具体行号和代码片段
6. 修复建议：提供具体的修复代码示例

## 输出格式

请按照以下结构输出审计报告：

### 📋 审计概述
- 代码语言：[Java/C/C++/C#]
- 代码行数：[行数]
- 发现漏洞：[数量]个

### 🔍 漏洞详情

#### 漏洞 1: [漏洞名称]
- **风险等级**：[严重/高危/中危/低危]
- **标准引用**：[GB/T xxxxx-2017 条款 x.x.x]
- **所在位置**：第 X 行
- **问题代码**：
\`\`\`
[问题代码片段]
\`\`\`
- **问题描述**：[详细描述漏洞原理和危害]
- **修复建议**：
\`\`\`
[修复后的代码]
\`\`\`

### 📊 审计总结
- 总体风险评级：[高/中/低]
- 修复优先级建议
- 最佳实践建议

如果没有发现漏洞，请给出正面的安全评价，并指出代码中值得肯定的安全实践。`;

export async function POST(request: NextRequest) {
  try {
    const { code, history = [], config, connectionConfig } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的代码内容' },
        { status: 400 },
      );
    }

    const modelConfig: ModelConfig = config || DEFAULT_CONFIG;
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const auditConnectionConfig = {
      ...connectionConfig,
      timeout: Math.max(connectionConfig?.timeout ?? 0, AUDIT_REQUEST_TIMEOUT_MS),
    };
    const configInstance = new Config(auditConnectionConfig);
    const client = new LLMClient(configInstance, customHeaders);

    const toolbox = new InternalMcpToolbox({
      apiKey: auditConnectionConfig?.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '',
      modelBaseUrl: auditConnectionConfig?.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL || '',
    });

    const stageEvents: Array<{ stage: string; detail?: string }> = [];
    stageEvents.push({ stage: 'detect', detail: '正在分析代码语言与审计范围…' });
    const scope = toolbox.detectLanguageAndScope({ code });
    stageEvents.push({ stage: 'detect_done', detail: `识别为 ${scope.languageLabel} 代码` });

    let evidence = {
      results: [] as Array<{
        content: string;
        score: number;
        docId: string;
        sectionPath?: string;
        clauseNumber?: string;
        chunkType?: string;
      }>,
      citations: [] as Array<{
        docId: string;
        standardType?: 'java' | 'cpp' | 'csharp';
        standardName?: string;
        clauseNumber?: string;
        sectionPath?: string;
      }>,
      retrievalTrace: [] as Array<{
        tool: string;
        summary: string;
        query?: string;
        hitCount: number;
        citations: Array<{
          docId: string;
          standardType?: 'java' | 'cpp' | 'csharp';
          standardName?: string;
          clauseNumber?: string;
          sectionPath?: string;
        }>;
      }>,
    };

    if ((auditConnectionConfig?.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY) && (auditConnectionConfig?.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL)) {
      stageEvents.push({ stage: 'search', detail: '正在检索国标知识库…' });
      evidence = await toolbox.searchStandardClauses({
        queries: [
          `${scope.languageLabel} 源代码漏洞 安全审计 ${code.slice(0, 220)}`,
          `${scope.languageLabel} 安全编码 条款 ${code.slice(0, 120)}`,
          `${scope.languageLabel} 漏洞 检查点`,
        ],
        standardTypes: scope.standardTypes,
        topK: 8,
        threshold: 0.2,
      });
      stageEvents.push({ stage: 'search_done', detail: `检索到 ${evidence.results.length} 条相关标准条款` });
    }
    stageEvents.push({ stage: 'analyze', detail: '正在基于标准进行漏洞分析…' });

    const systemPrompt = BASE_SYSTEM_PROMPT + buildKnowledgeContext(evidence.results);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map((item: { role: string; content: string }) => ({
        role: item.role as 'user' | 'assistant',
        content: item.content,
      })),
      { role: 'user', content: `请审计以下代码的安全漏洞：\n\n\`\`\`\n${code}\n\`\`\`` },
    ];

    const stream = client.stream(messages, toLLMConfig(modelConfig));

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const handleAbort = () => {
          closed = true;
        };

        const emitStage = (stage: string, detail?: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stage', stage, detail })}

`));
          } catch { /* ignore */ }
        };

        request.signal.addEventListener('abort', handleAbort, { once: true });

        // Flush buffered stage events
        for (const evt of stageEvents) {
          emitStage(evt.stage, evt.detail);
        }

        const safeEnqueue = (payload: unknown): boolean => {
          if (closed) {
            return false;
          }

          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            return true;
          } catch (error) {
            if (isClosedControllerError(error)) {
              closed = true;
              return false;
            }

            throw error;
          }
        };

        const safeClose = () => {
          if (closed) {
            return;
          }

          closed = true;
          try {
            controller.close();
          } catch {
            // Ignore invalid state after disconnect
          }
        };

        try {
          let fullContent = '';

          for await (const chunk of stream) {
            if (closed || request.signal.aborted) {
              break;
            }

            if (chunk.content) {
              const content = chunk.content.toString();
              fullContent += content;
              if (!safeEnqueue({ type: 'content', content })) {
                break;
              }
            }
          }

          if (closed) {
            return;
          }

          emitStage('generate_done', '漏洞分析完成');

          if (evidence.citations.length > 0 && !/GB\/T\s*\d{4,5}-\d{4}\s+[\d.]+/i.test(fullContent)) {
            const appendix = buildCitationAppendix(evidence.citations);
            if (appendix) {
              fullContent += appendix;
              if (!safeEnqueue({ type: 'content', content: appendix })) {
                return;
              }
            }
          }

          emitStage('validate', '正在验证审计结论的标准依据…');
          if (closed || request.signal.aborted) {
            return;
          }

          const grounding = await toolbox.validateGrounding({
            generatedText: fullContent,
            evidenceResults: evidence.results,
            retrievalTrace: evidence.retrievalTrace,
            requireStandardReference: false,
          });

          emitStage('done', '审计完成');

          if (!safeEnqueue({
            type: 'metadata',
            citations: grounding.citations,
            grounding: {
              grounded: grounding.grounded,
              issues: grounding.issues,
            },
            retrievalTrace: grounding.retrievalTrace,
          })) {
            return;
          }

          const usage = createEstimatedUsage({
            messages,
            completionText: fullContent,
          });
          safeEnqueue({ type: 'usage', usage });
          safeClose();
        } catch (error) {
          console.error('Stream error:', error);
          if (closed || request.signal.aborted) {
            return;
          }

          safeEnqueue({
            type: 'error',
            error: getReadableAuditError(error),
            retryable: isRetryableAuditError(error),
          });
          safeClose();
        } finally {
          request.signal.removeEventListener('abort', handleAbort);
        }
      },
      cancel() {
        // client disconnected
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json(
      { error: '审计服务暂时不可用，请稍后重试' },
      { status: 500 },
    );
  }
}

function isClosedControllerError(error: unknown): boolean {
  return error instanceof TypeError
    && (/Invalid state/i.test(error.message) || /already closed/i.test(error.message));
}

function getReadableAuditError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || /timed?\s*out/i.test(error.message)) {
      return '审计请求超时，可能是代码较长、知识库检索较慢或当前模型响应过慢。请稍后重试，或缩小代码片段后再试。';
    }

    if (error.name === 'AbortError') {
      return '审计请求已中断，请重新发起一次审计。';
    }

    return error.message || '审计过程中发生未知错误';
  }

  return '审计过程中发生未知错误';
}

function isRetryableAuditError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'TimeoutError'
    || error.name === 'AbortError'
    || /timed?\s*out/i.test(error.message);
}
