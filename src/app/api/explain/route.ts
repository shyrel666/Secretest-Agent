import { NextRequest, NextResponse } from 'next/server';
import { ExplainerAgent } from '@/lib/agents/explainer-agent';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import type { ModelConfig } from '@/lib/agents/types';
import { createEstimatedUsage } from '@/lib/token-usage';

export async function POST(request: NextRequest) {
  try {
    const { question, userAnswer, isCorrect, config, connectionConfig } = await request.json();

    if (!question || userAnswer === undefined || isCorrect === undefined) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    // 传入配置创建explainer
    const explainerAgent = new ExplainerAgent(customHeaders, config as ModelConfig | undefined, connectionConfig);

    // 创建流式响应
    const stream = explainerAgent.explainWrongAnswerStream({
      question,
      userAnswer,
      isCorrect,
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullContent = '';
        let closed = false;
        const handleAbort = () => {
          closed = true;
        };

        request.signal.addEventListener('abort', handleAbort, { once: true });

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

        const safeError = (error: unknown) => {
          if (closed) {
            return;
          }

          closed = true;
          try {
            controller.error(error);
          } catch {
            // Ignore invalid state after disconnect
          }
        };

        try {
          for await (const chunk of stream) {
            if (closed || request.signal.aborted) {
              break;
            }

            if (chunk.type === 'content' && chunk.content) {
              fullContent += chunk.content;
              if (!safeEnqueue({ type: 'content', content: chunk.content })) {
                break;
              }
            } else if (chunk.type === 'metadata') {
              if (!safeEnqueue({
                type: 'metadata',
                citations: chunk.citations,
                grounding: chunk.grounding,
                retrievalTrace: chunk.retrievalTrace,
              })) {
                break;
              }
            }
          }

          if (closed) {
            return;
          }

          const usage = createEstimatedUsage({
            promptText: JSON.stringify({ question, userAnswer, isCorrect }),
            completionText: fullContent,
          });
          safeEnqueue({ type: 'usage', usage });
          safeClose();
        } catch (error) {
          console.error('Stream error:', error);
          safeError(error);
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
    console.error('Explain API error:', error);
    return NextResponse.json(
      { error: '讲解服务暂时不可用' },
      { status: 500 }
    );
  }
}

function isClosedControllerError(error: unknown): boolean {
  return error instanceof TypeError
    && (/Invalid state/i.test(error.message) || /already closed/i.test(error.message));
}
