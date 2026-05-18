import type { Question } from './question-generator-agent';
import { sanitizeQuestionCode } from './code-sanitizer';

export interface StandardAlignmentValidationResult {
  success: boolean;
  issues: string[];
}

const STANDARD_REFERENCE_RE = /^GB\/T\s*\d{4,5}-\d{4}\s+\d+(?:\.\d+)+$/;

const ANSWER_LEAK_PATTERNS: RegExp[] = [
  /\b(?:vuln|vulnerability|unsafe|dangerous|exploit|malicious|tainted|untrusted)\b/i,
  /\b(?:injection|traversal|overflow|deserialize|deserialization)\b/i,
  /漏洞|注入|越界|溢出|遍历|反序列化|不安全|危险/,
];

const EVIDENCE_TERMS = [
  '代码',
  '证据',
  '输入',
  '参数',
  '未经',
  '未',
  '直接',
  '调用',
  '拼接',
  '校验',
  '标准',
  '条款',
  '审核',
];

const VULNERABILITY_DETECTORS: Array<{
  type: string;
  pattern: RegExp;
}> = [
  {
    type: 'sql-injection',
    pattern: /\b(?:select|insert|update|delete)\b[\s\S]{0,160}(?:\+|\${|string\.format|format\s*\()/i,
  },
  {
    type: 'path-traversal',
    pattern: /\b(?:Paths?\.get|new\s+File|FileInputStream|readString|readAllBytes)\b[\s\S]{0,160}\b(?:fileName|path|name|request|getParameter|args)\b/i,
  },
  {
    type: 'command-injection',
    pattern: /\b(?:Runtime\.getRuntime\(\)\.exec|ProcessBuilder|system\s*\(|popen\s*\()\b[\s\S]{0,160}(?:\+|\bargs\b|\binput\b|\bcommand\b)/i,
  },
  {
    type: 'deserialization',
    pattern: /\b(?:ObjectInputStream|BinaryFormatter|JsonSerializer|readObject|Deserialize)\b/i,
  },
  {
    type: 'buffer-overflow',
    pattern: /\b(?:gets|strcpy|strcat|sprintf|memcpy)\s*\(/i,
  },
  {
    type: 'integer-overflow',
    pattern: /\b(?:int|long|size_t)\s+\w+\s*=\s*[\w.]+\s*[*+]\s*[\w.]+[\s\S]{0,160}\b(?:malloc|new\s+char|new\s+byte|Array\.CreateInstance)\b/i,
  },
];

export function validateStandardAlignedQuestion(question: Question): StandardAlignmentValidationResult {
  const issues: string[] = [];
  const code = question.code || '';
  const sanitizedCode = sanitizeQuestionCode(code);
  const normalizedCode = code.trim();
  const standardReference = question.standardReference.trim();
  const clauseNumber = standardReference.match(/(\d+(?:\.\d+)+)$/)?.[1] || '';

  if (!STANDARD_REFERENCE_RE.test(standardReference)) {
    issues.push('标准引用格式不正确，无法绑定到具体 GB/T 条款');
  }

  if (sanitizedCode !== normalizedCode) {
    issues.push('代码包含注释或需要清洗的提示性内容');
  }

  if (isCodeTooSmallForAuditScenario(sanitizedCode)) {
    issues.push('代码片段过短，缺少可测量的审计场景');
  }

  const leak = findAnswerLeak(sanitizedCode, question.vulnerabilityType);
  if (leak) {
    issues.push(`代码存在提示性命名或文本，可能泄露答案: ${leak}`);
  }

  const ambiguity = detectAmbiguousVulnerabilitySignals(sanitizedCode, question.vulnerabilityType);
  if (ambiguity.length > 1) {
    issues.push(`代码同时包含多个漏洞信号，可能导致答案不唯一: ${ambiguity.join('、')}`);
  }

  if (!explanationLinksClauseAndEvidence(question.explanation, standardReference, clauseNumber)) {
    issues.push('解析未同时说明标准条款和代码证据');
  }

  return {
    success: issues.length === 0,
    issues,
  };
}

function isCodeTooSmallForAuditScenario(code: string): boolean {
  const meaningfulLines = code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return code.length < 80 || meaningfulLines.length < 3;
}

function findAnswerLeak(code: string, vulnerabilityType: string): string | null {
  const searchableCode = removeStringLiteralValues(code);
  const normalizedCode = normalizeForLeakSearch(searchableCode);
  const normalizedType = normalizeForLeakSearch(vulnerabilityType);

  for (const pattern of ANSWER_LEAK_PATTERNS) {
    const match = searchableCode.match(pattern);
    if (match?.[0]) {
      return match[0];
    }
  }

  const normalizedLeakMatch = normalizedCode.match(/\b(?:vuln|vulnerability|unsafe|dangerous|exploit|malicious|tainted|untrusted|injection|traversal|overflow|deserialize|deserialization)\b/i);
  if (normalizedLeakMatch?.[0]) {
    return normalizedLeakMatch[0];
  }

  const typeTokens = normalizedType
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((token) => token.length >= 3 && token !== 'sql');

  for (const token of typeTokens) {
    if (normalizedCode.includes(token)) {
      return token;
    }
  }

  return null;
}

function removeStringLiteralValues(code: string): string {
  return code
    .replace(/@"(?:""|[^"])*"/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function normalizeForLeakSearch(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-./()（）,，:：]/g, ' ')
    .trim();
}

function detectAmbiguousVulnerabilitySignals(code: string, vulnerabilityType: string): string[] {
  const normalizedType = normalizeForLeakSearch(vulnerabilityType);
  const detected = VULNERABILITY_DETECTORS
    .filter((detector) => detector.pattern.test(code))
    .map((detector) => detector.type);

  if (detected.length <= 1) {
    return detected;
  }

  const targetDetector = detected.find((type) => normalizedType.includes(type.replace('-', ' ')));
  if (!targetDetector) {
    return detected;
  }

  const nonTargetSignals = detected.filter((type) => type !== targetDetector);
  return nonTargetSignals.length === 0 ? [targetDetector] : detected;
}

function explanationLinksClauseAndEvidence(
  explanation: string,
  standardReference: string,
  clauseNumber: string,
): boolean {
  const normalizedExplanation = explanation.toLowerCase();
  const mentionsClause = normalizedExplanation.includes(standardReference.toLowerCase())
    || Boolean(clauseNumber && normalizedExplanation.includes(clauseNumber));
  const evidenceTermCount = EVIDENCE_TERMS.filter((term) => explanation.includes(term)).length;

  return mentionsClause && evidenceTermCount >= 2;
}
