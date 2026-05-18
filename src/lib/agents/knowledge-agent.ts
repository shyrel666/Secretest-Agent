import {
  importText as localImport,
  search as localSearch,
  listDocuments as localListDocuments,
  type KnowledgeConfig,
  type SearchResultItem,
} from '@/lib/knowledge';
import type { CozeConfig } from 'coze-coding-dev-sdk';
import { getStandardFullName, isStandardType, type StandardType } from '@/lib/standards';

// 知识库数据集名称
const DATASET_NAME = 'vulnerability_audit_standards';

/**
 * 漏洞类型 → 同义词/关联词 查询扩展表
 */
const VULN_SYNONYMS: Record<string, string[]> = {
  'SQL注入': ['SQL injection', 'sql注入', '数据库注入', '参数化查询', 'PreparedStatement'],
  'XSS': ['跨站脚本', '反射型XSS', '存储型XSS', 'DOM型XSS', 'cross-site scripting', '脚本注入'],
  '命令注入': ['command injection', 'OS命令注入', '系统命令', 'Runtime.exec', 'ProcessBuilder'],
  '路径遍历': ['path traversal', '目录遍历', '../../', '文件包含', '任意文件读取'],
  '缓冲区溢出': ['buffer overflow', '栈溢出', '堆溢出', '数组越界', '内存安全'],
  '整数溢出': ['integer overflow', '整数回绕', '算术溢出', '数值范围'],
  '资源泄露': ['resource leak', '内存泄露', '连接泄露', '文件句柄', '资源释放'],
  '空指针': ['null pointer', 'NullPointerException', '空引用', '解引用'],
  '格式化字符串': ['format string', '格式化漏洞', 'printf', '字符串格式化'],
  '密码安全': ['硬编码密码', '弱密码', '密码明文', '加密', '哈希'],
  '访问控制': ['权限检查', '越权', '认证绕过', '授权', 'access control'],
  '并发安全': ['race condition', '竞态条件', '线程安全', '同步', '死锁', '并发'],
};

/**
 * 扩展查询 — 为用户查询添加同义词/关联词，提高召回率
 */
function expandQuery(query: string): string {
  const additions: string[] = [];

  for (const [key, synonyms] of Object.entries(VULN_SYNONYMS)) {
    if (query.includes(key) || synonyms.some((s) => query.toLowerCase().includes(s.toLowerCase()))) {
      // 从同义词列表取最多 2 个补充词，避免查询过长
      const extras = synonyms.filter((s) => !query.toLowerCase().includes(s.toLowerCase())).slice(0, 2);
      additions.push(...extras);
    }
  }

  if (additions.length === 0) return query;
  return `${query} ${additions.join(' ')}`;
}

export class KnowledgeAgent {
  private config: KnowledgeConfig;

  constructor(_customHeaders?: Record<string, string>, cozeConfig?: CozeConfig) {
    this.config = {
      apiKey: cozeConfig?.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '',
      modelBaseUrl: cozeConfig?.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL || '',
    };
  }

  /**
   * 导入文本内容到知识库
   */
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

  /**
   * 导入URL内容到知识库（内建知识库不支持 URL 直接导入，返回提示）
   */
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

  /**
   * 混合检索知识库（查询自动扩展 + 向量/关键词/条款融合）
   */
  async search(query: string, topK?: number, standardTypes?: StandardType[]): Promise<{
    success: boolean;
    results: SearchResultItem[];
    error?: string;
  }> {
    const expandedQuery = expandQuery(query);
    return localSearch(expandedQuery, this.config, topK || 5, 0.25, DATASET_NAME, standardTypes);
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

  /**
   * 搜索特定漏洞类型的内容（查询自动扩展同义词）
   */
  async searchVulnerabilityType(vulnType: string): Promise<{
    success: boolean;
    results: SearchResultItem[];
    error?: string;
  }> {
    return this.search(`${vulnType} 漏洞定义 危害 示例`, 5);
  }

  /**
   * 搜索标准条款
   */
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
