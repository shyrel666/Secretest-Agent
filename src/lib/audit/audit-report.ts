export interface AuditCitation {
  standardName?: string;
  clauseNumber?: string;
  sectionPath?: string;
}

export const EMPTY_AUDIT_RESPONSE_MESSAGE =
  '模型未返回审计正文。通常是当前模型、接口地址或思考模式与流式输出不兼容，请在设置中切换模型或关闭思考模式后重试。';

const STANDARD_REFERENCE_PATTERN = /GB\/T\s*\d{4,5}-\d{4}\s+[\d.]+/i;

export function hasVisibleAuditReportContent(content: string): boolean {
  return content.trim().length > 0;
}

export function hasStandardReference(content: string): boolean {
  return STANDARD_REFERENCE_PATTERN.test(content);
}

export function shouldAppendCitationAppendix(
  content: string,
  citations: AuditCitation[],
): boolean {
  return hasVisibleAuditReportContent(content)
    && citations.length > 0
    && !hasStandardReference(content);
}

export function buildCitationAppendix(citations: AuditCitation[]): string {
  if (citations.length === 0) {
    return '';
  }

  const lines = citations
    .slice(0, 8)
    .map((citation) => `- ${citation.standardName || '国标条款'} ${citation.clauseNumber || ''}${citation.sectionPath ? ` (${citation.sectionPath})` : ''}`.trim());

  return `\n\n### 📎 证据引用补充\n${lines.join('\n')}`;
}
