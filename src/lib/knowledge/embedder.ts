/**
 * Embedding 调用器 — 调用 DashScope/OpenAI 兼容接口获取文本向量
 */

interface EmbeddingConfig {
  apiKey: string;
  modelBaseUrl: string;
  /** Embedding 模型 ID，默认 text-embedding-v3 */
  embeddingModel?: string;
  /** 向量维度，默认 1024 */
  dimensions?: number;
}

interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingUsageSummary {
  promptTokens: number;
  totalTokens: number;
}

/** 每批最多处理的文本数（DashScope 限制为 10） */
const BATCH_SIZE = 10;

/**
 * 批量获取文本向量
 * 自动按 BATCH_SIZE 分批调用
 */
export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig,
): Promise<number[][]> {
  const result = await embedTextsWithUsage(texts, config);
  return result.embeddings;
}

export async function embedTextsWithUsage(
  texts: string[],
  config: EmbeddingConfig,
): Promise<{ embeddings: number[][]; usage: EmbeddingUsageSummary }> {
  if (texts.length === 0) {
    return {
      embeddings: [],
      usage: { promptTokens: 0, totalTokens: 0 },
    };
  }

  const model = config.embeddingModel ?? 'text-embedding-v3';
  const dimensions = config.dimensions ?? 1024;

  const allEmbeddings: number[][] = [];
  const usage: EmbeddingUsageSummary = { promptTokens: 0, totalTokens: 0 };

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await callEmbeddingAPI(batch, model, dimensions, config);
    allEmbeddings.push(...result.embeddings);
    usage.promptTokens += result.usage.promptTokens;
    usage.totalTokens += result.usage.totalTokens;
  }

  return { embeddings: allEmbeddings, usage };
}

/**
 * 单次 API 调用
 */
async function callEmbeddingAPI(
  texts: string[],
  model: string,
  dimensions: number,
  config: EmbeddingConfig,
): Promise<{ embeddings: number[][]; usage: EmbeddingUsageSummary }> {
  const baseUrl = config.modelBaseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/embeddings`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
      dimensions,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Embedding API 调用失败 (${response.status}): ${errorText || response.statusText}`,
    );
  }

  const data: EmbeddingResponse = await response.json();

  // 按 index 排序，确保顺序与输入一致
  const sorted = data.data.sort((a, b) => a.index - b.index);
  return {
    embeddings: sorted.map((item) => item.embedding),
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}
