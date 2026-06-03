/**
 * 规整讲解类 Markdown，保证即便在流式输出过程中、或模型输出略有瑕疵时也能整洁渲染。
 *
 * 主要修复两类会导致排版严重错乱的问题：
 * 1. 代码围栏（```）数量为奇数 —— 流式途中尚未闭合、或模型漏写了闭合围栏时，
 *    后续所有正文都会被当成代码块吞掉，看上去就是一大段乱码。这里补一个闭合围栏。
 * 2. 残留的 <think> 思考标签。
 *
 * 处理保持保守：只做安全的归一化，不改写正文语义。
 */
export function normalizeExplanationMarkdown(raw: string): string {
  if (!raw) {
    return raw;
  }

  let text = raw.replace(/\r\n/g, '\n');

  // 去掉模型可能输出的思考标签（含未闭合的情况）
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '');

  // 统计行首代码围栏数量；为奇数说明有一个围栏没有闭合，补齐它。
  const fenceCount = (text.match(/^[ \t]*```/gm) || []).length;
  if (fenceCount % 2 === 1) {
    text = `${text.replace(/[ \t\n]+$/, '')}\n\`\`\``;
  }

  // 折叠 3 行以上的连续空行，避免段落间出现大片空白。
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}
