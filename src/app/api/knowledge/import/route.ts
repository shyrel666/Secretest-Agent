import { NextRequest, NextResponse } from 'next/server';
import { extractText } from 'unpdf';
import { cleanPdfText, estimateGarbleRate } from '@/lib/knowledge/pdf-cleaner';
import { importText, listDocuments, type KnowledgeConfig } from '@/lib/knowledge';
import { STANDARD_INFO, isStandardType } from '@/lib/standards';
import { invalidateLessonCache } from '@/lib/learning/lesson-cache';

/**
 * 从上传文件中提取文本内容，支持 PDF / TXT / MD
 */
async function extractTextFromFile(file: File): Promise<{ text: string; garbleRate?: number }> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.pdf')) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const { text: pages } = await extractText(buffer);
    const rawText = Array.isArray(pages) ? pages.join('\n') : String(pages);
    const cleaned = cleanPdfText(rawText);
    const garbleRate = estimateGarbleRate(cleaned);
    return { text: cleaned, garbleRate };
  }

  // txt / md 等纯文本
  const text = await file.text();
  return { text };
}

/** 从请求中解析 KnowledgeConfig（前端传入或环境变量兜底） */
function resolveConfig(connConfigStr: string | null): KnowledgeConfig {
  const parsed = connConfigStr ? JSON.parse(connConfigStr) : {};
  return {
    apiKey: parsed.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '',
    modelBaseUrl: parsed.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL || '',
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const type = formData.get('type') as string; // 'java' | 'cpp' | 'csharp'

    if (!file) {
      return NextResponse.json(
        { error: '请上传文件' },
        { status: 400 }
      );
    }

    if (!isStandardType(type)) {
      return NextResponse.json(
        { error: '标准类型无效' },
        { status: 400 }
      );
    }

    const existingDocs = await listDocuments();
    const duplicatedDoc = existingDocs.find((doc) => doc.type === type);
    if (duplicatedDoc) {
      return NextResponse.json(
        { error: `${STANDARD_INFO[type].name} 已上传，如需更换请先删除现有文档` },
        { status: 409 }
      );
    }

    // 解析连接配置并校验
    const connConfigStr = formData.get('connectionConfig') as string | null;
    const config = resolveConfig(connConfigStr);

    if (!config.apiKey) {
      return NextResponse.json(
        { error: 'API Key 未配置。请在「设置」页面填写 API Key，或设置环境变量 COZE_WORKLOAD_IDENTITY_API_KEY' },
        { status: 400 }
      );
    }
    if (!config.modelBaseUrl) {
      return NextResponse.json(
        { error: '模型接口地址未配置。请在「设置」页面填写模型接口地址' },
        { status: 400 }
      );
    }

    // 提取文件文本内容（支持 PDF）
    let content: string;
    let garbleRate: number | undefined;
    try {
      const extracted = await extractTextFromFile(file);
      content = extracted.text;
      garbleRate = extracted.garbleRate;
    } catch (parseError) {
      console.error('File parse error:', parseError);
      return NextResponse.json(
        { error: '文件解析失败，请确认文件格式正确且未损坏' },
        { status: 400 }
      );
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: '文件内容为空，无法提取到有效文本' },
        { status: 400 }
      );
    }

    if (garbleRate !== undefined && garbleRate > 0.3) {
      console.warn(`PDF garble rate high: ${(garbleRate * 100).toFixed(1)}% for ${file.name}`);
    }

    // 添加元数据标记
    const fullText = [
      `【标准名称】${title || file.name}`,
      `【标准类型】${STANDARD_INFO[type].name} ${STANDARD_INFO[type].languageLabel}`,
      `【上传时间】${new Date().toISOString()}`,
      '---',
      content,
    ].join('\n\n');

    // 使用内建知识库导入
    const result = await importText(fullText, config, {
      filename: file.name,
      title: title || file.name,
      type,
    });

    if (result.success) {
      invalidateLessonCache();
      return NextResponse.json({
        success: true,
        message: '文档导入成功',
        docId: result.docId,
        usage: result.usage,
        garbleRate,
      });
    }

    return NextResponse.json(
      { error: result.error || '导入失败' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Knowledge import error:', error);
    const message = error instanceof Error ? error.message : '导入过程中出现错误';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
