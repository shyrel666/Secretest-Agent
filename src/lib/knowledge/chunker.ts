/**
 * 结构感知分块器 — 识别国标文档的 章→节→条款→示例 层级结构
 *
 * 分块策略：
 * 1. 先解析文档结构（识别标题、条款号、示例代码块）
 * 2. 以"条款"为最小语义单元分块
 * 3. 每个 chunk 前缀标注章节路径（如 "5.数据处理 > 5.3.SQL注入"）
 * 4. 代码示例与所属条款绑定
 * 5. 超长条款在内部按句子拆分，但保留条款标题前缀
 */

export interface ChunkOptions {
  /** 每个 chunk 的最大字符数，默认 1200 */
  maxChunkSize?: number;
  /** 相邻 chunk 之间的重叠字符数，默认 80 */
  overlap?: number;
}

export interface StructuredChunk {
  /** chunk 文本内容 */
  content: string;
  /** 章节路径，如 "5.数据处理 > 5.3.SQL注入" */
  sectionPath: string;
  /** 条款编号，如 "5.3.4" */
  clauseNumber: string;
  /** chunk 类型 */
  chunkType: 'clause' | 'example' | 'appendix' | 'definition' | 'general';
}

// ——— 标题/条款识别模式 ———

/** 匹配国标章节标题：数字编号开头，如 "5 数据处理"、"5.1 输入验证" */
const HEADING_PATTERN = /^(\d+(?:\.\d+)*)\s+(.+)$/;

/** 匹配附录标题：如 "A.1 范围"、"附 录 A" */
const APPENDIX_HEADING = /^(?:附\s*录\s*([A-Z])|([A-Z]\.\d+(?:\.\d+)*))\s*(.*)/;

/** 匹配示例标记：如 "示例1:"、"示例:" */
const EXAMPLE_MARKER = /^示例\s*\d*\s*[:：]/;

/** 匹配代码块开始：缩进的代码或典型代码起始模式 */
const CODE_START = /^(public\s|private\s|protected\s|class\s|void\s|int\s|String\s|char\s|float\s|double\s|long\s|boolean\s|byte\s|#include\b|#define\b|#pragma\b|import\s|using\s|namespace\s|if\s*\(|for\s*\(|while\s*\(|try\s*\{|catch\s*\(|return\s|switch\s*\(|case\s|static\s|const\s|var\s|let\s|function\s|def\s|SELECT\s|INSERT\s|UPDATE\s|DELETE\s|CREATE\s|DROP\s|ALTER\s|\/\/\s|\/\*|@[A-Z]\w+|@\w+\()/;

// ——— 文档结构解析 ———

interface Section {
  level: number;
  number: string;
  title: string;
  content: string;
  type: StructuredChunk['chunkType'];
  children: Section[];
}

/**
 * 解析文档文本为结构化节点树。
 */
function parseDocumentStructure(text: string): Section[] {
  const lines = text.split('\n');
  const root: Section[] = [];
  const stack: { section: Section; level: number }[] = [];

  let currentSection: Section | null = null;
  let inExample = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (currentSection) {
        currentSection.content += '\n';
      }
      // 不在空行处重置 inExample — 代码示例中常含空行，仅在 heading 处重置
      continue;
    }

    // 检查是否是附录标题
    const appendixMatch = trimmed.match(APPENDIX_HEADING);
    if (appendixMatch) {
      const num = appendixMatch[2] || `附录${appendixMatch[1] || ''}`;
      const title = appendixMatch[3] || '';
      const newSection: Section = {
        level: num.includes('.') ? num.split('.').length : 1,
        number: num,
        title: title.trim(),
        content: '',
        type: 'appendix',
        children: [],
      };
      finalizeCurrent();
      currentSection = newSection;
      addToTree(root, stack, newSection);
      continue;
    }

    // 检查是否是章节标题
    // 守卫：形如 "1 《测试计划》 ..." 的表格行不是条款标题（标题以书名号开头）
    const headingMatch = trimmed.match(HEADING_PATTERN);
    if (headingMatch && !headingMatch[2].trim().startsWith('《')) {
      const num = headingMatch[1];
      const title = headingMatch[2].trim();
      const level = num.split('.').length;

      // 判断类型
      let type: StructuredChunk['chunkType'] = 'clause';
      if (num === '3' || (level === 1 && /术语|定义/.test(title))) {
        type = 'definition';
      }

      const newSection: Section = {
        level,
        number: num,
        title,
        content: '',
        type,
        children: [],
      };

      finalizeCurrent();
      currentSection = newSection;
      addToTree(root, stack, newSection);
      inExample = false;
      continue;
    }

    // 检查是否是示例标记
    if (EXAMPLE_MARKER.test(trimmed)) {
      inExample = true;
      if (currentSection) {
        currentSection.content += `\n${trimmed}`;
      }
      continue;
    }

    // 检查是否是代码行（在示例中或缩进的代码）
    if (inExample || CODE_START.test(trimmed)) {
      if (currentSection) {
        currentSection.content += `\n${trimmed}`;
      }
      continue;
    }

    // 普通内容行
    if (currentSection) {
      currentSection.content += `\n${trimmed}`;
    } else {
      // 在任何标题之前的内容，创建一个 general 节
      currentSection = {
        level: 0,
        number: '',
        title: '',
        content: trimmed,
        type: 'general',
        children: [],
      };
      root.push(currentSection);
    }
  }

  finalizeCurrent();
  return root;

  function finalizeCurrent() {
    if (currentSection) {
      currentSection.content = currentSection.content.trim();
    }
  }

  function addToTree(roots: Section[], stk: typeof stack, section: Section) {
    // 弹出层级 >= 当前的节点
    while (stk.length > 0 && stk[stk.length - 1].level >= section.level) {
      stk.pop();
    }

    if (stk.length > 0) {
      stk[stk.length - 1].section.children.push(section);
    } else {
      roots.push(section);
    }

    stk.push({ section, level: section.level });
  }
}

/**
 * 构建章节路径字符串。
 */
function buildSectionPath(ancestors: Section[], current: Section): string {
  const parts = [...ancestors, current]
    .filter((s) => s.number && s.title)
    .map((s) => `${s.number} ${s.title}`);

  return parts.join(' > ') || '文档';
}

// ——— 分块逻辑 ———

/**
 * 将已解析的结构树展平为分块列表。
 */
function flattenToChunks(
  sections: Section[],
  maxSize: number,
  overlap: number,
  ancestors: Section[] = [],
): StructuredChunk[] {
  const chunks: StructuredChunk[] = [];

  for (const section of sections) {
    const sectionPath = buildSectionPath(ancestors, section);
    const clauseNumber = section.number;
    const chunkType = section.type;

    // 构建 chunk 内容：标题 + 正文
    let fullContent = '';
    if (section.number && section.title) {
      fullContent = `${section.number} ${section.title}\n${section.content}`;
    } else {
      fullContent = section.content;
    }

    if (fullContent.trim().length === 0 && section.children.length > 0) {
      // 只有标题没内容，直接递归子节点
      const childChunks = flattenToChunks(
        section.children,
        maxSize,
        overlap,
        [...ancestors, section],
      );
      chunks.push(...childChunks);
      continue;
    }

    if (fullContent.length <= maxSize) {
      // 内容不超限，直接作为一个 chunk
      if (fullContent.trim().length > 0) {
        chunks.push({
          content: fullContent.trim(),
          sectionPath,
          clauseNumber,
          chunkType,
        });
      }
    } else {
      // 超长内容：按句子拆分，每个子 chunk 携带章节前缀
      const prefix = section.number && section.title
        ? `[${section.number} ${section.title}]\n`
        : '';
      const subChunks = splitLongContent(
        section.content.trim(),
        maxSize,
        overlap,
        prefix,
      );
      for (const sub of subChunks) {
        chunks.push({
          content: sub,
          sectionPath,
          clauseNumber,
          chunkType,
        });
      }
    }

    // 递归处理子节点
    if (section.children.length > 0) {
      const childChunks = flattenToChunks(
        section.children,
        maxSize,
        overlap,
        [...ancestors, section],
      );
      chunks.push(...childChunks);
    }
  }

  return chunks;
}

/**
 * 将超长文本按句子拆分为多个子 chunk。
 * 每个子 chunk 带有前缀（章节标题），并有重叠。
 */
function splitLongContent(
  text: string,
  maxSize: number,
  overlap: number,
  prefix: string,
): string[] {
  const effectiveMax = maxSize - prefix.length;
  if (effectiveMax <= 100) {
    return hardSplit(text, maxSize, overlap);
  }

  const sentences = splitBySentences(text);
  const result: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > effectiveMax && current.length > 0) {
      result.push(prefix + current.trim());
      if (overlap > 0 && current.length > overlap) {
        current = current.slice(-overlap) + sentence;
      } else {
        current = sentence;
      }
    } else {
      current += sentence;
    }
  }

  if (current.trim().length > 0) {
    if (current.length > effectiveMax) {
      const subs = hardSplit(current, effectiveMax, overlap);
      for (const s of subs) {
        result.push(prefix + s.trim());
      }
    } else {
      result.push(prefix + current.trim());
    }
  }

  return result;
}

/** 按句子边界分割文本 */
function splitBySentences(text: string): string[] {
  const parts: string[] = [];
  const regex = /([。！？.!?；;]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const end = match.index + match[0].length;
    parts.push(text.slice(lastIndex, end));
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/** 硬切（最后手段） */
function hardSplit(text: string, maxSize: number, overlap: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < text.length; ) {
    const end = Math.min(i + maxSize, text.length);
    result.push(text.slice(i, end));
    i = end - overlap;
    if (i >= text.length || end === text.length) break;
  }
  return result;
}

// ——— 公共 API ———

/**
 * 将文本拆分为结构化 chunks。
 *
 * 识别国标文档的章节/条款/示例层级，按条款为最小语义单元分块。
 * 每个 chunk 携带 sectionPath、clauseNumber、chunkType 元信息。
 */
export function chunkText(text: string, opts?: ChunkOptions): StructuredChunk[] {
  const maxSize = opts?.maxChunkSize ?? 1200;
  const overlap = opts?.overlap ?? 80;

  if (!text || text.trim().length === 0) return [];

  const sections = parseDocumentStructure(text);
  const filtered = filterNoiseSections(sections);
  const chunks = flattenToChunks(filtered, maxSize, overlap);

  return chunks.filter((c) => c.content.trim().length > 20);
}

// ——— 噪声章节过滤 ———

/**
 * 匹配前言/目录/参考文献等无需分块的章节。
 * 注意：不要把"概述"列入——它在国标里常是有价值的无编号正文节。
 */
const NOISE_SECTION_TITLES = /^(前\s*言|引\s*言|目\s*次|参考文献|参考书目|索\s*引|致\s*谢|出版说明)$/;

function isNoiseSection(s: Section): boolean {
  // 有编号的条款（如 "5.1 概述"）一律保留，绝不当作噪声
  if (s.number) return false;
  if (NOISE_SECTION_TITLES.test(s.title.trim())) return true;
  // 标题前的前言/目次等会落进无标题的 general 节，噪声标记通常是首个非空行
  const firstLine = s.content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine !== undefined && NOISE_SECTION_TITLES.test(firstLine);
}

function filterNoiseSections(sections: Section[]): Section[] {
  return sections
    .filter((s) => !isNoiseSection(s))
    .map((s) => ({ ...s, children: filterNoiseSections(s.children) }));
}

/**
 * 简单分块（兼容旧接口，返回纯文本数组）。
 */
export function chunkTextSimple(text: string, opts?: ChunkOptions): string[] {
  const chunks = chunkText(text, opts);
  return chunks.map((c) => c.content);
}

