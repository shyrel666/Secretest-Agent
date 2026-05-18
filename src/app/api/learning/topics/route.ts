import { NextResponse } from 'next/server';
import { getDocumentSections, isReadableKnowledgeTitle, listDocuments } from '@/lib/knowledge';
import type { DocumentSection } from '@/lib/knowledge';
import {
  LEARNING_TOPICS,
  STATIC_FALLBACK_CLAUSES,
  type DynamicLearningTopic,
  type LearningTopicLanguage,
} from '@/lib/learning/topics';
import { isStandardType, STANDARD_INFO, type StandardType } from '@/lib/standards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/learning/topics
 *
 * 返回学习章节列表：
 * 1. 优先从数据库文档结构中提取（每个标准的漏洞分类章节）
 * 2. 如果文档乱码无法提取章节，退回硬编码章节列表
 */
export async function GET() {
  try {
    const topics: DynamicLearningTopic[] = [];
    const coveredTypes = new Set<string>();
    const documents = await listDocuments();
    const availableDocTypes = Array.from(
      new Set(
        documents
          .map((doc) => doc.type)
          .filter((type): type is StandardType => isStandardType(type)),
      ),
    );

    // 1. 只对当前仍存在文档的语言提取学习章节
    for (const stdType of availableDocTypes) {
      const sections = getDocumentSections(stdType);

      const mainlineSections = sections.filter(isMainlineSection);
      const readableMainlineSections = mainlineSections.filter((section) => isReadableSection(section));

      if (readableMainlineSections.length >= Math.max(3, Math.ceil(mainlineSections.length * 0.6))) {
        // 数据库提取成功——优先使用 6.2.x 主线章节，附录类作为补充折叠显示
        coveredTypes.add(stdType);
        const standardName = STANDARD_INFO[stdType].name;
        const supplementalSections = sections.filter((section) => isSupplementalSection(section) && isReadableSection(section));

        for (const section of readableMainlineSections) {
          topics.push(buildTopicFromSection(section, stdType, standardName, 'core'));
        }

        for (const section of supplementalSections) {
          topics.push(buildTopicFromSection(section, stdType, standardName, 'supplemental'));
        }
      }
    }

    // 2. 对于已上传、但数据库无法提取章节的语言（例如 PDF 乱码），退回硬编码章节
    for (const topic of LEARNING_TOPICS) {
      if (!availableDocTypes.includes(topic.language)) continue;
      if (coveredTypes.has(topic.language)) continue;

      // 把硬编码 topic 也包装为 DynamicLearningTopic 格式，尽量复用静态条款元数据
      const clauseData = STATIC_FALLBACK_CLAUSES[topic.id];
      topics.push({
        ...topic,
        clausePrefix: clauseData?.clausePrefix || '',
        docId: '',
        subClauses: clauseData?.subClauses || [],
        fromDocument: false,
        contentSource: 'fallback',
        topicGroup: 'core',
      });
    }

    // 3. 按语言分组统计
    const languageGroups: Record<string, number> = {};
    for (const t of topics) {
      languageGroups[t.language] = (languageGroups[t.language] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      topics,
      meta: {
        total: topics.length,
        byLanguage: languageGroups,
        coveredByDocument: Array.from(coveredTypes),
        availableDocTypes,
        fallbackLanguages: availableDocTypes.filter((t) => !coveredTypes.has(t)),
        coreCount: topics.filter((topic) => topic.topicGroup === 'core').length,
        supplementalCount: topics.filter((topic) => topic.topicGroup === 'supplemental').length,
      },
    });
  } catch (error) {
    console.error('Learning topics API error:', error);
    return NextResponse.json(
      { error: '无法加载学习章节' },
      { status: 500 },
    );
  }
}

function buildTopicFromSection(
  section: DocumentSection,
  stdType: StandardType,
  standardName: string,
  topicGroup: 'core' | 'supplemental',
): DynamicLearningTopic {
  const topicId = `${stdType}-sec-${section.clauseNumber}`;
  const subClauses = section.childClauses.map((cn, i) => ({
    clause: cn,
    title: section.childTitles[i] || cn,
  }));

  const childNames = subClauses
    .map((sc) => sc.title)
    .filter((title) => isReadableTitle(title))
    .slice(0, 6);
  const summary = childNames.length > 0
    ? `涵盖${childNames.join('、')}等${section.childClauses.length}个检查点。`
    : `${section.title}相关的标准条款学习。`;

  const searchQueries = [
    `${section.title} 漏洞 条款`,
    ...childNames.slice(0, 3).map((name) => `${name} 安全编码`),
  ];

  return {
    id: topicId,
    language: stdType as LearningTopicLanguage,
    title: `${section.clauseNumber} ${section.title}`,
    summary,
    difficulty: topicGroup === 'core' ? 'beginner' : 'intermediate',
    estimatedMinutes: Math.max(10, Math.min(topicGroup === 'core' ? 30 : 22, section.chunkCount * 2)),
    vulnerabilityFocus: section.title,
    searchQueries,
    goals: [
      `理解“${section.title}”相关条款的核心要求`,
      ...childNames.slice(0, 3).map((name) => `能识别${name}涉及的典型检查点`),
    ],
    standard: standardName,
    clausePrefix: section.clauseNumber,
    docId: section.docId,
    subClauses,
    fromDocument: true,
    contentSource: 'document',
    topicGroup,
  };
}

function isMainlineSection(section: DocumentSection): boolean {
  return /^6\.2\.\d+$/.test(section.clauseNumber);
}

function isSupplementalSection(section: DocumentSection): boolean {
  return /^A\./.test(section.clauseNumber);
}

function isReadableSection(section: DocumentSection): boolean {
  if (!isReadableTitle(section.title)) {
    return false;
  }

  if (section.childTitles.length === 0) {
    return true;
  }

  const readableChildren = section.childTitles.filter((title) => isReadableTitle(title));
  return readableChildren.length >= Math.max(1, Math.ceil(section.childTitles.length * 0.4));
}

function isReadableTitle(title: string): boolean {
  return isReadableKnowledgeTitle(title);
}
