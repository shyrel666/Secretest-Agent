import { getChunksByClausePrefix, listDocuments, search, type DocumentMeta, type KnowledgeConfig, type SearchResultItem } from './index';
import { STANDARD_INFO, getLanguageLabel, type StandardType } from '@/lib/standards';
import { sumTokenUsage, type TokenUsage } from '@/lib/token-usage';

export interface ToolCitation {
  docId: string;
  standardType?: StandardType;
  standardName?: string;
  clauseNumber?: string;
  sectionPath?: string;
}

export interface RetrievalTraceItem {
  tool: string;
  summary: string;
  query?: string;
  hitCount: number;
  citations: ToolCitation[];
}

export interface ToolSearchResult {
  success: boolean;
  results: SearchResultItem[];
  citations: ToolCitation[];
  retrievalTrace: RetrievalTraceItem[];
  usage?: TokenUsage;
  error?: string;
}

export interface GroundingValidation {
  grounded: boolean;
  citations: ToolCitation[];
  retrievalTrace: RetrievalTraceItem[];
  issues: string[];
}

export interface UploadedStandardInfo {
  type: StandardType;
  name: string;
  fullName: string;
  languageLabel: string;
  documents: DocumentMeta[];
}

function normalizeText(value?: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[\s\-_/()（）,，.:：]/g, '');
}

function parseStandardReference(reference?: string): {
  raw: string;
  standardName?: string;
  standardType?: StandardType;
  clauseNumber?: string;
} | null {
  const raw = (reference || '').trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/(GB\/T\s*\d{4,5}-\d{4})\s*([\d.]+)?/i);
  if (!match) {
    return { raw };
  }

  const normalizedStandard = match[1].replace(/\s+/g, ' ').toUpperCase();
  const clauseNumber = match[2];

  const standardType = (Object.entries(STANDARD_INFO).find(([, info]) => info.name.toUpperCase() === normalizedStandard)?.[0] || '') as StandardType;

  return {
    raw,
    standardName: normalizedStandard,
    standardType: standardType || undefined,
    clauseNumber,
  };
}

function extractCitationPatterns(content: string): string[] {
  return Array.from(
    new Set(
      Array.from(content.matchAll(/GB\/T\s*\d{4,5}-\d{4}\s+[\d.]+/gi)).map((match) => match[0].trim()),
    ),
  );
}

function normalizeCodeForSimilarity(code: string): string {
  return code
    .toLowerCase()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '"str"')
    .replace(/'(?:\\.|[^'\\])*'/g, "'c'")
    .replace(/\b\d+\b/g, '0')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function splitCodeLines(code: string): string[] {
  return code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 8);
}

function calculateLineOverlapRatio(linesA: string[], linesB: string[]): number {
  if (linesA.length === 0 || linesB.length === 0) {
    return 0;
  }

  const lineSetB = new Set(linesB);
  let overlapCount = 0;

  for (const line of linesA) {
    if (lineSetB.has(line)) {
      overlapCount++;
    }
  }

  return overlapCount / Math.max(linesA.length, 1);
}

function isCodeTooSimilarToKnowledge(
  generatedCode: string,
  knowledgeItems: Array<{ content: string }>,
): boolean {
  const normalizedGenerated = normalizeCodeForSimilarity(generatedCode);
  if (normalizedGenerated.length < 40) {
    return false;
  }

  const generatedLines = splitCodeLines(normalizedGenerated);

  return knowledgeItems.some((item) => {
    const normalizedKnowledge = normalizeCodeForSimilarity(item.content);
    if (normalizedKnowledge.length === 0) {
      return false;
    }

    if (normalizedKnowledge.includes(normalizedGenerated)) {
      return true;
    }

    const knowledgeLines = splitCodeLines(normalizedKnowledge);
    const overlapRatio = calculateLineOverlapRatio(generatedLines, knowledgeLines);
    return overlapRatio >= 0.6;
  });
}

function dedupeSearchResults(results: SearchResultItem[]): SearchResultItem[] {
  const map = new Map<string, SearchResultItem>();

  for (const item of results) {
    const key = `${item.docId}:${item.clauseNumber || ''}:${item.content.trim().slice(0, 180)}`;
    const existing = map.get(key);
    if (!existing || item.score > existing.score) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if ((a.clauseNumber || '') && (b.clauseNumber || '') && a.clauseNumber === b.clauseNumber) {
      return b.score - a.score;
    }

    return b.score - a.score;
  });
}

function getStandardTypeForLanguage(value?: string): StandardType[] | undefined {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'java') return ['java'];
  if (normalized === 'cpp' || normalized === 'c' || normalized === 'c++' || normalized === 'c_cpp') return ['cpp'];
  if (normalized === 'csharp' || normalized === 'c#') return ['csharp'];
  return undefined;
}

export class InternalMcpToolbox {
  private documentsPromise?: Promise<DocumentMeta[]>;

  constructor(private readonly config: KnowledgeConfig) {}

  private async getDocuments(): Promise<DocumentMeta[]> {
    if (!this.documentsPromise) {
      this.documentsPromise = listDocuments();
    }

    return this.documentsPromise;
  }

  private async buildCitations(
    results: SearchResultItem[],
    preferredTypes?: StandardType[],
  ): Promise<ToolCitation[]> {
    const documents = await this.getDocuments();
    const docMap = new Map(documents.map((doc) => [doc.id, doc]));

    return Array.from(
      new Map(
        results.map((result) => {
          const doc = docMap.get(result.docId);
          const inferredType = (doc?.type && preferredTypes?.includes(doc.type as StandardType) ? doc.type : doc?.type) as StandardType | undefined;

          const citation: ToolCitation = {
            docId: result.docId,
            standardType: inferredType,
            standardName: inferredType ? STANDARD_INFO[inferredType].name : undefined,
            clauseNumber: result.clauseNumber,
            sectionPath: result.sectionPath,
          };

          const key = `${citation.docId}:${citation.clauseNumber || ''}:${citation.sectionPath || ''}`;
          return [key, citation] as const;
        }),
      ).values(),
    );
  }

  detectLanguageAndScope(params: {
    code?: string;
    language?: string;
    standardReference?: string;
    vulnerabilityType?: string;
  }): {
    language: string;
    standardTypes?: StandardType[];
    languageLabel: string;
    scopeSummary: string;
    standardReference?: string;
  } {
    const ref = parseStandardReference(params.standardReference);

    let detectedLanguage = (params.language || '').trim();
    if (!detectedLanguage && ref?.standardType) {
      detectedLanguage = ref.standardType;
    }

    if (!detectedLanguage && params.code) {
      if (/\bimport\s+java\b|\bpackage\s+[\w.]+;|\bpublic\s+class\b|\bString\[\]\s+args\b/.test(params.code)) {
        detectedLanguage = 'java';
      } else if (/\busing\s+System\b|\bnamespace\s+\w+/.test(params.code)) {
        detectedLanguage = 'csharp';
      } else if (/\b#include\s*[<"]|int\s+main\s*\(/.test(params.code)) {
        detectedLanguage = 'cpp';
      }
    }

    const standardTypes = ref?.standardType
      ? [ref.standardType]
      : getStandardTypeForLanguage(detectedLanguage);

    const scopeParts = [
      standardTypes?.length ? `标准范围：${standardTypes.map((type) => STANDARD_INFO[type].name).join('、')}` : '标准范围：全部已上传文档',
      params.vulnerabilityType ? `漏洞方向：${params.vulnerabilityType}` : undefined,
      detectedLanguage ? `语言：${getLanguageLabel(detectedLanguage)}` : undefined,
    ].filter(Boolean);

    return {
      language: detectedLanguage || 'unknown',
      standardTypes,
      languageLabel: getLanguageLabel(detectedLanguage),
      scopeSummary: scopeParts.join(' | '),
      standardReference: ref?.raw,
    };
  }

  async listUploadedStandards(): Promise<{
    success: boolean;
    standards: UploadedStandardInfo[];
    retrievalTrace: RetrievalTraceItem[];
  }> {
    const documents = await this.getDocuments();
    const grouped = new Map<StandardType, DocumentMeta[]>();

    for (const document of documents) {
      if (!Object.prototype.hasOwnProperty.call(STANDARD_INFO, document.type)) {
        continue;
      }

      const type = document.type as StandardType;
      const current = grouped.get(type) || [];
      current.push(document);
      grouped.set(type, current);
    }

    const standards = Array.from(grouped.entries()).map(([type, docs]) => ({
      type,
      name: STANDARD_INFO[type].name,
      fullName: STANDARD_INFO[type].fullName,
      languageLabel: STANDARD_INFO[type].languageLabel,
      documents: docs,
    }));

    return {
      success: true,
      standards,
      retrievalTrace: [{
        tool: 'list_uploaded_standards',
        summary: `已发现 ${standards.length} 类已上传标准`,
        hitCount: standards.length,
        citations: [],
      }],
    };
  }

  async searchStandardClauses(params: {
    query?: string;
    queries?: string[];
    standardTypes?: StandardType[];
    topK?: number;
    threshold?: number;
  }): Promise<ToolSearchResult> {
    const rawQueries = (params.queries || []).concat(params.query || '').map((query) => query.trim()).filter(Boolean);
    const uniqueQueries = Array.from(new Set(rawQueries));

    if (uniqueQueries.length === 0) {
      return {
        success: false,
        results: [],
        citations: [],
        retrievalTrace: [{
          tool: 'search_standard_clauses',
          summary: '未提供检索查询',
          hitCount: 0,
          citations: [],
        }],
        error: '未提供检索查询',
      };
    }

    const responses = await Promise.all(
      uniqueQueries.map((query) => search(
        query,
        this.config,
        Math.max(params.topK || 6, 6),
        params.threshold ?? 0.25,
        undefined,
        params.standardTypes,
      )),
    );

    const mergedResults = dedupeSearchResults(
      responses.flatMap((response) => response.success ? response.results : []),
    ).slice(0, params.topK || 6);
    const citations = await this.buildCitations(mergedResults, params.standardTypes);

    return {
      success: mergedResults.length > 0,
      results: mergedResults,
      citations,
      retrievalTrace: [{
        tool: 'search_standard_clauses',
        summary: `执行 ${uniqueQueries.length} 组检索，命中 ${mergedResults.length} 个标准片段`,
        query: uniqueQueries.join(' | '),
        hitCount: mergedResults.length,
        citations,
      }],
      usage: sumTokenUsage(responses.map((response) => response.usage)),
      error: mergedResults.length > 0 ? undefined : '未检索到匹配的标准条款',
    };
  }

  async getClauseContext(params: {
    clauseNumber?: string;
    clausePrefix?: string;
    standardTypes?: StandardType[];
  }): Promise<ToolSearchResult> {
    const clauseRef = params.clausePrefix || params.clauseNumber;
    if (!clauseRef) {
      return {
        success: false,
        results: [],
        citations: [],
        retrievalTrace: [{
          tool: 'get_clause_context',
          summary: '未提供条款号或条款前缀',
          hitCount: 0,
          citations: [],
        }],
        error: '未提供条款号或条款前缀',
      };
    }

    const types = params.standardTypes && params.standardTypes.length > 0 ? params.standardTypes : [undefined];
    const chunks = types.flatMap((type) => getChunksByClausePrefix(clauseRef, type));
    const filtered = params.clauseNumber
      ? chunks.filter((chunk) => chunk.clauseNumber === params.clauseNumber)
      : chunks;
    const results = dedupeSearchResults(filtered);
    const citations = await this.buildCitations(results, params.standardTypes);

    return {
      success: results.length > 0,
      results,
      citations,
      retrievalTrace: [{
        tool: 'get_clause_context',
        summary: `按条款 ${clauseRef} 加载 ${results.length} 个上下文片段`,
        query: clauseRef,
        hitCount: results.length,
        citations,
      }],
      error: results.length > 0 ? undefined : `未找到条款 ${clauseRef} 的上下文`,
    };
  }

  async getSectionLessonContext(params: {
    clausePrefix: string;
    standardType?: StandardType;
  }): Promise<ToolSearchResult> {
    return this.getClauseContext({
      clausePrefix: params.clausePrefix,
      standardTypes: params.standardType ? [params.standardType] : undefined,
    });
  }

  async validateGrounding(params: {
    generatedText?: string;
    question?: {
      code?: string;
      language?: string;
      standardReference?: string;
      vulnerabilityType?: string;
    };
    evidenceResults?: SearchResultItem[];
    retrievalTrace?: RetrievalTraceItem[];
    requireStandardReference?: boolean;
    requireEvidence?: boolean;
  }): Promise<GroundingValidation> {
    const issues: string[] = [];
    const evidenceResults = params.evidenceResults || [];
    const citations = await this.buildCitations(evidenceResults);
    const retrievalTrace = params.retrievalTrace || [];
    const requireEvidence = params.requireEvidence !== false;
    const requireStandardReference = params.requireStandardReference !== false;

    if (requireEvidence && evidenceResults.length === 0) {
      issues.push('缺少知识库证据，结果无法判定为 grounded');
    }

    const standardReference = params.question?.standardReference
      || extractCitationPatterns(params.generatedText || '')[0];
    const parsedReference = parseStandardReference(standardReference);

    if (requireStandardReference && !parsedReference?.clauseNumber) {
      issues.push('缺少有效的标准条款引用');
    }

    if (parsedReference?.clauseNumber && evidenceResults.length > 0) {
      const hasExactClause = evidenceResults.some((item) => item.clauseNumber === parsedReference.clauseNumber);
      if (!hasExactClause) {
        const exactContext = await this.getClauseContext({
          clauseNumber: parsedReference.clauseNumber,
          standardTypes: parsedReference.standardType ? [parsedReference.standardType] : undefined,
        });

        if (!exactContext.success) {
          issues.push(`标准引用 ${parsedReference.raw} 无法在知识库中回查`);
        }
      }
    }

    if (params.question?.code && evidenceResults.length > 0 && isCodeTooSimilarToKnowledge(params.question.code, evidenceResults)) {
      issues.push('生成代码与知识库原始示例过于相似');
    }

    if (params.question?.vulnerabilityType && !parsedReference?.clauseNumber) {
      const normalizedVuln = normalizeText(params.question.vulnerabilityType);
      const evidenceMentions = evidenceResults.some((item) => normalizeText(item.content).includes(normalizedVuln));
      if (!evidenceMentions) {
        issues.push('知识片段未能明显支撑当前漏洞类型');
      }
    }

    if (params.generatedText && citations.length > 0 && extractCitationPatterns(params.generatedText).length === 0) {
      issues.push('生成内容未显式输出标准条款引用');
    }

    return {
      grounded: issues.length === 0,
      citations,
      retrievalTrace,
      issues,
    };
  }
}
