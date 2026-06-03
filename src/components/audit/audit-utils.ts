export const severityConfig = {
  critical: { color: 'text-rose-500', bgColor: 'bg-rose-500/10', dot: 'bg-rose-500', label: '严重' },
  high: { color: 'text-orange-500', bgColor: 'bg-orange-500/10', dot: 'bg-orange-500', label: '高危' },
  medium: { color: 'text-amber-500', bgColor: 'bg-amber-500/10', dot: 'bg-amber-500', label: '中危' },
  low: { color: 'text-blue-500', bgColor: 'bg-blue-500/10', dot: 'bg-blue-500', label: '低危' },
} as const;

export type SeverityKey = keyof typeof severityConfig;

export function mapSeverityLabelToKey(label: string): SeverityKey | null {
  const normalized = label.replace(/[\s*：:]/g, '').trim();
  if (normalized.includes('严重')) return 'critical';
  if (normalized.includes('高危') || normalized === '高') return 'high';
  if (normalized.includes('中危') || normalized === '中') return 'medium';
  if (normalized.includes('低危') || normalized === '低') return 'low';
  return null;
}

export function extractSeveritySummary(content: string): {
  overall: SeverityKey | null;
  detected: Set<SeverityKey>;
} {
  const detected = new Set<SeverityKey>();
  const detailMatches = content.matchAll(/风险等级[^\n]*?[：:]\s*([^\n]+)/g);
  for (const match of detailMatches) {
    const severity = mapSeverityLabelToKey(match[1] || '');
    if (severity) detected.add(severity);
  }
  const overallMatch = content.match(/总体风险评级[^\n]*?[：:]\s*([^\n]+)/);
  const overall = overallMatch ? mapSeverityLabelToKey(overallMatch[1] || '') : null;
  if (overall) detected.add(overall);
  return { overall, detected };
}

export const AUDIT_CODE_EXAMPLES = [
  {
    name: 'SQL注入 (Java)',
    lang: 'java',
    code: `public User getUser(String username) {
    String sql = "SELECT * FROM users WHERE username = '" + username + "'";
    return jdbcTemplate.queryForObject(sql, new UserRowMapper());
}`,
  },
  {
    name: '缓冲区溢出 (C)',
    lang: 'c',
    code: `void copy_data(char *input) {
    char buffer[64];
    strcpy(buffer, input);  // 危险：无长度检查
    printf("Data: %s\\n", buffer);
}`,
  },
  {
    name: 'XSS漏洞 (Java)',
    lang: 'java',
    code: `@GetMapping("/search")
public String search(@RequestParam String q, Model model) {
    model.addAttribute("result", "搜索结果: " + q);
    return "search";  // 直接输出用户输入，存在XSS风险
}`,
  },
  {
    name: '内存泄漏 (C++)',
    lang: 'cpp',
    code: `void processData() {
    int* data = new int[1000];
    // 使用 data...
    return;  // 忘记释放内存，导致内存泄漏
}`,
  },
  {
    name: '路径遍历 (C#)',
    lang: 'csharp',
    code: `public string ReadReport(string fileName) {
    var fullPath = Path.Combine("C:/reports", fileName);
    return File.ReadAllText(fullPath); // 未校验文件名，可能被构造为 ../ 绕过目录限制
}`,
  },
] as const;

export const AUDIT_EXAMPLE_NAMES = new Set<string>(
  AUDIT_CODE_EXAMPLES.map((e) => e.name),
);

export const AUDIT_PIPELINE = [
  { key: 'detect', title: '分析语言', description: '识别代码语言与审计范围' },
  { key: 'search', title: '检索国标', description: '从知识库匹配相关条款' },
  { key: 'analyze', title: '漏洞分析', description: '基于标准进行安全审计' },
  { key: 'validate', title: '验证依据', description: '核对结论与标准引用' },
  { key: 'done', title: '输出报告', description: '生成结构化审计报告' },
] as const;

export interface AuditStage {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

export function resolvePipelineIndex(stages: AuditStage[]): number {
  if (stages.length === 0) return -1;
  const order = ['detect', 'search', 'analyze', 'validate', 'done'] as const;
  let maxIdx = -1;
  for (const stage of stages) {
    const base = stage.id.replace(/_done$/, '');
    const idx = order.indexOf(base as (typeof order)[number]);
    if (idx >= 0) {
      maxIdx = Math.max(maxIdx, stage.status === 'done' ? idx + 1 : idx);
    }
    if (stage.id === 'done' && stage.status === 'done') return order.length;
  }
  return maxIdx;
}

export function resolveActiveAgent(stageId: string): 'audit' | 'knowledge' | 'validator' {
  if (stageId.startsWith('search')) return 'knowledge';
  if (stageId === 'validate' || stageId === 'done') return 'validator';
  return 'audit';
}
