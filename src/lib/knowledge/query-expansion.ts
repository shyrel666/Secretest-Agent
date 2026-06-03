/**
 * Vulnerability-type query expansion for improved recall.
 */

const VULN_SYNONYMS: Record<string, string[]> = {
  'SQL注入': ['SQL injection', 'sql注入', '数据库注入', '参数化查询', 'PreparedStatement'],
  'XSS': ['跨站脚本', '反射型XSS', '存储型XSS', 'DOM型XSS', 'cross-site scripting', '脚本注入'],
  '命令注入': ['command injection', 'OS命令注入', '系统命令', 'Runtime.exec', 'ProcessBuilder'],
  '路径遍历': ['path traversal', '目录遍历', '../../', '文件包含', '任意文件读取'],
  '缓冲区溢出': ['buffer overflow', '栈溢出', '堆溢出', '数组越界', '内存安全'],
  '整数溢出': ['integer overflow', '整数回绕', '算术溢出', '数值范围'],
  '资源泄露': ['resource leak', '内存泄露', '连接泄露', '文件句柄', '资源释放'],
  '空指针': ['null pointer', 'NullPointerException', '空引用', '解引用'],
  '格式化字符串': ['format string', '格式化漏洞', 'printf', '字符串格式化'],
  '密码安全': ['硬编码密码', '弱密码', '密码明文', '加密', '哈希'],
  '访问控制': ['权限检查', '越权', '认证绕过', '授权', 'access control'],
  '并发安全': ['race condition', '竞态条件', '线程安全', '同步', '死锁', '并发'],
};

/**
 * Append up to 2 synonym terms when the query matches a known vulnerability type.
 */
export function expandQuery(query: string): string {
  const additions: string[] = [];
  const queryLower = query.toLowerCase();

  for (const [key, synonyms] of Object.entries(VULN_SYNONYMS)) {
    if (query.includes(key) || synonyms.some((s) => queryLower.includes(s.toLowerCase()))) {
      const extras = synonyms
        .filter((s) => !queryLower.includes(s.toLowerCase()))
        .slice(0, 2)
        .map((s) => (s.includes(' ') ? `"${s}"` : s));  // 多词加引号保护
      additions.push(...extras);
    }
  }

  if (additions.length === 0) return query;
  return `${query} ${additions.join(' ')}`;
}
