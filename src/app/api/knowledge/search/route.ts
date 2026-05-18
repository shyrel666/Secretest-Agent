import { NextRequest, NextResponse } from 'next/server';
import { search, type KnowledgeConfig } from '@/lib/knowledge';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const topK = parseInt(searchParams.get('topK') || '5');

    if (!query) {
      return NextResponse.json(
        { error: '请提供搜索关键词' },
        { status: 400 }
      );
    }

    // 解析连接配置
    const connConfigStr = request.headers.get('x-connection-config');
    const parsed = connConfigStr ? JSON.parse(connConfigStr) : {};
    const config: KnowledgeConfig = {
      apiKey: parsed.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '',
      modelBaseUrl: parsed.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL || '',
    };

    const result = await search(query, config, topK);

    if (result.success) {
      return NextResponse.json({
        success: true,
        results: result.results,
        usage: result.usage,
      });
    }

    return NextResponse.json(
      { error: result.error || '搜索失败' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Knowledge search error:', error);
    return NextResponse.json(
      { error: '搜索过程中出现错误' },
      { status: 500 }
    );
  }
}
