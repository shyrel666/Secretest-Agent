import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPdfText } from '../pdf-cleaner';
import { chunkText } from '../chunker';

describe('cleanPdfText / mergeBreakingLines', () => {
  it('merges a paragraph broken across lines', () => {
    const out = cleanPdfText('为了保证系统安全\n应当对所有输入进行校验。');
    assert.ok(
      out.includes('为了保证系统安全应当对所有输入进行校验'),
      `unexpected: ${out}`,
    );
  });

  it('does NOT merge lines ending with an enumeration comma (、)', () => {
    const out = cleanPdfText('用户需要提供姓名、\n用户需要提供身份证号码。');
    assert.ok(out.includes('用户需要提供姓名、'), `unexpected: ${out}`);
    assert.ok(!out.includes('姓名、用户需要'), `should not merge: ${out}`);
  });
});

describe('cleanPdfText / fixClauseNumbers', () => {
  it('collapses a clause number split by 2+ spaces at line start', () => {
    const out = cleanPdfText('5.  3  输入验证应当检查所有外部输入的合法性以防止注入类漏洞。');
    assert.ok(/5\.3/.test(out), `unexpected: ${out}`);
    assert.ok(!/5\.\s{2,}3/.test(out), `should be collapsed: ${out}`);
  });

  it('does NOT collapse a single-space dotted number inside prose', () => {
    const out = cleanPdfText('本文档第 3. 7 部分描述了相关要求并给出了详细的说明文字内容。');
    // 单空格的 "3. 7" 属正文，不应被误合并成 "3.7"
    assert.ok(out.includes('3. 7'), `unexpected: ${out}`);
    assert.ok(!out.includes('3.7'), `should not collapse prose number: ${out}`);
  });
});

describe('cleanPdfText / removeNoise (TOC + colophon)', () => {
  it('drops TOC dotted-leader lines but keeps body text', () => {
    const out = cleanPdfText(
      '漏洞类别与名称................55 参考文献................57\n这是正常的条款正文内容应当被完整保留下来用于检索。',
    );
    assert.ok(!out.includes('漏洞类别与名称'), `TOC line should be removed: ${out}`);
    assert.ok(out.includes('这是正常的条款正文内容'), `body should be kept: ${out}`);
  });

  it('keeps normal Chinese ellipsis (……) in prose', () => {
    const out = cleanPdfText('他停顿了一下……然后继续说明了相关的技术细节内容。');
    assert.ok(out.includes('……'), `ellipsis should be preserved: ${out}`);
  });

  it('drops back-cover copyright/colophon lines', () => {
    const out = cleanPdfText(
      '2017 年11月第一版 版权专有 侵权必究\n这是需要保留的正文内容用于检索测试场景。',
    );
    assert.ok(!out.includes('版权专有'), `colophon should be removed: ${out}`);
    assert.ok(!out.includes('侵权必究'), `colophon should be removed: ${out}`);
    assert.ok(out.includes('这是需要保留的正文内容'), `body should be kept: ${out}`);
  });

  it('drops publisher header even with PDF-split spaces', () => {
    const out = cleanPdfText(
      '中 国 标 准 出 版 社 出 版 发 行 北京市朝阳区三里河\n保留的正文内容用于检索测试场景使用。',
    );
    assert.ok(!out.includes('朝阳区'), `publisher header should be removed: ${out}`);
    assert.ok(out.includes('保留的正文内容'), `body should be kept: ${out}`);
  });
});

describe('chunkText / filterNoiseSections', () => {
  it('drops leading 前言 boilerplate but keeps numbered clauses', () => {
    const text = [
      '前言',
      '本标准由全国信息安全标准化技术委员会归口管理并负责解释相关条款内容。',
      '',
      '5 SQL注入防护',
      '应使用参数化查询或预编译语句防止SQL注入，避免直接拼接用户输入构造SQL语句。',
    ].join('\n');

    const chunks = chunkText(text);
    assert.ok(
      chunks.every((c) => !c.content.includes('全国信息安全标准化')),
      '前言 boilerplate should be filtered out',
    );
    assert.ok(
      chunks.some((c) => c.content.includes('参数化查询')),
      'numbered clause content should be kept',
    );
  });

  it('keeps an unnumbered 概述 section (no longer treated as noise)', () => {
    const text = [
      '概述',
      '本节概述了代码安全审计的总体目标与适用范围，提供足够长度的正文内容用于检索。',
    ].join('\n');

    const chunks = chunkText(text);
    assert.ok(
      chunks.some((c) => c.content.includes('代码安全审计的总体目标')),
      '概述 content should be retained',
    );
  });

  it('keeps a numbered 概述 clause', () => {
    const text = [
      '4 概述',
      '本章给出了代码漏洞审计的基本流程、适用范围以及术语定义等内容，篇幅足够形成分块。',
    ].join('\n');

    const chunks = chunkText(text);
    assert.ok(
      chunks.some((c) => c.content.includes('代码漏洞审计的基本流程')),
      'numbered 概述 clause should be retained',
    );
  });
});

describe('chunkText / 表格行书名号守卫 (Phase 2)', () => {
  it('does NOT treat "数字 《书名》 ..." table rows as clauses', () => {
    const text = [
      'A.4 测试过程',
      '本案例的测试过程包括测试策划、设计、执行和总结四个阶段，下表给出阶段与产出物对应关系。',
      '1 《测试计划》 测试设计员开展测试需求分析确定测试内容方法环境和工具并编写测试用例文档。',
      '3 《测试说明》 测试执行测试员执行测试记录测试过程和结果并形成测试日志文档供后续分析使用。',
    ].join('\n');

    const chunks = chunkText(text);
    // 不应把表格行误判成条款 "1" / "3"
    assert.ok(!chunks.some((c) => c.clauseNumber === '1'), 'should not create clause 1');
    assert.ok(!chunks.some((c) => c.clauseNumber === '3'), 'should not create clause 3');
    // 表格文字应并入 A.4 节
    assert.ok(
      chunks.some((c) => c.clauseNumber === 'A.4' && c.content.includes('测试计划')),
      'table text should be absorbed into A.4',
    );
  });

  it('still parses a real top-level clause "1 范围"', () => {
    const text = [
      '1 范围',
      '本标准规定了源代码漏洞测试的内容、方法和流程，适用于相关源代码安全测试活动的开展。',
    ].join('\n');

    const chunks = chunkText(text);
    assert.ok(
      chunks.some((c) => c.clauseNumber === '1' && c.content.includes('本标准规定')),
      'real clause 1 should still be recognized',
    );
  });

  it('does not affect clauses whose body contains 《》 (not at title start)', () => {
    const text = [
      '5.2.2 测试策划',
      '测试策划应确定测试依据，例如《C/C++语言源代码漏洞测试规范》，并据此制定测试计划与范围。',
    ].join('\n');

    const chunks = chunkText(text);
    assert.ok(
      chunks.some((c) => c.clauseNumber === '5.2.2' && c.content.includes('测试策划')),
      'clause 5.2.2 should be recognized normally',
    );
  });
});
