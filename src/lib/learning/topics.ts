import { type StandardType } from '@/lib/standards';

export type LearningTopicLanguage = StandardType;
export type LearningContentSource = 'document' | 'fallback';

export interface LearningTopic {
  id: string;
  language: LearningTopicLanguage;
  title: string;
  summary: string;
  difficulty: 'beginner' | 'intermediate';
  estimatedMinutes: number;
  vulnerabilityFocus: string;
  searchQueries: string[];
  goals: string[];
  standard: string;
}

export const LEARNING_TOPICS: LearningTopic[] = [
  {
    id: 'java-input-validation',
    language: 'java',
    title: '输入校验与边界意识',
    summary: '理解外部输入为什么危险，掌握长度、范围、格式校验的基本思路。',
    difficulty: 'beginner',
    estimatedMinutes: 18,
    vulnerabilityFocus: '输入校验',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java 输入校验 漏洞 条款',
      'Java 外部输入 安全检查',
      'GB/T 34944 输入合法性 示例',
    ],
    goals: [
      '知道什么是外部输入以及为什么必须校验',
      '能识别缺少边界检查的常见代码模式',
      '能说出最基本的输入校验清单',
    ],
  },
  {
    id: 'java-resource-management',
    language: 'java',
    title: '资源管理与异常收口',
    summary: '面向新手理解连接、流、文件句柄为何会成为漏洞入口。',
    difficulty: 'beginner',
    estimatedMinutes: 16,
    vulnerabilityFocus: '资源管理',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java 资源管理 漏洞 条款',
      'Java 异常处理 资源释放',
      'GB/T 34944 未释放资源 示例',
    ],
    goals: [
      '理解资源泄漏与拒绝服务的关系',
      '能识别异常路径中遗漏释放的代码',
      '知道 try-finally 与 try-with-resources 的使用场景',
    ],
  },
  {
    id: 'java-access-control',
    language: 'java',
    title: '权限校验与业务边界',
    summary: '从业务接口角度理解为什么“功能能用”不等于“权限正确”。',
    difficulty: 'beginner',
    estimatedMinutes: 20,
    vulnerabilityFocus: '权限校验',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java 权限校验 漏洞 条款',
      'Java 访问控制 缺失 示例',
      'GB/T 34944 权限控制 安全编码',
    ],
    goals: [
      '理解认证和授权的差异',
      '能识别缺少角色或资源校验的接口代码',
      '能总结权限控制的最小检查路径',
    ],
  },
  {
    id: 'java-sql-injection',
    language: 'java',
    title: 'SQL注入与数据库安全',
    summary: '理解SQL注入的原理、危害和防范方法，掌握参数化查询的正确使用。',
    difficulty: 'beginner',
    estimatedMinutes: 20,
    vulnerabilityFocus: 'SQL注入',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java SQL注入 漏洞 条款',
      'Java 参数化查询 PreparedStatement',
      'GB/T 34944 SQL注入 示例',
    ],
    goals: [
      '理解SQL注入的攻击原理和危害',
      '能识别字符串拼接SQL的危险代码',
      '掌握PreparedStatement参数化查询的正确写法',
    ],
  },
  {
    id: 'java-path-traversal',
    language: 'java',
    title: '路径遍历与文件操作安全',
    summary: '理解文件路径操控如何导致任意文件读取或写入，掌握安全的文件操作方式。',
    difficulty: 'beginner',
    estimatedMinutes: 16,
    vulnerabilityFocus: '路径遍历',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java 路径遍历 漏洞 条款',
      'Java 文件操作 安全编码',
      'GB/T 34944 路径遍历 目录遍历 示例',
    ],
    goals: [
      '理解路径遍历攻击（../../）的原理',
      '能识别用户输入直接拼接文件路径的危险代码',
      '掌握文件路径规范化和白名单校验方法',
    ],
  },
  {
    id: 'java-xss',
    language: 'java',
    title: 'XSS跨站脚本防护',
    summary: '理解反射型、存储型XSS的攻击路径，掌握输出编码和内容过滤的基本策略。',
    difficulty: 'beginner',
    estimatedMinutes: 18,
    vulnerabilityFocus: 'XSS',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java XSS 跨站脚本 漏洞 条款',
      'Java 输出编码 HTML转义',
      'GB/T 34944 跨站脚本 示例',
    ],
    goals: [
      '区分反射型XSS和存储型XSS的攻击场景',
      '能识别未转义直接输出用户数据的代码',
      '掌握输出编码的基本原则',
    ],
  },
  {
    id: 'java-serialization',
    language: 'java',
    title: '序列化与反序列化安全',
    summary: '理解Java反序列化漏洞的原理，为什么不可信数据的反序列化是高危操作。',
    difficulty: 'intermediate',
    estimatedMinutes: 20,
    vulnerabilityFocus: '反序列化',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java 反序列化 漏洞 条款',
      'Java 序列化 安全 ObjectInputStream',
      'GB/T 34944 反序列化 示例',
    ],
    goals: [
      '理解反序列化攻击链的基本原理',
      '能识别直接反序列化不可信数据的危险代码',
      '了解反序列化防护的白名单过滤机制',
    ],
  },
  {
    id: 'java-concurrency',
    language: 'java',
    title: '并发安全与竞态条件',
    summary: '理解多线程环境下的竞态条件、TOCTOU问题，以及同步机制的正确使用。',
    difficulty: 'intermediate',
    estimatedMinutes: 22,
    vulnerabilityFocus: '并发安全',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java 并发安全 竞态条件 条款',
      'Java 线程安全 同步 漏洞',
      'GB/T 34944 竞态条件 TOCTOU 示例',
    ],
    goals: [
      '理解竞态条件和TOCTOU攻击的原理',
      '能识别共享资源缺少同步保护的代码',
      '了解synchronized、Lock等同步机制的适用场景',
    ],
  },
  {
    id: 'java-crypto',
    language: 'java',
    title: '加密与敏感数据保护',
    summary: '理解硬编码密码、弱加密算法、明文传输等常见密码学误用。',
    difficulty: 'intermediate',
    estimatedMinutes: 18,
    vulnerabilityFocus: '密码安全',
    standard: 'GB/T 34944-2017',
    searchQueries: [
      'Java 加密 密码 安全 条款',
      'Java 硬编码密码 弱加密 漏洞',
      'GB/T 34944 敏感数据 加密 示例',
    ],
    goals: [
      '能识别硬编码密码和密钥的代码',
      '了解常见的弱加密算法和不安全哈希',
      '掌握敏感数据存储和传输的基本安全要求',
    ],
  },
  {
    id: 'cpp-behavioral',
    language: 'cpp',
    title: '6.2.1 行为问题',
    summary: '涵盖不可控的内存分配等1个检查点。',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    vulnerabilityFocus: '行为问题',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ 行为问题 漏洞 条款',
      'C C++ 不可控的内存分配',
      'GB/T 34943 6.2.1 行为问题 示例',
    ],
    goals: [
      '理解不可控内存分配的成因与危害',
      '能识别内存分配大小受外部输入控制的代码',
      '掌握内存分配上限检查的基本方法',
    ],
  },
  {
    id: 'cpp-path-errors',
    language: 'cpp',
    title: '6.2.2 路径错误',
    summary: '涵盖不可信的搜索路径等1个检查点。',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    vulnerabilityFocus: '路径错误',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ 路径错误 漏洞 条款',
      'C C++ 路径遍历 目录遍历',
      'GB/T 34943 6.2.2 路径错误 示例',
    ],
    goals: [
      '理解路径遍历攻击的原理与危害',
      '能识别用户输入直接拼接文件路径的危险代码',
      '掌握路径规范化和访问控制的基本方法',
    ],
  },
  {
    id: 'cpp-data-processing',
    language: 'cpp',
    title: '6.2.3 数据处理',
    summary: '涵盖相对路径遍历、绝对路径遍历、命令注入、SQL注入、代码注入、进程控制等12个检查点。',
    difficulty: 'beginner',
    estimatedMinutes: 30,
    vulnerabilityFocus: '数据处理',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ 数据处理 漏洞 条款',
      'C C++ 命令注入 SQL注入 缓冲区溢出',
      'GB/T 34943 6.2.3 数据处理 示例',
    ],
    goals: [
      '理解命令注入、SQL注入等数据处理类漏洞的共性',
      '能识别缓冲区溢出、格式化字符串、整数溢出等典型漏洞代码',
      '掌握输入验证和安全数据处理的基本原则',
    ],
  },
  {
    id: 'cpp-api-misuse',
    language: 'cpp',
    title: '6.2.4 错误的API协议实现',
    summary: '涵盖未检查堆API返回值等1个检查点。',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    vulnerabilityFocus: 'API协议实现',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ API协议 漏洞 条款',
      'C C++ API误用 堆检查',
      'GB/T 34943 6.2.4 API协议 示例',
    ],
    goals: [
      '理解API误用导致安全漏洞的典型场景',
      '能识别未按照API规范调用的代码',
      '掌握正确使用内存管理API的基本方法',
    ],
  },
  {
    id: 'cpp-poor-code',
    language: 'cpp',
    title: '6.2.5 劣质代码',
    summary: '涵盖未使用的变量等1个检查点。',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    vulnerabilityFocus: '劣质代码',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ 劣质代码 漏洞 条款',
      'C C++ 代码规范 编码质量',
      'GB/T 34943 6.2.5 劣质代码 示例',
    ],
    goals: [
      '理解代码质量问题如何演变为安全漏洞',
      '能识别冗余代码、未初始化变量等常见质量缺陷',
      '掌握安全编码规范的基本要求',
    ],
  },
  {
    id: 'cpp-encapsulation',
    language: 'cpp',
    title: '6.2.6 不充分的封装',
    summary: '涵盖可序列化的类包含敏感数据、违反信任边界等2个检查点。',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    vulnerabilityFocus: '封装',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ 封装 漏洞 条款',
      'C C++ 数据封装 访问控制',
      'GB/T 34943 6.2.6 封装 示例',
    ],
    goals: [
      '理解数据封装不足导致的安全风险',
      '能识别内部数据直接暴露给外部的不安全代码',
      '掌握数据封装与访问边界控制的方法',
    ],
  },
  {
    id: 'cpp-security-features',
    language: 'cpp',
    title: '6.2.7 安全功能',
    summary: '涵盖明文存储口令、存储可恢复的口令、口令硬编码、依赖referer字段进行身份鉴别、Cookie中的敏感信息明文存储、敏感信息明文传输等14个检查点。',
    difficulty: 'intermediate',
    estimatedMinutes: 30,
    vulnerabilityFocus: '安全功能',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ 安全功能 密码 加密 条款',
      'C C++ 身份验证 访问控制 密码学',
      'GB/T 34943 6.2.7 安全功能 示例',
    ],
    goals: [
      '理解密码明文存储、硬编码密钥等常见安全功能缺陷',
      '能识别弱加密算法、不安全随机数等典型漏洞代码',
      '掌握密码安全存储、密钥管理和加密算法选择的基本原则',
    ],
  },
  {
    id: 'cpp-web-issues',
    language: 'cpp',
    title: '6.2.8 Web问题',
    summary: '涵盖跨站脚本等1个检查点。',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    vulnerabilityFocus: 'Web问题',
    standard: 'GB/T 34943-2017',
    searchQueries: [
      'C C++ Web问题 漏洞 条款',
      'C C++ 跨站脚本 XSS Web安全',
      'GB/T 34943 6.2.8 Web问题 示例',
    ],
    goals: [
      '理解 C/C++ Web 场景下跨站脚本的攻击路径',
      '能识别用户输入未过滤直接嵌入 Web 页面的代码',
      '掌握输出编码和输入过滤的基本防护策略',
    ],
  },
  {
    id: 'csharp-input-validation',
    language: 'csharp',
    title: '输入校验与危险入口识别',
    summary: '理解 Web 参数、配置输入、文件名等外部数据为什么会在 C# 项目里变成漏洞入口。',
    difficulty: 'beginner',
    estimatedMinutes: 18,
    vulnerabilityFocus: '输入校验',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# 输入校验 漏洞 条款',
      'C# 外部输入 安全检查',
      'GB/T 34946 输入合法性 示例',
    ],
    goals: [
      '知道哪些输入属于不可信数据',
      '能识别缺少长度、格式、范围校验的代码',
      '能总结最基础的输入检查清单',
    ],
  },
  {
    id: 'csharp-access-control',
    language: 'csharp',
    title: '权限控制与业务接口保护',
    summary: '从接口、服务层和资源访问三个角度，理解 C# 业务代码里常见的越权风险。',
    difficulty: 'beginner',
    estimatedMinutes: 20,
    vulnerabilityFocus: '权限控制',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# 权限控制 漏洞 条款',
      'C# 越权访问 安全编码',
      'GB/T 34946 访问控制 示例',
    ],
    goals: [
      '理解认证通过不代表授权正确',
      '能识别缺少资源级校验的接口代码',
      '知道权限检查应该落在什么位置',
    ],
  },
  {
    id: 'csharp-resource-handling',
    language: 'csharp',
    title: '资源释放与异常处理',
    summary: '建立对文件流、数据库连接、对象释放时机的安全直觉，避免把稳定性问题放大成安全问题。',
    difficulty: 'beginner',
    estimatedMinutes: 16,
    vulnerabilityFocus: '资源管理',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# 资源释放 漏洞 条款',
      'C# 异常处理 资源管理',
      'GB/T 34946 资源管理 示例',
    ],
    goals: [
      '理解异常路径为什么容易遗漏释放',
      '能识别 using、finally 缺失导致的风险点',
      '知道如何整理资源处理顺序',
    ],
  },
  {
    id: 'csharp-sql-injection',
    language: 'csharp',
    title: 'SQL注入与数据访问安全',
    summary: '理解 C# 中 SQL 注入的原理，掌握参数化查询和 ORM 的安全用法。',
    difficulty: 'beginner',
    estimatedMinutes: 18,
    vulnerabilityFocus: 'SQL注入',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# SQL注入 漏洞 条款',
      'C# 参数化查询 SqlParameter',
      'GB/T 34946 SQL注入 数据库 示例',
    ],
    goals: [
      '理解字符串拼接SQL的危险性',
      '能识别 SqlCommand 中的注入点',
      '掌握 SqlParameter 参数化查询写法',
    ],
  },
  {
    id: 'csharp-xss-web',
    language: 'csharp',
    title: 'XSS与Web输出安全',
    summary: '理解 ASP.NET 中跨站脚本的攻击路径，掌握输出编码和 Razor 的安全特性。',
    difficulty: 'beginner',
    estimatedMinutes: 18,
    vulnerabilityFocus: 'XSS',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# XSS 跨站脚本 漏洞 条款',
      'C# 输出编码 HTML转义 ASP.NET',
      'GB/T 34946 跨站脚本 Web安全 示例',
    ],
    goals: [
      '理解 C# Web 应用中 XSS 的攻击路径',
      '能识别 @Html.Raw() 等绕过编码的危险用法',
      '掌握 Razor 自动编码和手动编码的区别',
    ],
  },
  {
    id: 'csharp-serialization',
    language: 'csharp',
    title: '序列化安全与类型控制',
    summary: '理解 BinaryFormatter、JSON 反序列化等场景的安全风险和防护方法。',
    difficulty: 'intermediate',
    estimatedMinutes: 18,
    vulnerabilityFocus: '反序列化',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# 反序列化 漏洞 条款',
      'C# BinaryFormatter 序列化安全',
      'GB/T 34946 反序列化 示例',
    ],
    goals: [
      '理解 BinaryFormatter 为什么被标记为危险',
      '能识别不安全的反序列化代码模式',
      '了解安全的序列化替代方案',
    ],
  },
  {
    id: 'csharp-crypto',
    language: 'csharp',
    title: '加密与凭证管理',
    summary: '理解 C# 中的加密误用：硬编码密钥、弱哈希算法、明文存储凭证。',
    difficulty: 'intermediate',
    estimatedMinutes: 18,
    vulnerabilityFocus: '密码安全',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# 加密 密码安全 条款',
      'C# 硬编码密钥 弱加密 漏洞',
      'GB/T 34946 加密 凭证管理 示例',
    ],
    goals: [
      '能识别硬编码密码和密钥的代码',
      '了解 MD5/SHA1 为什么不适合密码存储',
      '掌握安全凭证管理的基本原则',
    ],
  },
  {
    id: 'csharp-file-path',
    language: 'csharp',
    title: '文件与路径安全',
    summary: '理解 C# 中路径遍历、任意文件操作的攻击方式和防护手段。',
    difficulty: 'intermediate',
    estimatedMinutes: 16,
    vulnerabilityFocus: '路径遍历',
    standard: 'GB/T 34946-2017',
    searchQueries: [
      'C# 路径遍历 漏洞 条款',
      'C# 文件操作 安全编码',
      'GB/T 34946 路径遍历 文件安全 示例',
    ],
    goals: [
      '理解 Path.Combine 不能防止路径遍历',
      '能识别用户输入直接参与文件路径构造的代码',
      '掌握 Path.GetFullPath + 白名单目录校验的方法',
    ],
  },
];

export function getLearningTopic(topicId: string): LearningTopic | undefined {
  return LEARNING_TOPICS.find((topic) => topic.id === topicId);
}

export function getLearningTopicsByLanguage(language: LearningTopicLanguage): LearningTopic[] {
  return LEARNING_TOPICS.filter((topic) => topic.language === language);
}

export function findRelatedLearningTopics(params: {
  language?: string;
  vulnerabilityType?: string;
  standardReference?: string;
  limit?: number;
  topics?: LearningTopic[];
}): LearningTopic[] {
  const normalizedLanguage = normalizeLanguage(params.language);
  const normalizedVulnerability = normalizeText(params.vulnerabilityType || '');
  const clauseNumber = extractClauseNumber(params.standardReference);
  const sourceTopics = params.topics || LEARNING_TOPICS;
  const candidateTopics = sourceTopics.filter((topic) => !normalizedLanguage || topic.language === normalizedLanguage);

  const clauseMatchedTopics = clauseNumber
    ? candidateTopics
        .map((topic) => ({
          topic,
          score: calculateClauseScore(topic, clauseNumber),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
    : [];

  if (clauseMatchedTopics.length > 0) {
    return clauseMatchedTopics.slice(0, params.limit || 3).map((item) => item.topic);
  }

  const scoredTopics = candidateTopics
    .map((topic) => ({
      topic,
      score: calculateTopicScore(topic, normalizedVulnerability),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredTopics.length > 0) {
    return scoredTopics.slice(0, params.limit || 3).map((item) => item.topic);
  }

  return candidateTopics.slice(0, params.limit || 3);
}

function calculateClauseScore(topic: LearningTopic, clauseNumber: string): number {
  const dynamicTopic = isDynamicTopic(topic) ? topic : null;
  const subClauses = dynamicTopic?.subClauses || STATIC_FALLBACK_CLAUSES[topic.id]?.subClauses || [];
  const clausePrefix = dynamicTopic?.clausePrefix || STATIC_FALLBACK_CLAUSES[topic.id]?.clausePrefix || '';

  if (subClauses.some((subClause) => subClause.clause === clauseNumber)) {
    return 100;
  }

  if (clausePrefix && isClauseInPrefix(clauseNumber, clausePrefix)) {
    return 80;
  }

  return 0;
}

function isClauseInPrefix(clauseNumber: string, clausePrefix: string): boolean {
  return clauseNumber === clausePrefix || clauseNumber.startsWith(`${clausePrefix}.`);
}

function extractClauseNumber(standardReference?: string): string {
  return standardReference?.match(/\b\d+(?:\.\d+)+\b/)?.[0] || '';
}

function calculateTopicScore(topic: LearningTopic, normalizedVulnerability: string): number {
  if (!normalizedVulnerability) {
    return 0;
  }

  const normalizedFocus = normalizeText(topic.vulnerabilityFocus);
  const normalizedTitle = normalizeText(topic.title);
  const normalizedSummary = normalizeText(topic.summary);
  const queryMatches = topic.searchQueries.map((query) => normalizeText(query));

  let score = 0;
  if (normalizedVulnerability.includes(normalizedFocus) || normalizedFocus.includes(normalizedVulnerability)) {
    score += 6;
  }
  if (normalizedTitle.includes(normalizedVulnerability) || normalizedVulnerability.includes(normalizedTitle)) {
    score += 4;
  }
  if (normalizedSummary.includes(normalizedVulnerability)) {
    score += 2;
  }
  if (queryMatches.some((query) => query.includes(normalizedVulnerability) || normalizedVulnerability.includes(query))) {
    score += 3;
  }

  return score;
}

function normalizeLanguage(language?: string): LearningTopicLanguage | undefined {
  const value = (language || '').toLowerCase();
  if (value.includes('java')) return 'java';
  if (value.includes('c++') || value === 'c' || value === 'cpp') return 'cpp';
  if (value.includes('c#') || value.includes('csharp')) return 'csharp';
  return undefined;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s\-_/()（）,，.:：]/g, '');
}

// ——— 硬编码章节的条款元数据（当文档提取失败时用于回退渲染） ———

export const STATIC_FALLBACK_CLAUSES: Record<string, {
  clausePrefix: string;
  subClauses: Array<{ clause: string; title: string }>;
}> = {
  'cpp-behavioral': {
    clausePrefix: '6.2.1',
    subClauses: [{ clause: '6.2.1.1', title: '不可控的内存分配' }],
  },
  'cpp-path-errors': {
    clausePrefix: '6.2.2',
    subClauses: [{ clause: '6.2.2.1', title: '不可信的搜索路径' }],
  },
  'cpp-data-processing': {
    clausePrefix: '6.2.3',
    subClauses: [
      { clause: '6.2.3.1', title: '相对路径遍历' },
      { clause: '6.2.3.2', title: '绝对路径遍历' },
      { clause: '6.2.3.3', title: '命令注入' },
      { clause: '6.2.3.4', title: 'SQL注入' },
      { clause: '6.2.3.5', title: '代码注入' },
      { clause: '6.2.3.6', title: '进程控制' },
      { clause: '6.2.3.7', title: '缓冲区溢出' },
      { clause: '6.2.3.8', title: '格式化字符串' },
      { clause: '6.2.3.9', title: '整数溢出' },
      { clause: '6.2.3.10', title: '使用有风险的函数' },
      { clause: '6.2.3.11', title: '空指针解引用' },
      { clause: '6.2.3.12', title: '释放后使用' },
    ],
  },
  'cpp-api-misuse': {
    clausePrefix: '6.2.4',
    subClauses: [{ clause: '6.2.4.1', title: '未检查堆API返回值' }],
  },
  'cpp-poor-code': {
    clausePrefix: '6.2.5',
    subClauses: [{ clause: '6.2.5.1', title: '未使用的变量' }],
  },
  'cpp-encapsulation': {
    clausePrefix: '6.2.6',
    subClauses: [
      { clause: '6.2.6.1', title: '可序列化的类包含敏感数据' },
      { clause: '6.2.6.2', title: '违反信任边界' },
    ],
  },
  'cpp-security-features': {
    clausePrefix: '6.2.7',
    subClauses: [
      { clause: '6.2.7.1', title: '明文存储口令' },
      { clause: '6.2.7.2', title: '存储可恢复的口令' },
      { clause: '6.2.7.3', title: '口令硬编码' },
      { clause: '6.2.7.4', title: '依赖referer字段进行身份鉴别' },
      { clause: '6.2.7.5', title: 'Cookie中的敏感信息明文存储' },
      { clause: '6.2.7.6', title: '敏感信息明文传输' },
      { clause: '6.2.7.7', title: '不安全的随机数' },
      { clause: '6.2.7.8', title: '弱加密' },
      { clause: '6.2.7.9', title: '硬编码加密密钥' },
      { clause: '6.2.7.10', title: '不充分的加密强度' },
      { clause: '6.2.7.11', title: '存在后门' },
      { clause: '6.2.7.12', title: '敏感信息泄露' },
      { clause: '6.2.7.13', title: '空的密码' },
      { clause: '6.2.7.14', title: '使用硬编码的安全相关常量' },
    ],
  },
  'cpp-web-issues': {
    clausePrefix: '6.2.8',
    subClauses: [{ clause: '6.2.8.1', title: '跨站脚本' }],
  },
};

// ——— 动态章节（基于文档结构） ———

export interface DynamicLearningTopic extends LearningTopic {
  /** 条款编号前缀，如 "6.2.3"，用于按章节检索文档内容 */
  clausePrefix: string;
  /** 所属文档 ID */
  docId: string;
  /** 子条款列表（条款号 + 标题） */
  subClauses: Array<{ clause: string; title: string }>;
  /** 是否来自文档结构（true=动态，false=硬编码回退） */
  fromDocument: boolean;
  /** 内容来源：文档章节驱动 or 检索回退 */
  contentSource: LearningContentSource;
  /** 学习中心分组：主线章节 or 附录/案例章节 */
  topicGroup: 'core' | 'supplemental';
}

/**
 * 判断一个 topic 是否为动态生成的（有条款前缀）
 */
export function isDynamicTopic(topic: LearningTopic): topic is DynamicLearningTopic {
  return 'clausePrefix' in topic && Boolean((topic as DynamicLearningTopic).clausePrefix);
}
