import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { ExplainerAgent } from '@/lib/agents/explainer-agent';
import type { ModelConfig } from '@/lib/agents/types';
import { getLearningTopic } from '@/lib/learning/topics';
import { resolveUserContext } from '@/lib/user-context';
import {
  buildLessonCacheKey,
  clearPendingLesson,
  getCachedLesson,
  getPendingLesson,
  setCachedLesson,
  setPendingLesson,
  type CachedLessonPayload,
} from '@/lib/learning/lesson-cache';

const LESSON_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const { topicId, clausePrefix, docId, config, connectionConfig, stream } = await request.json();

    if (!topicId || typeof topicId !== 'string') {
      return NextResponse.json(
        { error: '缺少章节标识' },
        { status: 400 },
      );
    }

    // 优先尝试从硬编码 topic 中查找（向后兼容）
    const hardcodedTopic = getLearningTopic(topicId);

    // 如果既没有硬编码 topic，也没有 clausePrefix，说明 topic 无效
    if (!hardcodedTopic && !clausePrefix) {
      return NextResponse.json(
        { error: '章节不存在' },
        { status: 404 },
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const lessonConnectionConfig = {
      ...connectionConfig,
      timeout: Math.max(connectionConfig?.timeout ?? 0, LESSON_REQUEST_TIMEOUT_MS),
    };
    const hasApiKey = Boolean(
      lessonConnectionConfig?.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY,
    );
    const hasModelBaseUrl = Boolean(
      lessonConnectionConfig?.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL,
    );

    if (!hasApiKey || !hasModelBaseUrl) {
      return NextResponse.json(
        { error: '请先在「设置」页面配置有效的 API Key 和模型接口地址' },
        { status: 400 },
      );
    }

    const explainerAgent = new ExplainerAgent(
      customHeaders,
      config as ModelConfig | undefined,
      lessonConnectionConfig,
    );
    const explainerConfig = config as ModelConfig | undefined;
    const userContext = resolveUserContext(request);
    const cacheKey = buildLessonCacheKey({
      userId: userContext.userId,
      topicId,
      clausePrefix,
      docId,
      model: explainerConfig?.model || 'default',
      temperature: explainerConfig?.temperature ?? 0.5,
      thinking: explainerConfig?.thinking ?? true,
      modelBaseUrl: lessonConnectionConfig?.modelBaseUrl,
    });
    const cachedLesson = getCachedLesson(cacheKey);

    if (stream) {
      if (cachedLesson) {
        return createCachedLessonEventStream(cachedLesson, true);
      }

      const pendingLesson = getPendingLesson(cacheKey);
      if (pendingLesson) {
        return createPendingLessonEventStream(pendingLesson);
      }

      return createLiveLessonEventStream({
        request,
        cacheKey,
        clausePrefix,
        topicId,
        hardcodedTopic,
        explainerAgent,
      });
    }

    if (cachedLesson) {
      return NextResponse.json({
        success: true,
        ...cachedLesson,
      });
    }

    const pendingLesson = getPendingLesson(cacheKey);
    if (pendingLesson) {
      const lesson = await pendingLesson;
      return NextResponse.json({
        success: true,
        ...lesson,
      });
    }

    // 根据是否有 clausePrefix 选择不同的生成路径
    if (clausePrefix && typeof clausePrefix === 'string') {
      // —— 文档驱动路径：基于条款前缀从文档中加载内容 ——
      const result = await explainerAgent.generateLessonFromSection({
        clausePrefix,
        topicId,
        language: topicId.split('-')[0] as 'java' | 'cpp' | 'csharp',
      });

      if (!result.success || !result.lesson) {
        return NextResponse.json(
          { error: result.error || '学习章节生成失败' },
          { status: 400 },
        );
      }

      return NextResponse.json({
        success: true,
        ...setCachedLesson(cacheKey, {
          lessonDocument: result.lesson.lessonDocument,
          references: result.lesson.references,
          usage: result.usage,
          citations: result.citations,
          grounding: result.grounding,
          retrievalTrace: result.retrievalTrace,
        }),
      });
    }

    // —— 回退路径：使用搜索关键词（硬编码 topic） ——
    const topic = hardcodedTopic!;
    const result = await explainerAgent.generateLearningLesson({
      language: topic.language,
      title: topic.title,
      summary: topic.summary,
      goals: topic.goals,
      searchQueries: topic.searchQueries,
      standard: topic.standard,
      vulnerabilityFocus: topic.vulnerabilityFocus,
    });

    if (!result.success || !result.lesson) {
      return NextResponse.json(
        { error: result.error || '学习章节生成失败' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      ...setCachedLesson(cacheKey, {
        lessonDocument: result.lesson.lessonDocument,
        references: result.lesson.references,
        usage: result.usage,
        citations: result.citations,
        grounding: result.grounding,
        retrievalTrace: result.retrievalTrace,
      }),
      topic,
    });
  } catch (error) {
    console.error('Learning lesson API error:', error);
    return NextResponse.json(
      { error: '学习章节服务暂时不可用' },
      { status: 500 },
    );
  }
}

function createCachedLessonEventStream(payload: CachedLessonPayload, fromCache: boolean) {
  const readableStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'result',
        ...payload,
        fromCache,
      })}\n\n`));
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function createPendingLessonEventStream(pendingLesson: Promise<CachedLessonPayload>) {
  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const payload = await pendingLesson;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'result',
          ...payload,
          fromCache: true,
        })}\n\n`));
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : '学习章节生成失败',
        })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function toLessonErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '学习章节生成失败';
  if (message === 'Request timed out.') {
    return '学习章节生成超时，请稍后重试';
  }

  return message;
}

function createLiveLessonEventStream(params: {
  request: NextRequest;
  cacheKey: string;
  clausePrefix?: string;
  topicId: string;
  hardcodedTopic: ReturnType<typeof getLearningTopic>;
  explainerAgent: ExplainerAgent;
}) {
  const { request, cacheKey, clausePrefix, topicId, hardcodedTopic, explainerAgent } = params;
  let resolvePendingLesson: ((payload: CachedLessonPayload) => void) | undefined;
  let rejectPendingLesson: ((reason?: unknown) => void) | undefined;
  const pendingLesson = new Promise<CachedLessonPayload>((resolve, reject) => {
    resolvePendingLesson = resolve;
    rejectPendingLesson = reject;
  });
  void pendingLesson.catch(() => undefined);
  setPendingLesson(cacheKey, pendingLesson);

  const lessonStream = clausePrefix && typeof clausePrefix === 'string'
    ? explainerAgent.generateLessonFromSectionStream({
        clausePrefix,
        topicId,
        language: topicId.split('-')[0] as 'java' | 'cpp' | 'csharp',
      })
    : explainerAgent.generateLearningLessonStream({
        language: hardcodedTopic!.language,
        title: hardcodedTopic!.title,
        summary: hardcodedTopic!.summary,
        goals: hardcodedTopic!.goals,
        searchQueries: hardcodedTopic!.searchQueries,
        standard: hardcodedTopic!.standard,
        vulnerabilityFocus: hardcodedTopic!.vulnerabilityFocus,
      });

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const handleAbort = () => {
        closed = true;
      };

      request.signal.addEventListener('abort', handleAbort, { once: true });

      const send = (payload: unknown): boolean => {
        if (closed) {
          return false;
        }

        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      const close = () => {
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
        for await (const chunk of lessonStream) {
          if (chunk.type === 'stage') {
            send(chunk);
            continue;
          }

          if (chunk.type === 'content') {
            send({
              type: 'content',
              content: chunk.content,
            });
            continue;
          }

          if (chunk.type === 'error') {
            throw new Error(toLessonErrorMessage(chunk.error));
          }

          const payload = setCachedLesson(cacheKey, {
            lessonDocument: chunk.lesson.lessonDocument,
            references: chunk.lesson.references,
            usage: chunk.usage,
            citations: chunk.citations,
            grounding: chunk.grounding,
            retrievalTrace: chunk.retrievalTrace,
          });
          resolvePendingLesson?.(payload);
          send({
            type: 'metadata',
            ...payload,
            qualityWarnings: chunk.qualityWarnings,
            fromCache: false,
          });
        }

        close();
      } catch (error) {
        clearPendingLesson(cacheKey);
        rejectPendingLesson?.(error);
        send({
          type: 'error',
          error: toLessonErrorMessage(error),
        });
        close();
      } finally {
        request.signal.removeEventListener('abort', handleAbort);
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
