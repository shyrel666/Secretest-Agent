import assert from 'node:assert/strict';
import { getDocumentSections, isReadableKnowledgeTitle } from '../src/lib/knowledge';
import { extractClauseTitleCandidate } from '../src/lib/knowledge/sqlite-store';

const pureCases = [
  {
    clauseNumber: '6.2.3.7',
    source: '6.2.3.7 使用外部控制的格式化字符串漏 洞 描 述 : printf 函 数 中 的 格 式 化 字 符 串 受 外 部 输 入 数 据 影 响',
    expected: '使用外部控制的格式化字符串',
  },
  {
    clauseNumber: '6.2.3.9',
    source: '6.2.3.9 信息通过错误消息泄露漏洞描述:软件呈现给用户的错误消息中包括与环境、用户或相关数据有关的敏感信息。',
    expected: '信息通过错误消息泄露',
  },
  {
    clauseNumber: 'A.4.1',
    source: 'A.4.1 测试策划A.4.1.1 确定测试工具本项目将采用 CheckmarxCxEnterprise工具进行测试。',
    expected: '测试策划',
  },
  {
    clauseNumber: 'A.4.2',
    source: 'A.4.2 测试设计A.4.2.1 分析测试需求LibrePlan是Java语言开发的 B/S架构网站',
    expected: '测试设计',
  },
];

for (const testCase of pureCases) {
  const actual = extractClauseTitleCandidate(testCase.source, testCase.clauseNumber);
  assert.equal(actual, testCase.expected, `标题提取失败: ${testCase.clauseNumber}`);
}

const javaSections = getDocumentSections('java');
const cppSections = getDocumentSections('cpp');

function requireSectionTitle(
  sections: ReturnType<typeof getDocumentSections>,
  clauseNumber: string,
  expectedTitle: string,
) {
  const section = sections.find((item) => item.clauseNumber === clauseNumber);
  assert.ok(section, `未找到章节 ${clauseNumber}`);
  assert.equal(section.title, expectedTitle, `章节 ${clauseNumber} 标题不符合预期`);
  return section;
}

const javaAppendix = requireSectionTitle(javaSections, 'A.4.1', '测试策划');
const javaAppendixDesign = requireSectionTitle(javaSections, 'A.4.2', '测试设计');
const cppDataProcessing = requireSectionTitle(cppSections, '6.2.3', '数据处理');

for (const section of [javaAppendix, javaAppendixDesign, cppDataProcessing]) {
  assert.ok(!section.title.includes('A.4.1.1'), `${section.clauseNumber} 主标题仍包含下一子条款号`);
  assert.ok(!section.title.includes('A.4.2.1'), `${section.clauseNumber} 主标题仍包含下一子条款号`);
  assert.ok(!section.title.includes('漏洞描述'), `${section.clauseNumber} 主标题仍包含漏洞描述`);
  assert.ok(!section.title.includes('本项目'), `${section.clauseNumber} 主标题仍包含案例正文`);
  assert.ok(!section.title.includes('本案例'), `${section.clauseNumber} 主标题仍包含案例正文`);
}

for (const section of [...javaSections, ...cppSections]) {
  for (const childTitle of section.childTitles) {
    if (!childTitle) continue;
    assert.ok(isReadableKnowledgeTitle(childTitle), `${section.clauseNumber} 存在不可读子条款标题: ${childTitle}`);
    assert.ok(!/^(?:[A-Z]?\.\d+(?:\.\d+)*)$/i.test(childTitle), `${section.clauseNumber} 存在裸编号子条款标题: ${childTitle}`);
    assert.ok(!childTitle.includes('漏洞描述'), `${section.clauseNumber} 子条款标题仍包含漏洞描述: ${childTitle}`);
  }
}

console.log('section title regression check passed');
