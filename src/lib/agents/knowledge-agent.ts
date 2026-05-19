import {
  importText as localImport,
  search as localSearch,
  listDocuments as localListDocuments,
  type KnowledgeConfig,
  type SearchResultItem,
} from '@/lib/knowledge';
import type { CozeConfig } from 'coze-coding-dev-sdk';
import { getStandardFullName, isStandardType, type StandardType } from '@/lib/standards';

const DATASET_NAME = 'vulnerability_audit_standards';

export class KnowledgeAgent {
  private config: KnowledgeConfig;

  constructor(_customHeaders?: Record<string, string>, cozeConfig?: CozeConfig) {
    this.config = {
      apiKey: cozeConfig?.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '',
      modelBaseUrl: cozeConfig?.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL || '',
    };
  }

  async importText(content: string, metadata?: { title?: string; source?: string }): Promise<{
    success: boolean;
    docId?: string;
    error?: string;
  }> {
    return localImport(content, this.config, {
      filename: metadata?.title || 'unknown',
      title: metadata?.title || 'unknown',
      type: metadata?.source || 'unknown',
    }, DATASET_NAME);
  }

  async importUrl(url: string): Promise<{
    success: boolean;
    docId?: string;
    error?: string;
  }> {
    void url;

    return {
      success: false,
      error: '内建知识库不支持直接导入URL，请下载文件后上传',
    };
  }

  async search(query: string, topK?: number, standardTypes?: StandardType[]): Promise<{
    success: boolean;
    results: SearchResultItem[];
    error?: string;
  }> {
    return localSearch(query, this.config, topK || 5, 0.25, DATASET_NAME, standardTypes);
  }

  async getAvailableStandardTypes(): Promise<StandardType[]> {
    const docs = await localListDocuments(DATASET_NAME);
    const types = new Set<StandardType>();

    for (const doc of docs) {
      if (isStandardType(doc.type)) {
        types.add(doc.type);
      }
    }

    return Array.from(types);
  }

  async searchVulnerabilityType(vulnType: string): Promise<{
    success: boolean;
    results: SearchResultItem[];
    error?: string;
  }> {
    return this.search(`${vulnType} 漏洞定义 危害 示例`, 5);
  }

  async searchStandardClause(standard: StandardType, clause?: string): Promise<{
    success: boolean;
    results: SearchResultItem[];
    error?: string;
  }> {
    const standardName = getStandardFullName(standard);

    const query = clause
      ? `${standardName} ${clause}`
      : `${standardName} 漏洞类型 分类`;

    return this.search(query, 5, [standard]);
  }
}
