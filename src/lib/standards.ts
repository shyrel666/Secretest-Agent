export type StandardType = 'java' | 'cpp' | 'csharp';

export type AssessmentLanguage = StandardType | 'mixed';

export const STANDARD_INFO: Record<StandardType, {
  name: string;
  fullName: string;
  languageLabel: string;
  shortLabel: string;
  uploadLabel: string;
  uploadDescription: string;
  vulnerabilities: string;
  accentClassName: string;
  accentTextClassName: string;
}> = {
  java: {
    name: 'GB/T 34944-2017',
    fullName: 'Java语言源代码漏洞测试规范',
    languageLabel: 'Java',
    shortLabel: 'Java标准',
    uploadLabel: '上传PDF文档',
    uploadDescription: '上传GB/T 34944-2017标准的PDF或文本文件，系统将自动解析并导入知识库。',
    vulnerabilities: '漏洞测试条款',
    accentClassName: 'bg-teal-400/10',
    accentTextClassName: 'text-teal-400',
  },
  cpp: {
    name: 'GB/T 34943-2017',
    fullName: 'C/C++语言源代码漏洞测试规范',
    languageLabel: 'C/C++',
    shortLabel: 'C/C++标准',
    uploadLabel: '上传PDF文档',
    uploadDescription: '上传GB/T 34943-2017标准的PDF或文本文件，系统将自动解析并导入知识库。',
    vulnerabilities: '漏洞测试条款',
    accentClassName: 'bg-amber-400/10',
    accentTextClassName: 'text-amber-400',
  },
  csharp: {
    name: 'GB/T 34946-2017',
    fullName: 'C#语言源代码漏洞测试规范',
    languageLabel: 'C#',
    shortLabel: 'C#标准',
    uploadLabel: '上传PDF文档',
    uploadDescription: '上传GB/T 34946-2017标准的PDF或文本文件，系统将自动解析并导入知识库。',
    vulnerabilities: 'C#漏洞测试条款',
    accentClassName: 'bg-sky-400/10',
    accentTextClassName: 'text-sky-400',
  },
};

export function isStandardType(value: string): value is StandardType {
  return value === 'java' || value === 'cpp' || value === 'csharp';
}

export function getStandardLabel(type: StandardType): string {
  return STANDARD_INFO[type].shortLabel;
}

export function getLanguageLabel(language?: string): string {
  const value = (language || '').toLowerCase();

  if (value === 'java') return STANDARD_INFO.java.languageLabel;
  if (value === 'cpp' || value === 'c' || value === 'c++') return STANDARD_INFO.cpp.languageLabel;
  if (value === 'csharp' || value === 'c#' || value === 'csharplanguage') return STANDARD_INFO.csharp.languageLabel;
  if (value === 'mixed') return '混合';

  return language || '未知语言';
}

/**
 * 反向映射：将 LLM 输出的语言显示标签（如 'Java', 'C++', 'C#'）转回 StandardType。
 * 用于将 question_records.language 关联回 documents.type。
 */
export function getStandardTypeFromLanguageLabel(label?: string): StandardType | undefined {
  const value = (label || '').toLowerCase().replace(/\s+/g, '');

  if (value === 'java') return 'java';
  if (value === 'c' || value === 'c++' || value === 'cpp' || value === 'c/c++') return 'cpp';
  if (value === 'c#' || value === 'csharp') return 'csharp';

  return undefined;
}

export function getStandardFullName(type: StandardType): string {
  return `${STANDARD_INFO[type].name} ${STANDARD_INFO[type].fullName}`;
}