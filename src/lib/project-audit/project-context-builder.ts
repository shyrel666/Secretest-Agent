/**
 * 把 finding seed 转成给 LLM 的项目上下文（带行号的源码片段 + 证据流）。
 */

import { getSourceCodeProject } from './project-registry';
import { readProjectSourceSnippet, SourceReadError } from './source-reader';
import type {
  ProjectAuditFindingSeed,
  ProjectAuditTaskType,
  ProjectQuestionContext,
  ProjectSourceRef,
  ProjectSourceSnippet,
} from './types';

const TASK_TYPE_INSTRUCTIONS: Record<ProjectAuditTaskType, string> = {
  identify:
    '请基于提供的真实源码片段，让用户识别出该片段对应的主要安全风险/漏洞类型。',
  trace:
    '请基于提供的真实源码片段，让用户从入口参数出发，逐步追踪到危险操作/缺失控制，建立完整调用链。',
  fix:
    '请基于提供的真实源码片段，让用户在理解漏洞原理后给出可行的修复方案（修复点/白名单/参数化/调用方式改造）。',
  falsePositive:
    '请基于提供的真实源码片段，让用户判断片段中的高风险写法是否真正构成漏洞，识别安全控制（白名单、参数化、签名校验等）并解释为什么。',
  variant:
    '请基于提供的真实源码片段的漏洞模式，构造同构变体题目：保留 source -> processing -> sink 结构和危险 API 调用，但允许改写业务表述、类名、变量名、局部字段和注释风格。',
};

export interface ProjectQuestionContextOptions {
  /** 限制读取的源码片段；默认读取 seed.sourceRefs + evidenceFlow.refs 的并集。 */
  refsOverride?: ProjectSourceRef[];
  /** 当读源码失败时是否降级为不带源码的上下文（不抛错）。 */
  tolerateReadErrors?: boolean;
}

const BRIEF_SOURCE_SNIPPET_LIMIT = 4;
const BRIEF_SOURCE_SNIPPET_CHAR_LIMIT = 900;

export function buildProjectQuestionContext(
  seed: ProjectAuditFindingSeed,
  taskType: ProjectAuditTaskType,
  options: ProjectQuestionContextOptions = {},
): ProjectQuestionContext {
  const project = getSourceCodeProject(seed.projectId);
  if (!project) {
    throw new SourceReadError(
      'PROJECT_NOT_FOUND',
      `无法为 seed ${seed.id} 解析 project profile`,
    );
  }

  const refs = options.refsOverride ?? mergeRefs(seed);
  const sourceSnippets: ProjectSourceSnippet[] = [];
  const tolerate = options.tolerateReadErrors ?? true;
  let failureCount = 0;
  let lastError: Error | null = null;

  for (const ref of refs) {
    try {
      const result = readProjectSourceSnippet(ref);
      sourceSnippets.push({
        ref,
        numberedCode: result.numberedCode,
        code: result.code,
      });
    } catch (error) {
      failureCount += 1;
      lastError = error as Error;
      if (!tolerate) {
        throw error;
      }
      // 容忍模式：单文件读不到就跳过，由生成器继续基于 evidenceFlow 摘要出题
    }
  }

  // 所有 ref 都读不到（极端情况：源码被删除/行号全部漂移）→ 让上游放弃，避免生成无依据题目
  if (refs.length > 0 && failureCount === refs.length && !options.refsOverride) {
    const wrapped = new SourceReadError(
      'READ_ERROR',
      `seed ${seed.id} 的 ${refs.length} 个源码片段全部读取失败：${lastError?.message ?? 'unknown'}`,
    );
    throw wrapped;
  }

  return {
    project,
    seed,
    taskType,
    sourceSnippets,
  };
}

/**
 * 把 seed 的 sourceRefs 和 evidenceFlow 里的 ref 合并去重，供读取源码片段使用。
 *
 * 去重 key 用 path+startLine+endLine（不含 role）。因为 sourceRefs 与 evidenceFlow 经常
 * 在同一行段上标注不同 role（如 controller 与 entry 都指向 180-204），它们指向的是同一段
 * 源码，读取两遍只会得到两份重复代码。因此按行段去重，保留一份片段即可，role 信息在
 * evidenceFlow 步骤摘要中已经体现。
 *
 * evidenceFlow 的 ref 后写入，会覆盖同 path 同行段下 sourceRefs 的记录（覆盖时保留更精细的
 * evidenceFlow role），从而让渲染标题与符号更贴近审计语义。
 */
function mergeRefs(seed: ProjectAuditFindingSeed): ProjectSourceRef[] {
  const map = new Map<string, ProjectSourceRef>();
  for (const ref of seed.sourceRefs) {
    const key = `${ref.path}:${ref.startLine}:${ref.endLine}`;
    if (!map.has(key)) {
      map.set(key, ref);
    }
  }
  for (const step of seed.evidenceFlow) {
    const ref = step.ref;
    const key = `${ref.path}:${ref.startLine}:${ref.endLine}`;
    map.set(key, ref);
  }
  return Array.from(map.values());
}

export function formatProjectContextForPrompt(context: ProjectQuestionContext): string {
  const { project, seed, taskType, sourceSnippets } = context;
  const sections: string[] = [];

  sections.push('## 源码项目背景');
  sections.push(`- 项目: ${project.name} (${project.id})`);
  sections.push(`- 源码根: ${project.root}`);
  sections.push(`- 语言: ${project.language}`);
  sections.push(`- 描述: ${project.description}`);

  sections.push('');
  sections.push('## 漏洞点元数据');
  sections.push(`- Finding ID: ${seed.id}`);
  sections.push(`- 标题: ${seed.title}`);
  sections.push(`- 主漏洞类型: ${seed.vulnerabilityType}`);
  sections.push(`- 标准引用: ${seed.standardReference}`);
  sections.push(`- 任务类型: ${taskType}`);
  sections.push(`- 任务要求: ${TASK_TYPE_INSTRUCTIONS[taskType]}`);

  sections.push('');
  sections.push('## 证据流（入口 → 业务处理 → 危险操作）');
  for (const [index, step] of seed.evidenceFlow.entries()) {
    sections.push(`步骤 ${index + 1} [${step.label}] — ${step.ref.path}:${step.ref.startLine}-${step.ref.endLine}`);
    sections.push(`摘要: ${step.summary}`);
    if (step.ref.symbol) {
      sections.push(`符号: ${step.ref.symbol}`);
    }
  }

  if (sourceSnippets.length > 0) {
    sections.push('');
    sections.push('## 真实源码片段（必须基于以下内容出题）');
    for (const snippet of sourceSnippets) {
      sections.push(`### ${snippet.ref.path}:${snippet.ref.startLine}-${snippet.ref.endLine}`);
      if (snippet.ref.symbol) {
        sections.push(`symbol: ${snippet.ref.symbol}`);
      }
      sections.push('```java');
      sections.push(snippet.numberedCode);
      sections.push('```');
    }
  } else {
    sections.push('');
    sections.push('## 真实源码片段');
    sections.push('（当前环境无法读取源码文件，请仅基于 evidenceFlow 描述出题，并在解析中明确标注本局限）');
  }

  sections.push('');
  sections.push('## 任务约束');
  if (taskType === 'variant') {
    sections.push(`变体指引: ${seed.variantGuidance}`);
  } else {
    sections.push(`变体指引(仅参考): ${seed.variantGuidance}`);
  }
  sections.push(`干扰项参考: ${seed.distractorGuidance.join(' / ')}`);
  sections.push(`修复指引(可选, 用于解释): ${seed.remediationGuidance.join(' / ')}`);

  return sections.join('\n');
}

export function formatProjectContextBriefForPrompt(context: ProjectQuestionContext): string {
  const { project, seed, taskType, sourceSnippets } = context;
  const sections: string[] = [];

  sections.push('PROJECT_AUDIT_BRIEF');
  sections.push(`project=${project.id} (${project.name})`);
  sections.push(`language=${project.language}`);
  sections.push(`findingSeedId=${seed.id}`);
  sections.push(`taskType=${taskType}`);
  sections.push(`difficulty=${seed.difficulty}`);
  sections.push(`vulnerabilityType=${seed.vulnerabilityType}`);
  sections.push(`standardReference=${seed.standardReference}`);
  sections.push(`title=${seed.title}`);
  sections.push(`taskInstruction=${TASK_TYPE_INSTRUCTIONS[taskType]}`);

  sections.push('');
  sections.push('EVIDENCE_MAP');
  for (const [index, step] of seed.evidenceFlow.entries()) {
    const symbol = step.ref.symbol ? ` symbol=${step.ref.symbol}` : '';
    sections.push(`${index + 1}. ${step.label}: ${step.ref.path}:L${step.ref.startLine}-${step.ref.endLine}${symbol}`);
    sections.push(`   ${step.summary}`);
  }

  sections.push('');
  sections.push('SOURCE_REFS');
  for (const ref of seed.sourceRefs) {
    const symbol = ref.symbol ? ` symbol=${ref.symbol}` : '';
    sections.push(`- ${ref.role}: ${ref.path}:L${ref.startLine}-${ref.endLine}${symbol}`);
  }

  if (sourceSnippets.length > 0) {
    sections.push('');
    sections.push('SOURCE_SNIPPETS');
    for (const snippet of sourceSnippets.slice(0, BRIEF_SOURCE_SNIPPET_LIMIT)) {
      const symbol = snippet.ref.symbol ? ` symbol=${snippet.ref.symbol}` : '';
      sections.push(`### ${snippet.ref.role} ${snippet.ref.path}:L${snippet.ref.startLine}-${snippet.ref.endLine}${symbol}`);
      sections.push('```java');
      sections.push(limitPromptText(snippet.numberedCode, BRIEF_SOURCE_SNIPPET_CHAR_LIMIT));
      sections.push('```');
    }
  }

  sections.push('');
  sections.push('QUESTION_DESIGN_CONSTRAINTS');
  sections.push('- 只生成 1 道题，题干/选项/解析由 LLM 动态设计，事实边界必须来自本 brief。');
  sections.push('- source/trace/fix/falsePositive 题使用真实源码事实，不要编造文件、方法、调用链或 sink。');
  sections.push('- question 不要直接泄露 vulnerabilityType、findingSeedId、证据流结论或正确答案。');
  sections.push('- 四个 options 必须使用同一种语法形态和接近长度，不能让正确项因文风、长度或术语密度显得特殊。');
  sections.push(`- JSON 可省略 sourceRefs/evidenceFlow；后端会用 findingSeedId=${seed.id} 绑定可信元数据。`);
  if (taskType === 'variant') {
    sections.push(`- variantGuidance=${seed.variantGuidance}`);
  }
  if (seed.distractorGuidance.length > 0) {
    sections.push(`- distractorIdeas=${seed.distractorGuidance.join(' / ')}`);
  }
  if (seed.remediationGuidance.length > 0) {
    sections.push(`- remediationIdeas=${seed.remediationGuidance.join(' / ')}`);
  }

  return sections.join('\n');
}

export function getTaskTypeInstructions(): Record<ProjectAuditTaskType, string> {
  return TASK_TYPE_INSTRUCTIONS;
}

function limitPromptText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}\n...<snippet truncated for prompt brevity>`;
}
