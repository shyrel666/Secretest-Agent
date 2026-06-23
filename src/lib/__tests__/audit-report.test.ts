import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCitationAppendix,
  EMPTY_AUDIT_RESPONSE_MESSAGE,
  hasVisibleAuditReportContent,
  shouldAppendCitationAppendix,
} from '@/lib/audit/audit-report';

const citations = [
  {
    standardName: 'GB/T 34944-2017',
    clauseNumber: '6.2.3.5',
    sectionPath: '6 源代码漏洞测试内容 > 6.2 源代码漏洞说明',
  },
];

describe('audit report helpers', () => {
  it('does not append citation appendix when the model returned no report body', () => {
    assert.equal(hasVisibleAuditReportContent('  \n'), false);
    assert.equal(shouldAppendCitationAppendix('', citations), false);
  });

  it('appends citation appendix only when non-empty output lacks a standard reference', () => {
    assert.equal(shouldAppendCitationAppendix('发现 SQL 拼接风险。', citations), true);
    assert.equal(
      shouldAppendCitationAppendix('标准引用：GB/T 34944-2017 6.2.3.5', citations),
      false,
    );
  });

  it('formats citation appendix for supplemental evidence', () => {
    assert.match(buildCitationAppendix(citations), /证据引用补充/);
    assert.match(buildCitationAppendix(citations), /GB\/T 34944-2017 6\.2\.3\.5/);
  });

  it('keeps the empty-response message actionable', () => {
    assert.match(EMPTY_AUDIT_RESPONSE_MESSAGE, /模型/);
    assert.match(EMPTY_AUDIT_RESPONSE_MESSAGE, /思考模式/);
  });
});
