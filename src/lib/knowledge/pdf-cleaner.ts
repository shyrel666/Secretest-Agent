/**
 * PDF 后处理清洗管道
 *
 * 处理国标 PDF 解析后的常见问题：
 * 1. CJK 字体映射乱码（犐→I、犌→G 等系统性字符替换）
 * 2. 全角字符归一化
 * 3. 页眉页脚噪声（"中国标准出版社授权..."、"-- X of Y --"）
 * 4. 多余空白符压缩
 * 5. 被分页打断的段落合并
 */

// ——— 1. CJK 字体映射修复 ———

/**
 * 某些国标 PDF（尤其 C/C++、C# 规范）使用非标准字体 CMap，
 * 导致 ASCII 字母被映射到 CJK 统一汉字区的特定字符。
 * 实测映射表（从 GB/T 34943-2017 和 GB/T 34946-2017 PDF 提取）：
 */
const CJK_LATIN_MAP: Record<string, string> = {
  // 大写字母
  '犃': 'A', '犅': 'B', '犆': 'C', '犇': 'D', '犈': 'E', '犉': 'F',
  '犌': 'G', '犎': 'H', '犐': 'I', '犑': 'J', '犓': 'K', '犔': 'L',
  '犕': 'M', '犖': 'N', '犗': 'O', '犘': 'P', '犙': 'Q', '犚': 'R',
  '犛': 'S', '犜': 'T', '犝': 'U', '犞': 'V', '犠': 'W', '犡': 'X',
  '犢': 'Y', '犣': 'Z',
  // 小写字母
  '犪': 'a', '犫': 'b', '犮': 'c', '犱': 'd', '犲': 'e', '犳': 'f',
  '犵': 'g', '犺': 'h', '犻': 'i', '犼': 'j', '犽': 'k', '犾': 'l',
  '犿': 'm', '狀': 'n', '狅': 'o', '狆': 'p', '狇': 'q', '狉': 'r',
  '狊': 's', '狋': 't', '狌': 'u', '狏': 'v', '狑': 'w', '狓': 'x',
  '狔': 'y', '狕': 'z',
};

/** 构建正则：匹配所有已知的 CJK→Latin 映射字符 */
const CJK_LATIN_REGEX = new RegExp(
  `[${Object.keys(CJK_LATIN_MAP).join('')}]`,
  'g',
);

/** 替换 CJK 映射字符为正确的 ASCII 字母 */
function fixCjkLatinMapping(text: string): string {
  return text.replace(CJK_LATIN_REGEX, (ch) => CJK_LATIN_MAP[ch] || ch);
}

// ——— 2. 全角字符归一化 ———

/** 全角 ASCII（U+FF01 ~ U+FF5E）→ 半角（U+0021 ~ U+007E） */
function normalizeFullWidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0),
  );
}

// ——— 3. 页眉页脚噪声去除 ———

const NOISE_PATTERNS: RegExp[] = [
  // "中国标准出版社授权...推广使用"
  /中国标准出版社授权[^\n]*推广使用\s*/g,
  // "-- X of Y --" 页码标记
  /--\s*\d+\s*of\s*\d+\s*--\s*/gi,
  // 页码行：独立行上只有数字（可能前后有空白）
  /^\s*\d{1,3}\s*$/gm,
  // GB/T 标准编号页眉行（独立行只包含标准编号）
  /^\s*GB\/T\s*\d{4,5}[—\-]\d{4}\s*$/gm,
  // 页眉中的 "犌犅／犜" 形式（已经过 CJK 修复后变成半角）
  /^\s*GB\/T\d{4,5}-\d{4}\s*$/gm,
];

function removeNoise(text: string): string {
  let result = text;
  for (const pattern of NOISE_PATTERNS) {
    result = result.replace(pattern, '\n');
  }
  return result;
}

// ——— 4. 空白符清理 ———

function cleanWhitespace(text: string): string {
  return text
    // Tab → 空格
    .replace(/\t+/g, ' ')
    // 连续空格压缩为一个（保留换行）
    .replace(/[^\S\n]+/g, ' ')
    // 三个及以上连续空行 → 两个空行
    .replace(/\n{3,}/g, '\n\n')
    // 行首行尾空白
    .replace(/^ +| +$/gm, '')
    .trim();
}

// ——— 5. 断行修复 ———

/**
 * 合并被分页打断的段落。
 * 判断标准：前一行不以句末标点结尾，且下一行不以标题模式开头。
 */
function mergeBreakingLines(text: string): string {
  const lines = text.split('\n');
  const merged: string[] = [];
  const SENTENCE_END = /[。！？；;!?.：:）)》」』\]]$/;
  const HEADING_START = /^(\d+[\s.]|\[|附\s*录|表\s*[A-Z\d]|#|前\s*言|引\s*言|目\s*次|范\s*围|示例)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      merged.push('');
      continue;
    }
    // 检查是否应该和上一行合并
    if (
      merged.length > 0 &&
      merged[merged.length - 1].length > 0 &&
      !SENTENCE_END.test(merged[merged.length - 1]) &&
      !HEADING_START.test(trimmed)
    ) {
      // 上一行未结束且当前行不是新段落，合并
      merged[merged.length - 1] += trimmed;
    } else {
      merged.push(trimmed);
    }
  }

  return merged.join('\n');
}

// ——— 6. 国标特有格式优化 ———

/**
 * 修复条款编号的格式：
 * "3.  7" → "3.7"、"5.\t1.\t2" → "5.1.2"
 */
function fixClauseNumbers(text: string): string {
  // 修复条款编号中的多余空格/tab
  return text.replace(
    /(\d+)\.\s+(\d+)/g,
    '$1.$2',
  );
}

// ——— 主管道 ———

/**
 * 对 PDF 提取出的原始文本进行清洗。
 * 按顺序执行：CJK映射修复 → 全角归一化 → 条款号修复 → 去噪 → 空白清理 → 断行修复
 */
export function cleanPdfText(rawText: string): string {
  if (!rawText || rawText.trim().length === 0) return '';

  let text = rawText;

  // Step 1: 修复 CJK→Latin 字体映射乱码
  text = fixCjkLatinMapping(text);

  // Step 2: 全角字符归一化
  text = normalizeFullWidth(text);

  // Step 3: 修复条款编号格式
  text = fixClauseNumbers(text);

  // Step 4: 去除页眉页脚噪声
  text = removeNoise(text);

  // Step 5: 清理多余空白
  text = cleanWhitespace(text);

  // Step 6: 合并被打断的段落
  text = mergeBreakingLines(text);

  return text;
}

/**
 * 评估文本的乱码率。
 * 返回 0-1 之间的值，越高表示乱码越严重。
 * 用于在导入后给用户一个质量反馈。
 */
export function estimateGarbleRate(text: string): number {
  if (!text || text.length === 0) return 1;

  const total = text.length;
  let garbled = 0;

  for (let i = 0; i < total; i++) {
    const code = text.charCodeAt(i);
    // 统计不可识别字符（排除常用中文、ASCII、标点、全角）
    if (
      code > 0x7E && // 非 ASCII
      !(code >= 0x4E00 && code <= 0x9FFF) && // 非常用汉字
      !(code >= 0x3000 && code <= 0x303F) && // 非 CJK 标点
      !(code >= 0xFF01 && code <= 0xFF5E) && // 非全角 ASCII
      !(code >= 0x2000 && code <= 0x206F) && // 非通用标点
      !(code >= 0x2010 && code <= 0x2027) && // 非补充标点
      code !== 0x2014 && code !== 0x2018 && code !== 0x2019 && // 特殊标点
      code !== 0x201C && code !== 0x201D && // 中文引号
      code !== 0x3001 && code !== 0x3002 && // 顿号、句号
      code !== 0x00D7 // ×
    ) {
      garbled++;
    }
  }

  return garbled / total;
}
