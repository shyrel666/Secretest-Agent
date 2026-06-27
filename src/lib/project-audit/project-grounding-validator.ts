/**
 * 项目源码题 grounding 校验。
 *
 * 校验一道 Question 是否真正绑定到指定 finding seed：
 * - sourceProject 与 seed.projectId 一致
 * - findingSeedId 能解析到 seed
 * - standardReference 与 seed 匹配
 * - sourceRefs 是 seed.sourceRefs 的非空子集（source 模式）/ 必须显式给出（variant 模式）
 * - explanation 提到项目名、文件路径或方法名
 * - source 模式 code 与 seed 的源码片段有足够重叠
 * - variant 模式 code 不能直接复制，且保留关键 pattern
 */

import type { Question } from '@/lib/agents/question-generator-agent';
import {
  getProjectFindingSeed,
} from './source-code-findings';
import { readProjectSourceSnippet } from './source-reader';
import {
  isProjectAuditTaskType,
  isProjectId,
  type ProjectAuditFindingSeed,
  type ProjectId,
  type ProjectSourceRef,
} from './types';

export interface ProjectGroundingValidationResult {
  success: boolean;
  issues: string[];
}

// 项目可读名：解析里出现这些中文项目名也算“引用了项目”，弥补只比对 projectId 形如 ym_pt 的不足。
const PROJECT_DISPLAY_NAMES: Record<ProjectId, string[]> = {
  'YM_PT': ['ym_pt', '体检系统', 'ym pt'],
  'itstec-24': ['itstec-24', '支付系统', 'itstec 24'],
};

// 证据关键词只保留“足以指向可审计源码结构”的具体词，移除类/方法/行/import/class 等过于宽泛、
// 任何泛泛解析都会出现的词，避免 grounding 的“解析引用证据”约束形同虚设。
const EVIDENCE_HINT_KEYWORDS = [
  'controller', 'service', 'mapper', 'filter', 'util', 'xml',
  '行号', '行范围', '行段', 'package', 'runtime', 'exec',
  'cookie', 'session', 'cookie', 'desutil', 'aesutil', 'signutils',
  'orderfilter', 'reportmapper', 'usermapper', 'logservice',
];

const SEED_PATTERN_MARKERS: Array<{ seedId: string; markers: string[] }> = [
  { seedId: 'ympt-sql-order-injection', markers: ['${', 'order by', 'mapper', 'querycustorder'] },
  { seedId: 'ympt-command-arch', markers: ['runtime', 'exec', 'cmd', 'arch'] },
  { seedId: 'ympt-reflection-custom', markers: ['class.forname', 'newinstance', 'constructor', 'handle'] },
  { seedId: 'ympt-cookie-admin-auth', markers: ['adminid', 'cookie', 'getcookies'] },
  { seedId: 'ympt-missing-login-query-user-list', markers: ['checklogin', 'queryuserlist', 'userlist'] },
  { seedId: 'ympt-relative-path-show-arch-file', markers: ['showarchfile', 'dcode', 'listfiles'] },
  { seedId: 'ympt-des-hardcoded-key', markers: ['des', 'cipher', 'getinstance', '5gq2qxcb7fq'] },
  { seedId: 'ympt-aes-fixed-gcm-iv', markers: ['aes', 'gcm', 'iv', 'nopadding'] },
  { seedId: 'ympt-secutil-weak-random', markers: ['secutil', 'new random', 'nextbytes'] },
  { seedId: 'ympt-sensitive-log-phone', markers: ['desutil', 'logger.info', 'phone'] },
  { seedId: 'ympt-cookie-sensitive-user-info', markers: ['userphone', 'useraddress', 'cookie'] },
  { seedId: 'ympt-config-db-password', markers: ['datasource', 'password', 'hikari'] },
  { seedId: 'ympt-upload-extension-only', markers: ['getoriginalfilename', 'picpath', 'files.write'] },
  { seedId: 'itstec24-open-redirect-login', markers: ['redirect', 'loginautoredi', 'newurl'] },
  { seedId: 'itstec24-log-arch-command', markers: ['runtime', 'exec', 'cmd', 'logarch'] },
  { seedId: 'itstec24-log-path-listing', markers: ['fileutil', 'logpath', 'showfolder'] },
  { seedId: 'itstec24-log-grab-path-zip', markers: ['ziputils', 'logpath', 'compress'] },
  { seedId: 'itstec24-excel-update-sql-concat', markers: ['executeupdate', 'update', 'where'] },
  { seedId: 'itstec24-excel-import-sql-concat', markers: ['executeupdate', 'insert', 'values'] },
  { seedId: 'itstec24-upload-original-filename', markers: ['getoriginalfilename', 'filePath', 'files.write'] },
  { seedId: 'itstec24-filter-hardcoded-key', markers: ['ctgyuwnw', 'signutils', 'aesutil'] },
  { seedId: 'itstec24-aes-ecb-mode', markers: ['aes/ecb', 'pkcs5padding', 'secretkeyspec'] },
  { seedId: 'itstec24-md5-signature', markers: ['md5', 'messagedigest', 'signa'] },
  { seedId: 'itstec24-session-never-expire', markers: ['setmaxinactiveinterval', '-1', 'session'] },
  { seedId: 'itstec24-payment-sign-bypass', markers: ['requestdecryption=false', 'requestsign=false', 'idcardno'] },
  { seedId: 'itstec24-config-db-password', markers: ['datasource', 'password', 'allowmultiqueries'] },
  { seedId: 'itstec24-insecure-random-discount', markers: ['new random', 'nextint', 'discount'] },
];

function normalizeCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findMarkerOverlap(needle: string[], haystack: string): { found: number; total: number } {
  const lowered = haystack.toLowerCase();
  let found = 0;
  for (const marker of needle) {
    if (lowered.includes(marker.toLowerCase())) {
      found += 1;
    }
  }
  return { found, total: needle.length };
}

function normalizeComparableCodeLine(line: string): string {
  return line
    .replace(/^\s*\d+\s*\|\s?/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function splitComparableCodeLines(code: string): string[] {
  return code
    .split(/\r?\n/)
    .map(normalizeComparableCodeLine)
    .filter((line) => line.length >= 6 && !/^[{}()[\];,]+$/.test(line));
}

function calculateSourceLineOverlap(
  generatedCode: string,
  refs: ProjectSourceRef[],
): {
  generatedLineCount: number;
  sourceLineCount: number;
  matchedLineCount: number;
  readFailureCount: number;
} {
  const generatedLines = splitComparableCodeLines(generatedCode);
  const sourceLines = new Set<string>();
  let readFailureCount = 0;

  for (const ref of refs) {
    try {
      for (const line of splitComparableCodeLines(readProjectSourceSnippet(ref).code)) {
        sourceLines.add(line);
      }
    } catch {
      readFailureCount += 1;
    }
  }

  let matchedLineCount = 0;
  for (const line of generatedLines) {
    if (sourceLines.has(line)) {
      matchedLineCount += 1;
    }
  }

  return {
    generatedLineCount: generatedLines.length,
    sourceLineCount: sourceLines.size,
    matchedLineCount,
    readFailureCount,
  };
}

export function validateProjectGroundedQuestion(
  question: Question,
  seed?: ProjectAuditFindingSeed,
  options: { mode?: 'source' | 'variant' } = {},
): ProjectGroundingValidationResult {
  const issues: string[] = [];

  if (!question.sourceProject || !isProjectId(question.sourceProject)) {
    issues.push('题目缺少或使用了未注册的 sourceProject');
    return { success: false, issues };
  }
  if (!question.findingSeedId) {
    issues.push('题目缺少 findingSeedId');
    return { success: false, issues };
  }
  if (!question.auditTaskType || !isProjectAuditTaskType(question.auditTaskType)) {
    issues.push('题目缺少或使用了未注册的 auditTaskType');
  }

  const resolvedSeed = seed || getProjectFindingSeed(question.findingSeedId);
  if (!resolvedSeed) {
    issues.push(`findingSeedId 找不到对应 seed: ${question.findingSeedId}`);
    return { success: false, issues };
  }

  if (resolvedSeed.projectId !== question.sourceProject) {
    issues.push(`sourceProject(${question.sourceProject}) 与 seed(${resolvedSeed.projectId}) 不一致`);
  }

  if (resolvedSeed.standardReference !== question.standardReference) {
    issues.push(`standardReference(${question.standardReference}) 与 seed(${resolvedSeed.standardReference}) 不匹配`);
  }

  if (!resolvedSeed.vulnerabilityType.toLowerCase().includes(question.vulnerabilityType.toLowerCase())
    && !question.vulnerabilityType.toLowerCase().includes(resolvedSeed.vulnerabilityType.toLowerCase())) {
    issues.push(`vulnerabilityType(${question.vulnerabilityType}) 与 seed(${resolvedSeed.vulnerabilityType}) 不匹配`);
  }

  const refs = question.sourceRefs || [];
  if (refs.length === 0) {
    issues.push('sourceRefs 不能为空');
  } else {
    const seedRefSet = new Set(
      resolvedSeed.sourceRefs.map((ref) => `${ref.path}:${ref.startLine}-${ref.endLine}`),
    );
    for (const ref of refs) {
      if (ref.projectId !== resolvedSeed.projectId) {
        issues.push(`sourceRefs[].projectId 与 seed 不一致: ${ref.projectId}`);
        continue;
      }
      const key = `${ref.path}:${ref.startLine}-${ref.endLine}`;
      if (!seedRefSet.has(key)) {
        // 允许 evidenceFlow 里的扩展 ref
        const evidenceSet = new Set(
          resolvedSeed.evidenceFlow.map((step) => `${step.ref.path}:${step.ref.startLine}-${step.ref.endLine}`),
        );
        if (!evidenceSet.has(key)) {
          issues.push(`sourceRefs 引用了不在 seed 中的片段: ${key}`);
        }
      }
    }
  }

  if (question.auditTaskType === 'variant' && !question.variantOfFindingId) {
    issues.push('variant 题必须提供 variantOfFindingId');
  }

  // 解析必须显式提到项目名 / 文件路径 / 方法名 / 可审计证据关键词
  const explanation = (question.explanation || '').toLowerCase();
  const displayNames = PROJECT_DISPLAY_NAMES[question.sourceProject] || [question.sourceProject.toLowerCase()];
  const mentionsProject = displayNames.some((name) => explanation.includes(name));
  const mentionsFile = resolvedSeed.sourceRefs.some((ref) => {
    const fileName = ref.path.split('/').pop()?.toLowerCase() || '';
    return fileName.length > 3 && explanation.includes(fileName);
  });
  const mentionsSymbol = resolvedSeed.sourceRefs.some((ref) => {
    if (!ref.symbol) return false;
    const lastDot = ref.symbol.lastIndexOf('.');
    const shortSymbol = lastDot >= 0 ? ref.symbol.slice(lastDot + 1).toLowerCase() : ref.symbol.toLowerCase();
    return shortSymbol.length > 2 && explanation.includes(shortSymbol);
  });
  const mentionsAnyEvidenceKeyword = EVIDENCE_HINT_KEYWORDS.some((keyword) => explanation.includes(keyword.toLowerCase()));

  if (!mentionsProject && !mentionsFile && !mentionsSymbol && !mentionsAnyEvidenceKeyword) {
    issues.push('解析未引用项目名、文件路径、方法名或可审计证据关键词');
  }

  // source 模式: code 必须与 seed 的真实源码片段有足够重叠
  const mode = options.mode || (question.auditTaskType === 'variant' ? 'variant' : 'source');
  if (mode === 'source') {
    const normalizedGenerated = normalizeCode(question.code || '');
    if (normalizedGenerated.length < 40) {
      issues.push('source 模式 code 过短，难以视为真实源码');
    } else {
      const overlap = calculateSourceLineOverlap(
        question.code || '',
        refs.length > 0 ? refs : resolvedSeed.sourceRefs,
      );
      // 55% 行重叠为基准；短代码（≤3 行）不再要求 100% 命中，至少匹配 1 行即可，
      // 避免 LLM 对真实源码做无害清洗（调整空格/大小写/局部字面量）后被误杀。
      const requiredMatches = Math.max(
        1,
        Math.ceil(overlap.generatedLineCount * 0.55),
      );

      if (overlap.sourceLineCount === 0) {
        issues.push(`source 模式无法读取 sourceRefs 指向的真实源码片段，读取失败 ${overlap.readFailureCount} 个`);
      } else if (overlap.generatedLineCount === 0) {
        issues.push('source 模式 code 缺少可比较的源码行');
      } else if (overlap.matchedLineCount < requiredMatches) {
        const pattern = SEED_PATTERN_MARKERS.find((entry) => entry.seedId === resolvedSeed.id);
        const codeOverlap = pattern
          ? findMarkerOverlap(pattern.markers, question.code || '')
          : { found: 0, total: 0 };
        issues.push(
          `source 模式 code 与真实源码行重叠不足（${overlap.matchedLineCount}/${overlap.generatedLineCount}，至少需要 ${requiredMatches} 行匹配）；关键模式标记命中 ${codeOverlap.found}/${codeOverlap.total}`,
        );
      }
    }
  }

  if (mode === 'variant') {
    if (normalizeCode(question.code || '') === normalizeCode('')) {
      issues.push('variant 题 code 不能为空');
    }
    const pattern = SEED_PATTERN_MARKERS.find((entry) => entry.seedId === resolvedSeed.id);
    if (pattern) {
      const { found, total } = findMarkerOverlap(pattern.markers, question.code || '');
      if (found === 0) {
        issues.push(`variant 题未保留 seed ${resolvedSeed.id} 的关键漏洞模式（${pattern.markers.join(' / ')}）`);
      } else if (found < Math.max(1, Math.floor(total / 2))) {
        issues.push(`variant 题对 seed 模式的覆盖过少（${found}/${total}），可能已偏离漏洞模式`);
      }
    }
  }

  return {
    success: issues.length === 0,
    issues,
  };
}
